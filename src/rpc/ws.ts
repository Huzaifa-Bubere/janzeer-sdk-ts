/**
 * JSON-RPC 2.0 over the node's WebSocket (`/rpc/ws`): the same methods as HTTP plus live subscriptions
 * (`newBlocks`, `addressActivity`). Uses the global `WebSocket` (browsers, Node ≥ 22, Deno, Bun); on older Node
 * pass the `ws` package via `{ WebSocket }`.
 * @module
 */
import { LIMITS } from '../constants.js';
import { NetworkError, rpcErrorFrom } from '../errors.js';
import { parseJson, toPlain, type JsonValue } from '../json.js';
import { RpcMethods } from './methods.js';
import { mapBlockView, mapTxView, type BlockView, type TxView } from './types.js';

/** Minimal WebSocket constructor shape (browser `WebSocket` and `ws` both satisfy it). */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (ev: any) => void): void;
  removeEventListener?(type: string, listener: (ev: any) => void): void;
}
export type WebSocketCtor = new (url: string) => WebSocketLike;

export interface WsOptions {
  /** WebSocket implementation (default `globalThis.WebSocket`) */
  WebSocket?: WebSocketCtor;
  /** reconnect with exponential backoff and re-issue every live subscription (default `true`) */
  reconnect?: boolean;
  /** first backoff delay (default 1000 ms; doubles up to 30 s) */
  reconnectDelayMs?: number;
  /** per-call timeout (default 65 000 ms) */
  timeoutMs?: number;
  /** connect timeout (default 10 000 ms) */
  connectTimeoutMs?: number;
  /** called on every close/reconnect/error (diagnostics) */
  onEvent?: (ev: WsEvent) => void;
}
export type WsEvent = { type: 'open' } | { type: 'close'; code?: number; reason?: string; willReconnect: boolean } | { type: 'error'; error: unknown } | { type: 'resubscribed'; count: number };

export type SubscriptionKind = 'newBlocks' | 'addressActivity';

export interface NewBlocksParams {
  /** replay committed blocks from this height, then stream live ones (exactly-once by height) */
  fromHeight?: number;
  includeTransactions?: boolean;
}
export interface AddressActivityEvent {
  blockHeight: number;
  blockHash: string;
  transaction: TxView;
}

export interface Subscription {
  /** the node's subscription id (changes after a reconnect) */
  readonly id: string;
  readonly kind: SubscriptionKind;
  unsubscribe(): Promise<boolean>;
}

interface Pending {
  resolve: (v: JsonValue) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
interface LiveSub {
  id: string;
  kind: SubscriptionKind;
  params: unknown;
  handler: (payload: JsonValue) => void;
}

export class JanzeerRpcWs extends RpcMethods {
  readonly url: string;
  #ws: WebSocketLike | null = null;
  #ctor: WebSocketCtor;
  #opts: Required<Pick<WsOptions, 'reconnect' | 'reconnectDelayMs' | 'timeoutMs' | 'connectTimeoutMs'>> & { onEvent?: WsOptions['onEvent'] };
  #pending = new Map<number, Pending>();
  #subs = new Map<string, LiveSub>();
  #id = 0;
  #closedByUser = false;
  #backoff: number;
  #connecting: Promise<void> | null = null;

  private constructor(url: string, opts: WsOptions) {
    super();
    this.url = normalizeWsUrl(url);
    const ctor = opts.WebSocket ?? (globalThis as any).WebSocket;
    if (!ctor) throw new NetworkError('no WebSocket implementation: pass { WebSocket } (e.g. from the "ws" package on Node < 22)');
    this.#ctor = ctor;
    this.#opts = { reconnect: opts.reconnect ?? true, reconnectDelayMs: opts.reconnectDelayMs ?? 1000, timeoutMs: opts.timeoutMs ?? 65_000, connectTimeoutMs: opts.connectTimeoutMs ?? 10_000, onEvent: opts.onEvent };
    this.#backoff = this.#opts.reconnectDelayMs;
  }

  /** Open a socket; resolves once connected. @param url `ws://host:7019/rpc/ws` (an `http(s)://` origin is converted) */
  static async connect(url: string, opts: WsOptions = {}): Promise<JanzeerRpcWs> {
    const c = new JanzeerRpcWs(url, opts);
    await c.#open();
    return c;
  }

  get connected(): boolean {
    return this.#ws?.readyState === 1;
  }

