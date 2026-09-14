import { describe, expect, it } from 'vitest';
import { ApiError, NonceMismatchError, NotFoundError, NotSynchronizedError, RateLimitedError, restErrorFrom, rpcErrorFrom, RpcInvalidParamsError, RpcNotFoundError, TxRejectedError, ValidationError } from '../src/errors.js';

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? h[n.toLowerCase()] ?? null });

describe('REST error mapping', () => {
  it('enveloped nonce mismatch → NonceMismatchError (message form)', () => {
    const e = restErrorFrom(400, { timestamp: 1, version: '1.1.0', payload: { status: 400, message: 'Invalid nonce for 0x06e1c0fa9955a700876f8cb0acc7f13fba9fb8ba: expected 4, got 7', type: 'INVALID_NONCE' } });
    expect(e).toBeInstanceOf(NonceMismatchError);
    expect(e).toBeInstanceOf(TxRejectedError);
    const n = e as NonceMismatchError;
    expect(n.expected).toBe(4);
    expect(n.got).toBe(7);
    expect(n.address).toBe('0x06e1c0fa9955a700876f8cb0acc7f13fba9fb8ba');
    expect(n.type).toBe('INVALID_NONCE');
    expect(n.httpStatus).toBe(400);
  });
  it('typed rejection → TxRejectedError', () => {
    const e = restErrorFrom(400, { payload: { status: 400, message: 'Incorrect signature', type: 'INCORRECT_SIGNATURE' } }) as TxRejectedError;
    expect(e).toBeInstanceOf(TxRejectedError);
    expect(e.type).toBe('INCORRECT_SIGNATURE');
    expect(e.transport).toBe('rest');
  });
  it('unknown future type is preserved', () => {
    const e = restErrorFrom(400, { payload: { status: 400, message: 'x', type: 'SOMETHING_NEW' } }) as TxRejectedError;
    expect(e.type).toBe('SOMETHING_NEW');
    expect(e.rawType).toBe('SOMETHING_NEW');
  });
  it('bean-validation array → ValidationError', () => {
    const e = restErrorFrom(400, { payload: [{ message: 'must not be null' }, { message: 'must not be blank' }] }) as ValidationError;
    expect(e).toBeInstanceOf(ValidationError);
    expect(e.messages).toEqual(['must not be null', 'must not be blank']);
  });
  it('flat 429 (written before the envelope) → RateLimitedError with Retry-After', () => {
    const e = restErrorFrom(429, { status: 429, message: 'Rate limit exceeded' }, headers({ 'Retry-After': '2' })) as RateLimitedError;
    expect(e).toBeInstanceOf(RateLimitedError);
    expect(e.retryAfterMs).toBe(2000);
  });
  it('404 / synchronizing / generic', () => {
    expect(restErrorFrom(404, { payload: { status: 404, message: 'nope' } })).toBeInstanceOf(NotFoundError);
    expect(restErrorFrom(400, { payload: { status: 400, message: 'Blockchain is synchronizing' } })).toBeInstanceOf(NotSynchronizedError);
    const g = restErrorFrom(500, null) as ApiError;
    expect(g).toBeInstanceOf(ApiError);
    expect(g.status).toBe(500);
  });
});

describe('RPC error mapping', () => {
  it('-32001 with data.type → TxRejectedError / NonceMismatchError', () => {
    expect(rpcErrorFrom({ code: -32001, message: 'Incorrect signature', data: { type: 'INCORRECT_SIGNATURE' } })).toBeInstanceOf(TxRejectedError);
    const n = rpcErrorFrom({ code: -32001, message: 'Invalid nonce for 0x06e1c0fa9955a700876f8cb0acc7f13fba9fb8ba: expected 1, got 5', data: { type: 'INVALID_NONCE' } }) as NonceMismatchError;
    expect(n).toBeInstanceOf(NonceMismatchError);
    expect(n.expected).toBe(1);
    expect(n.rpcCode).toBe(-32001);
    expect(n.transport).toBe('rpc');
  });
  it('other codes', () => {
    expect(rpcErrorFrom({ code: -32602, message: 'bad', data: ['amount: must not be null'] })).toBeInstanceOf(RpcInvalidParamsError);
    expect(rpcErrorFrom({ code: -32000, message: 'missing' })).toBeInstanceOf(RpcNotFoundError);
    expect(rpcErrorFrom({ code: -32002, message: 'sync' })).toBeInstanceOf(NotSynchronizedError);
    expect(rpcErrorFrom({ code: -32004, message: 'slow down' })).toBeInstanceOf(RateLimitedError);
  });
});
