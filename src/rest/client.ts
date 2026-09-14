/** Typed client of the node's REST API (`/api/v1/`). @module */
import { NetworkError, RateLimitedError, restErrorFrom } from '../errors.js';
import { asObject, parseJson, toPlain, type JsonValue } from '../json.js';
import type { SignedTx } from '../tx/types.js';
import {
  mapDecimal, mapExitValidatorTx, mapExplorerInfo, mapGenesisBlock, mapInt, mapMainBlock, mapNodeInfo, mapNodeVersion, mapPage, mapReceipt,
  mapRegisterValidatorTx, mapRewardTx, mapToken, mapTokenBalance, mapTokenTx, mapTransferTx, mapValidator, mapValidatorView,
  type ExitValidatorTx, type ExplorerInfo, type GenesisBlock, type MainBlock, type NodeInfo, type NodeVersion, type Page, type PageQuery, type Receipt,
  type RegisterValidatorTx, type RewardTx, type Token, type TokenBalance, type TokenTx, type TransferTx, type Validator, type ValidatorView,
} from './models.js';

export interface ClientOptions {
  /** custom `fetch` (tests, proxies, Node < 18 polyfills) */
  fetch?: typeof fetch;
  /** per-request timeout (default 15 000 ms) */
  timeoutMs?: number;
  /** extra headers on every request */
  headers?: Record<string, string>;
  /** retry once after a 429 (`Retry-After`); default `true`. Safe: a resubmitted transaction is idempotent by hash. */
  retryOnRateLimit?: boolean;
}

/** The REST envelope metadata of the last successful call. */
export interface Envelope {
  timestamp: number;
  version: string;
}

/** Filter of the transaction lists: `address` = sender or recipient; `unconfirmed: true` = the mempool. */
export type TxQuery = PageQuery & { address?: string; unconfirmed?: boolean };
/** The typed response of {@link JanzeerClient.submit} for each transaction type. */
export type SubmitResult<T extends SignedTx> = T['type'] extends 'transfer' ? TransferTx : T['type'] extends 'token' ? TokenTx : T['type'] extends 'registerValidator' ? RegisterValidatorTx : ExitValidatorTx;

export class JanzeerClient {
  readonly baseUrl: string;
  /** envelope of the last successful response (`version` is the API version, e.g. `1.1.0`) */
  lastEnvelope: Envelope | null = null;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #headers: Record<string, string>;
  readonly #retry429: boolean;

  /** @param baseUrl e.g. `http://localhost:7019/api/v1/` (a missing `/api/v1/` suffix is added) */
  constructor(baseUrl: string, opts: ClientOptions = {}) {
    let u = baseUrl.trim().replace(/\/+$/, '');
    if (!/\/api\/v1$/.test(u)) u += '/api/v1';
    this.baseUrl = u + '/';
    this.#fetch = opts.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!this.#fetch) throw new NetworkError('no fetch implementation: pass { fetch } (Node < 18)');
    this.#timeoutMs = opts.timeoutMs ?? 15_000;
    this.#headers = { Accept: 'application/json', ...(opts.headers ?? {}) };
    this.#retry429 = opts.retryOnRateLimit ?? true;
  }

  // ---- low level -------------------------------------------------------------------------------------------

  /** `GET path?query` → the envelope `payload` (lossless JSON tree). `notFound` short-circuits a 404. */
  async get<T = JsonValue>(path: string, query?: Record<string, unknown>, opts: { notFound?: T } = {}): Promise<JsonValue | T> {
    return this.#request('GET', path + qs(query), undefined, opts);
  }

  /** `POST path` with a JSON body → the envelope `payload`. */
  async post(path: string, body: unknown): Promise<JsonValue> {
    return this.#request('POST', path, body, {}) as Promise<JsonValue>;
  }

