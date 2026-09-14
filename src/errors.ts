/**
 * Error hierarchy. Every error thrown by the SDK extends {@link JanzeerError}. A transaction the node refuses is a
 * {@link TxRejectedError} whichever transport carried it (REST 400 with a `type`, or JSON-RPC `-32001`), and a
 * nonce problem is always a {@link NonceMismatchError}, so callers branch on `instanceof`, never on strings.
 * @module
 */

/** The node's `ExceptionType` names on transaction rejections. */
export type ExceptionType =
  | 'INCORRECT_HASH'
  | 'INCORRECT_ADDRESS'
  | 'INCORRECT_PROMOTER_KEY'
  | 'ALREADY_PROMOTER'
  | 'INSUFFICIENT_BALANCE'
  | 'INSUFFICIENT_ACTUAL_BALANCE'
  | 'INCORRECT_SIGNATURE'
  | 'INVALID_NONCE'
  | 'INVALID_CONTRACT'
  | 'CONTRACT_METHOD_NOT_EXISTS'
  | 'UNKNOWN';

export type Transport = 'rest' | 'rpc' | 'ws';

export class JanzeerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The node could not be reached, the response was not JSON, or the socket died. */
export class NetworkError extends JanzeerError {}

/** The node refused a transaction at intake (validation / mempool rule). */
export class TxRejectedError extends JanzeerError {
  readonly type: ExceptionType;
  constructor(
    message: string,
    /** the node's `ExceptionType`, or `UNKNOWN` */
    type: string | null | undefined,
    readonly transport: Transport,
    /** HTTP status (REST) */
    readonly httpStatus?: number,
    /** JSON-RPC error code (`-32001`) */
    readonly rpcCode?: number,
  ) {
    super(message);
    this.type = (type as ExceptionType) ?? 'UNKNOWN';
    this.rawType = type ?? null;
  }
  /** the type string exactly as received (a newer node may add values) */
  readonly rawType: string | null;
}

const NONCE_RE = /Invalid nonce for (0x[0-9a-fA-F]{40}): expected (\d+), got (\d+)/;

/** The transaction's nonce is not the sender's next nonce: refresh it (`client.nonce(address)`) and rebuild. */
export class NonceMismatchError extends TxRejectedError {
  constructor(message: string, readonly address: string | null, readonly expected: number | null, readonly got: number | null, transport: Transport, httpStatus?: number, rpcCode?: number) {
    super(message, 'INVALID_NONCE', transport, httpStatus, rpcCode);
  }
  /** Build from a node message; returns `null` when the message is not a nonce mismatch. */
  static fromMessage(message: string, transport: Transport, httpStatus?: number, rpcCode?: number): NonceMismatchError | null {
    const m = NONCE_RE.exec(message);
    if (!m) return null;
    return new NonceMismatchError(message, m[1]!.toLowerCase(), Number(m[2]), Number(m[3]), transport, httpStatus, rpcCode);
  }
}

/** Any other REST error (`{status, message, type?}` payload). */
export class ApiError extends JanzeerError {
  constructor(
    readonly status: number,
    message: string,
    /** `type` of the error payload, if any */
    readonly type: string | null = null,
    /** the parsed error payload (object, array or null) */
    readonly body: unknown = null,
  ) {
    super(message);
  }
}
/** Request-body validation failed (400 with an array of `{message}`). */
export class ValidationError extends ApiError {
  constructor(readonly messages: string[], body: unknown) {
    super(400, messages.join('; ') || 'validation failed', null, body);
  }
}
export class NotFoundError extends ApiError {}
/** The node is still syncing (REST 400 "Blockchain is synchronizing" / RPC `-32002`); retry shortly. */
export class NotSynchronizedError extends JanzeerError {
  constructor(message: string, readonly transport: Transport) {
    super(message);
  }
}
/** HTTP 429 / RPC `-32004`; `retryAfterMs` from the `Retry-After` header (default 1000). */
export class RateLimitedError extends JanzeerError {
  constructor(message: string, readonly retryAfterMs: number, readonly transport: Transport) {
    super(message);
  }
}

