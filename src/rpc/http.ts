/** JSON-RPC 2.0 over HTTP (`POST /rpc`). @module */
import { NetworkError, RateLimitedError, rpcErrorFrom, RpcError } from '../errors.js';
import { parseJson, toPlain, type JsonValue } from '../json.js';
import { RpcMethods } from './methods.js';

export interface RpcOptions {
  fetch?: typeof fetch;
  /** default 65 000 ms (above the node's 60 s `waitForFinality` cap) */
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** retry once after a 429; default `true` */
  retryOnRateLimit?: boolean;
}

export interface BatchRequest {
  method: string;
  params?: unknown;
}
/** One batch outcome: the mapped result or the mapped error (never throws for a single failed entry). */
export type BatchResult = { ok: true; result: JsonValue } | { ok: false; error: Error };

export class JanzeerRpc extends RpcMethods {
  readonly url: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #headers: Record<string, string>;
  readonly #retry429: boolean;
  #id = 0;

  /** @param url `http://host:7019/rpc` (a bare origin or an `/api/v1` base is rewritten to `/rpc`) */
  constructor(url: string, opts: RpcOptions = {}) {
    super();
    this.url = normalizeRpcUrl(url);
    this.#fetch = opts.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!this.#fetch) throw new NetworkError('no fetch implementation: pass { fetch } (Node < 18)');
    this.#timeoutMs = opts.timeoutMs ?? 65_000;
    this.#headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers ?? {}) };
    this.#retry429 = opts.retryOnRateLimit ?? true;
  }

  async call(method: string, params?: unknown): Promise<JsonValue> {
    const id = ++this.#id;
    const body = await this.#post({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
    if (Array.isArray(body) || !body || typeof body !== 'object') throw new NetworkError('malformed JSON-RPC response');
    const o = body as { [k: string]: JsonValue };
    if (o.error) throw rpcErrorFrom(toPlain(o.error) as { code: number; message?: string; data?: unknown });
    return o.result ?? null;
  }

  /** Send several requests in one HTTP round trip (node cap: 50). Results come back in request order. */
  async batch(requests: BatchRequest[]): Promise<BatchResult[]> {
    if (requests.length === 0) return [];
    const ids = requests.map(() => ++this.#id);
    const body = await this.#post(requests.map((r, i) => ({ jsonrpc: '2.0', id: ids[i], method: r.method, ...(r.params === undefined ? {} : { params: r.params }) })));
    if (!Array.isArray(body)) {
      // a batch-level error (e.g. -32600 "Batch too large") comes back as a single object
      const o = body as { [k: string]: JsonValue } | null;
      const err = o?.error ? rpcErrorFrom(toPlain(o.error) as any) : new NetworkError('malformed JSON-RPC batch response');
      throw err;
    }
    const byId = new Map<number, { [k: string]: JsonValue }>();
    for (const item of body) if (item && typeof item === 'object' && !Array.isArray(item)) byId.set(Number(String((item as any).id)), item as any);
    return ids.map((id) => {
      const r = byId.get(id);
      if (!r) return { ok: false, error: new RpcError(-32603, 'missing batch response') };
      if (r.error) return { ok: false, error: rpcErrorFrom(toPlain(r.error) as any) };
      return { ok: true, result: r.result ?? null };
    });
  }

  async #post(payload: unknown, attempt = 0): Promise<JsonValue | null> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.#timeoutMs);
    let res: Response;
    try {
      res = await this.#fetch(this.url, { method: 'POST', headers: this.#headers, body: JSON.stringify(payload), signal: ctl.signal });
    } catch (e) {
      throw new NetworkError(`Cannot reach the node at ${this.url}: ${(e as Error).message}`, { cause: e });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    if (res.status === 204 || !text) return null;
    let json: JsonValue;
    try {
      json = parseJson(text);
    } catch (e) {
      throw new NetworkError(`Node returned non-JSON (${res.status})`, { cause: e });
    }
    // 429 / 413 carry a JSON-RPC error body already; map 429 for the retry
    if (res.status === 429) {
      const ra = Number(res.headers.get('Retry-After') ?? '1');
      const err = new RateLimitedError('Rate limit exceeded', (Number.isFinite(ra) ? ra : 1) * 1000, 'rpc');
      if (this.#retry429 && attempt === 0) {
        await new Promise((r) => setTimeout(r, err.retryAfterMs));
        return this.#post(payload, 1);
      }
      throw err;
    }
    return json;
  }
}

export function normalizeRpcUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  u = u.replace(/\/api\/v1$/, '');
  if (!/\/rpc$/.test(u)) u += '/rpc';
  return u;
}