  async #request<T>(method: string, path: string, body: unknown, opts: { notFound?: T }, attempt = 0): Promise<JsonValue | T> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.#timeoutMs);
    let res: Response;
    try {
      res = await this.#fetch(this.baseUrl + path.replace(/^\//, ''), {
        method,
        headers: body === undefined ? this.#headers : { ...this.#headers, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
      });
    } catch (e) {
      throw new NetworkError(`Cannot reach the node at ${this.baseUrl}: ${(e as Error).message}`, { cause: e });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 404 && 'notFound' in opts) return opts.notFound as T;
    const text = await res.text();
    let json: JsonValue | null = null;
    if (text) {
      try {
        json = parseJson(text);
      } catch (e) {
        if (res.ok) throw new NetworkError(`Node returned non-JSON (${res.status})`, { cause: e });
      }
    }
    if (!res.ok) {
      const err = restErrorFrom(res.status, json == null ? null : toPlain(json), res.headers);
      if (err instanceof RateLimitedError && this.#retry429 && attempt === 0) {
        await new Promise((r) => setTimeout(r, err.retryAfterMs));
        return this.#request(method, path, body, opts, 1);
      }
      throw err;
    }
    if (json && typeof json === 'object' && !Array.isArray(json) && 'payload' in json) {
      const env = asObject(json);
      this.lastEnvelope = { timestamp: Number(String(env.timestamp)), version: String(env.version) };
      return env.payload ?? null;
    }
    return json;
  }

  // ---- node -------------------------------------------------------------------------------------------------

  info(): Promise<NodeInfo> {
    return this.get('info').then(mapNodeInfo);
  }
  version(): Promise<NodeVersion> {
    return this.get('info/version').then(mapNodeVersion);
  }
  /** ms since the node started */
  uptime(): Promise<number> {
    return this.get('info/uptime').then(mapInt);
  }
  explorerInfo(): Promise<ExplorerInfo> {
    return this.get('explorer/info').then(mapExplorerInfo);
  }

  // ---- wallet -----------------------------------------------------------------------------------------------

  /** Spendable balance (committed − pending debits) as a decimal string; `"0"` for an unknown address. */
  balance(address: string): Promise<string> {
    return this.get('wallets/' + address, undefined, { notFound: '0' }).then((v) => (typeof v === 'string' ? v : mapDecimal(v as JsonValue)));
  }
  /** The next nonce to sign with (committed nonce + pending count); `0` for an unknown address. */
  nonce(address: string): Promise<number> {
    return this.get('wallets/' + address + '/nonce', undefined, { notFound: 0 }).then((v) => (typeof v === 'number' ? v : mapInt(v as JsonValue)));
  }
  /** Server-side address validation (shape + EIP-55). */
  async validateAddress(address: string): Promise<boolean> {
    try {
      await this.post('wallets/validateAddress', { address });
      return true;
    } catch (e) {
      if (e instanceof NetworkError) throw e;
      return false;
    }
  }

  // ---- transactions -----------------------------------------------------------------------------------------

  /** Submit a signed transaction (HTTP 201). Throws {@link TxRejectedError} / {@link NonceMismatchError} on refusal. */
  submit<T extends SignedTx>(tx: T): Promise<SubmitResult<T>> {
    return this.post(tx.restPath, tx.toRestBody()).then((v) => {
      switch (tx.type) {
        case 'transfer': return mapTransferTx(v) as SubmitResult<T>;
        case 'token': return mapTokenTx(v) as SubmitResult<T>;
        case 'registerValidator': return mapRegisterValidatorTx(v) as SubmitResult<T>;
        default: return mapExitValidatorTx(v) as SubmitResult<T>;
      }
    });
  }

  readonly transfers = {
    /** `address` = sender or recipient; `unconfirmed: true` lists the mempool instead of the ledger. */
    list: (q: TxQuery = {}): Promise<Page<TransferTx>> => this.get('transactions/transfers', txq(q), { notFound: null }).then((v) => mapPage(v, mapTransferTx)),
    get: (hash: string): Promise<TransferTx | null> => this.get('transactions/transfers/' + hash, undefined, { notFound: null }).then((v) => (v == null ? null : mapTransferTx(v))),
  };
  readonly validatorTxs = {
    list: (q: TxQuery & { nodeKey?: string } = {}): Promise<Page<RegisterValidatorTx>> => this.get('transactions/validators', { ...txq(q), nodeKey: q.nodeKey }, { notFound: null }).then((v) => mapPage(v, mapRegisterValidatorTx)),
    get: (hash: string): Promise<RegisterValidatorTx | null> => this.get('transactions/validators/' + hash, undefined, { notFound: null }).then((v) => (v == null ? null : mapRegisterValidatorTx(v))),
  };
  readonly exitValidatorTxs = {
    list: (q: TxQuery = {}): Promise<Page<ExitValidatorTx>> => this.get('transactions/exit-validators', txq(q), { notFound: null }).then((v) => mapPage(v, mapExitValidatorTx)),
    get: (hash: string): Promise<ExitValidatorTx | null> => this.get('transactions/exit-validators/' + hash, undefined, { notFound: null }).then((v) => (v == null ? null : mapExitValidatorTx(v))),
  };
  readonly tokenTxs = {
    list: (q: PageQuery & { tokenId?: string; unconfirmed?: boolean } = {}): Promise<Page<TokenTx>> => this.get('transactions/tokens', { ...pq(q), tokenId: q.tokenId, unconfirmed: q.unconfirmed || undefined }, { notFound: null }).then((v) => mapPage(v, mapTokenTx)),
    get: (hash: string): Promise<TokenTx | null> => this.get('transactions/tokens/' + hash, undefined, { notFound: null }).then((v) => (v == null ? null : mapTokenTx(v))),
  };
  readonly rewards = {
    /** `address` filters by recipient */
    list: (q: PageQuery & { address?: string } = {}): Promise<Page<RewardTx>> => this.get('transactions/rewards', { ...pq(q), address: q.address }, { notFound: null }).then((v) => mapPage(v, mapRewardTx)),
    get: (hash: string): Promise<RewardTx | null> => this.get('transactions/rewards/' + hash, undefined, { notFound: null }).then((v) => (v == null ? null : mapRewardTx(v))),
  };
  /** Execution receipt of a committed transaction (`null` if unknown or still pending). */
  receipt(hash: string): Promise<Receipt | null> {
    return this.get('transactions/' + hash + '/receipt', undefined, { notFound: null }).then((v) => (v == null ? null : mapReceipt(v)));
  }

  // ---- blocks -----------------------------------------------------------------------------------------------

  readonly blocks = {
    main: {
      list: (q: PageQuery = {}): Promise<Page<MainBlock>> => this.get('blocks/main', pq(q), { notFound: null }).then((v) => mapPage(v, mapMainBlock)),
      get: (hash: string): Promise<MainBlock | null> => this.get('blocks/main/' + hash, undefined, { notFound: null }).then((v) => (v == null ? null : mapMainBlock(v))),
      previous: (hash: string): Promise<MainBlock | null> => this.get('blocks/main/' + hash + '/previous', undefined, { notFound: null }).then((v) => (v == null ? null : mapMainBlock(v))),
      next: (hash: string): Promise<MainBlock | null> => this.get('blocks/main/' + hash + '/next', undefined, { notFound: null }).then((v) => (v == null ? null : mapMainBlock(v))),
    },
    genesis: {
      list: (q: PageQuery = {}): Promise<Page<GenesisBlock>> => this.get('blocks/genesis', pq(q), { notFound: null }).then((v) => mapPage(v, mapGenesisBlock)),
      get: (hash: string): Promise<GenesisBlock | null> => this.get('blocks/genesis/' + hash, undefined, { notFound: null }).then((v) => (v == null ? null : mapGenesisBlock(v))),
      previous: (hash: string): Promise<GenesisBlock | null> => this.get('blocks/genesis/' + hash + '/previous', undefined, { notFound: null }).then((v) => (v == null ? null : mapGenesisBlock(v))),
      next: (hash: string): Promise<GenesisBlock | null> => this.get('blocks/genesis/' + hash + '/next', undefined, { notFound: null }).then((v) => (v == null ? null : mapGenesisBlock(v))),
    },
  };

  // ---- validators / tokens ----------------------------------------------------------------------------------

  readonly validators = {
    /** every registered validator, registration order */
    list: (q: PageQuery = {}): Promise<Page<Validator>> => this.get('validators', pq(q), { notFound: null }).then((v) => mapPage(v, mapValidator)),
    /** the current epoch's producer set */
    active: (q: PageQuery = {}): Promise<Page<Validator>> => this.get('validators/active', pq(q), { notFound: null }).then((v) => mapPage(v, mapValidator)),
    view: (q: PageQuery = {}): Promise<Page<ValidatorView>> => this.get('validators/view', pq(q), { notFound: null }).then((v) => mapPage(v, mapValidatorView)),
  };
  readonly tokens = {
    list: (q: PageQuery = {}): Promise<Page<Token>> => this.get('tokens', pq(q), { notFound: null }).then((v) => mapPage(v, mapToken)),
    get: (tokenId: string): Promise<Token | null> => this.get('tokens/' + tokenId, undefined, { notFound: null }).then((v) => (v == null ? null : mapToken(v))),
    holders: (tokenId: string, q: PageQuery = {}): Promise<Page<TokenBalance>> => this.get('tokens/' + tokenId + '/holders', pq(q), { notFound: null }).then((v) => mapPage(v, mapTokenBalance)),
    balancesOf: (address: string, q: PageQuery = {}): Promise<Page<TokenBalance>> => this.get('tokens/balances/' + address, pq(q), { notFound: null }).then((v) => mapPage(v, mapTokenBalance)),
  };
}

function pq(q: PageQuery): Record<string, unknown> {
  return { page: q.page, size: q.size, sortBy: Array.isArray(q.sortBy) ? q.sortBy.join(',') : q.sortBy, sortDirection: q.sortDirection };
}
function txq(q: TxQuery): Record<string, unknown> {
  return { ...pq(q), address: q.address, unconfirmed: q.unconfirmed || undefined };
}
function qs(params?: Record<string, unknown>): string {
  if (!params) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.append(k, String(v));
  const s = p.toString();
  return s ? '?' + s : '';
}