/** JSON-RPC error that is not a transaction rejection. */
export class RpcError extends JanzeerError {
  constructor(readonly code: number, message: string, readonly data: unknown = null) {
    super(message);
  }
}
/** `-32602` — the SDK sent something the node could not bind (`data` lists field messages). */
export class RpcInvalidParamsError extends RpcError {}
/** `-32000` — block / transaction / token / validator does not exist. */
export class RpcNotFoundError extends RpcError {}
/** `-32003` — a range or timeout exceeds the server cap. */
export class RpcLimitError extends RpcError {}
/** `-32601` */
export class RpcMethodNotFoundError extends RpcError {}

export const RpcCodes = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  NOT_FOUND: -32000,
  REJECTED: -32001,
  NOT_SYNCHRONIZED: -32002,
  LIMIT: -32003,
  RATE_LIMITED: -32004,
});

/** Map a JSON-RPC `error` object to the SDK error hierarchy. */
export function rpcErrorFrom(err: { code: number; message?: string; data?: any }, transport: Transport = 'rpc'): JanzeerError {
  const message = err.message ?? `RPC error ${err.code}`;
  switch (err.code) {
    case RpcCodes.REJECTED: {
      const type = err.data && typeof err.data === 'object' ? (err.data.type as string | undefined) : undefined;
      return NonceMismatchError.fromMessage(message, transport, undefined, err.code) ?? (type === 'INVALID_NONCE' ? new NonceMismatchError(message, null, null, null, transport, undefined, err.code) : new TxRejectedError(message, type, transport, undefined, err.code));
    }
    case RpcCodes.NOT_SYNCHRONIZED:
      return new NotSynchronizedError(message, transport);
    case RpcCodes.RATE_LIMITED:
      return new RateLimitedError(message, 1000, transport);
    case RpcCodes.INVALID_PARAMS:
      return new RpcInvalidParamsError(err.code, message, err.data);
    case RpcCodes.NOT_FOUND:
      return new RpcNotFoundError(err.code, message, err.data);
    case RpcCodes.LIMIT:
      return new RpcLimitError(err.code, message, err.data);
    case RpcCodes.METHOD_NOT_FOUND:
      return new RpcMethodNotFoundError(err.code, message, err.data);
    default:
      return new RpcError(err.code, message, err.data);
  }
}

/**
 * Map a non-2xx REST response to the SDK error hierarchy. `body` is the parsed JSON (plain values) or `null`.
 * Rule: if the body has `payload` use it (the envelope wraps errors too); otherwise the body itself (the rate
 * limiter writes flat `{status, message}` before the envelope layer).
 */
export function restErrorFrom(status: number, body: any, headers?: { get(name: string): string | null }): JanzeerError {
  const p = body && typeof body === 'object' && 'payload' in body ? body.payload : body;
  if (status === 429) {
    const ra = Number(headers?.get('Retry-After') ?? '1');
    return new RateLimitedError(p?.message ?? 'Rate limit exceeded', (Number.isFinite(ra) ? ra : 1) * 1000, 'rest');
  }
  if (Array.isArray(p)) return new ValidationError(p.map((x) => (x && typeof x === 'object' && 'message' in x ? String(x.message) : String(x))), p);
  const message: string = (p && typeof p === 'object' && typeof p.message === 'string' && p.message) || `Request failed (${status})`;
  const type: string | null = p && typeof p === 'object' && typeof p.type === 'string' ? p.type : null;
  if (status === 404) return new NotFoundError(status, message, type, p);
  if (status === 400) {
    if (message === 'Blockchain is synchronizing') return new NotSynchronizedError(message, 'rest');
    const nonce = NonceMismatchError.fromMessage(message, 'rest', status);
    if (nonce) return nonce;
    if (type === 'INVALID_NONCE') return new NonceMismatchError(message, null, null, null, 'rest', status);
    if (type) return new TxRejectedError(message, type, 'rest', status);
  }
  return new ApiError(status, message, type, p);
}