  async call(method: string, params?: unknown): Promise<JsonValue> {
    await this.#ensureOpen();
    const id = ++this.#id;
    return new Promise<JsonValue>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new NetworkError(`RPC ${method} timed out after ${this.#opts.timeoutMs} ms`));
      }, this.#opts.timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      try {
        this.#ws!.send(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }));
      } catch (e) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(new NetworkError('send failed', { cause: e }));
      }
    });
  }

  /** Stream committed blocks (optionally replaying from `fromHeight`). */
  subscribeNewBlocks(params: NewBlocksParams, handler: (block: BlockView) => void): Promise<Subscription> {
    return this.#subscribe('newBlocks', params, (p) => handler(mapBlockView(p)));
  }
  /** Notify when a final transaction involves any of `addresses` (sender, recipient or token recipient). */
  subscribeAddressActivity(addresses: string[], handler: (ev: AddressActivityEvent) => void): Promise<Subscription> {
    if (addresses.length === 0 || addresses.length > LIMITS.watchedAddresses) throw new RangeError(`1–${LIMITS.watchedAddresses} addresses`);
    return this.#subscribe('addressActivity', { addresses: addresses.map((a) => a.toLowerCase()) }, (p) => {
      const o = p as { [k: string]: JsonValue };
      handler({ blockHeight: Number(String(o.blockHeight)), blockHash: String(o.blockHash), transaction: mapTxView(o.transaction!) });
    });
  }

  /** Close the socket; no reconnect. Pending calls reject, subscriptions are dropped. */
  close(): void {
    this.#closedByUser = true;
    this.#subs.clear();
    this.#ws?.close(1000, 'client closed');
    this.#ws = null;
    this.#failPending(new NetworkError('socket closed by client'));
  }

  async #subscribe(kind: SubscriptionKind, params: unknown, handler: (p: JsonValue) => void): Promise<Subscription> {
    if (this.#subs.size >= LIMITS.subscriptionsPerSession) throw new RangeError(`at most ${LIMITS.subscriptionsPerSession} subscriptions per session`);
    const id = String(await this.call('janzeer_subscribe', { kind, params }));
    const live: LiveSub = { id, kind, params, handler };
    this.#subs.set(id, live);
    const unsubscribe = async (): Promise<boolean> => {
      this.#subs.delete(live.id);
      if (!this.connected) return true;
      return this.unsubscribeRaw(live.id).catch(() => false);
    };
    return {
      get id() {
        return live.id;
      },
      kind,
      unsubscribe,
    };
  }

  #ensureOpen(): Promise<void> {
    if (this.connected) return Promise.resolve();
    if (this.#closedByUser) return Promise.reject(new NetworkError('socket closed by client'));
    return this.#open();
  }

  #open(): Promise<void> {
    if (this.#connecting) return this.#connecting;
    this.#connecting = new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new this.#ctor(this.url);
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          reject(new NetworkError(`WebSocket connect to ${this.url} timed out`));
        }
      }, this.#opts.connectTimeoutMs);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        this.#ws = ws;
        this.#backoff = this.#opts.reconnectDelayMs;
        this.#opts.onEvent?.({ type: 'open' });
        if (!settled) {
          settled = true;
          resolve();
        }
        void this.#resubscribe();
      });
      ws.addEventListener('message', (ev: { data: unknown }) => this.#onMessage(typeof ev.data === 'string' ? ev.data : String(ev.data)));
      ws.addEventListener('error', (ev: unknown) => {
        this.#opts.onEvent?.({ type: 'error', error: ev });
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new NetworkError(`WebSocket error connecting to ${this.url}`));
        }
      });
      ws.addEventListener('close', (ev: { code?: number; reason?: string }) => {
        clearTimeout(timer);
        if (this.#ws === ws) this.#ws = null;
        const willReconnect = this.#opts.reconnect && !this.#closedByUser;
        this.#opts.onEvent?.({ type: 'close', code: ev?.code, reason: ev?.reason, willReconnect });
        this.#failPending(new NetworkError(`socket closed (${ev?.code ?? '?'})`));
        if (!settled) {
          settled = true;
          reject(new NetworkError(`WebSocket to ${this.url} closed before opening (${ev?.code ?? '?'})`));
        }
        if (willReconnect) this.#scheduleReconnect();
      });
    }).finally(() => {
      this.#connecting = null;
    });
    return this.#connecting;
  }

  #scheduleReconnect() {
    const delay = this.#backoff;
    this.#backoff = Math.min(this.#backoff * 2, 30_000);
    setTimeout(() => {
      if (this.#closedByUser || this.connected) return;
      this.#open().catch(() => {
        /* the close handler schedules the next attempt */
      });
    }, delay);
  }

  async #resubscribe() {
    const old = [...this.#subs.values()];
    if (old.length === 0) return;
    this.#subs.clear();
    let count = 0;
    for (const s of old) {
      try {
        const id = String(await this.call('janzeer_subscribe', { kind: s.kind, params: s.params }));
        s.id = id;
        this.#subs.set(id, s);
        count++;
      } catch (e) {
        this.#opts.onEvent?.({ type: 'error', error: e });
      }
    }
    if (count) this.#opts.onEvent?.({ type: 'resubscribed', count });
  }

  #onMessage(text: string) {
    let msg: JsonValue;
    try {
      msg = parseJson(text);
    } catch {
      return;
    }
    const items = Array.isArray(msg) ? msg : [msg];
    for (const m of items) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
      const o = m as { [k: string]: JsonValue };
      if (o.method === 'janzeer_subscription' && o.params && typeof o.params === 'object') {
        const p = o.params as { [k: string]: JsonValue };
        const sub = this.#subs.get(String(p.subscription));
        if (sub && p.result !== undefined) {
          try {
            sub.handler(p.result);
          } catch (e) {
            this.#opts.onEvent?.({ type: 'error', error: e });
          }
        }
        continue;
      }
      if (o.id === undefined || o.id === null) continue;
      const id = Number(String(o.id));
      const pending = this.#pending.get(id);
      if (!pending) continue;
      this.#pending.delete(id);
      clearTimeout(pending.timer);
      if (o.error) pending.reject(rpcErrorFrom(toPlain(o.error) as any, 'ws'));
      else pending.resolve(o.result ?? null);
    }
  }

  #failPending(err: Error) {
    for (const [, p] of this.#pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.#pending.clear();
  }
}

export function normalizeWsUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '').replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  u = u.replace(/\/api\/v1$/, '').replace(/\/rpc$/, '');
  if (!/\/rpc\/ws$/.test(u)) u += '/rpc/ws';
  return u;
}
