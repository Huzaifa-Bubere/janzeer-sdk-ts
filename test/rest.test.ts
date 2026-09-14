import { describe, expect, it } from 'vitest';
import { Account, JanzeerClient, NonceMismatchError, TxBuilder, TxRejectedError, ValidationError } from '../src/index.js';

const env = (payload: unknown) => JSON.stringify({ timestamp: 1757800000000, version: '1.1.0', payload });
type Route = (url: URL, init: RequestInit) => Response;
const mock = (routes: Record<string, Route>) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (input: any, init: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), init });
    const key = `${init.method ?? 'GET'} ${url.pathname}`;
    const r = routes[key];
    if (!r) return new Response(env({ status: 404, message: 'no route ' + key }), { status: 404 });
    return r(url, init);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
};

describe('JanzeerClient', () => {
  it('normalizes the base url and unwraps the envelope losslessly', async () => {
    const m = mock({ 'GET /api/v1/wallets/0xabc': () => new Response(env(123456789.12345678)) });
    const c = new JanzeerClient('http://node:7019', { fetch: m.fetch });
    expect(c.baseUrl).toBe('http://node:7019/api/v1/');
    expect(await c.balance('0xabc')).toBe('123456789.12345678');
    expect(c.lastEnvelope).toEqual({ timestamp: 1757800000000, version: '1.1.0' });
  });
  it('404 on balance/nonce means a fresh address', async () => {
    const m = mock({});
    const c = new JanzeerClient('http://node:7019/api/v1/', { fetch: m.fetch });
    expect(await c.balance('0xnew')).toBe('0');
    expect(await c.nonce('0xnew')).toBe(0);
    expect(await c.transfers.get('deadbeef')).toBeNull();
  });
  it('maps pages and typed models', async () => {
    const m = mock({
      'GET /api/v1/tokens': (u) => {
        expect(u.searchParams.get('size')).toBe('5');
        // raw text on purpose: a JS number literal would already have rounded the 128-bit cap
        return new Response('{"timestamp":1,"version":"1.1.0","payload":{"total":1,"page":0,"pageSize":5,"totalPages":1,"list":[{"tokenId":"ab","symbol":"JZT","name":"T","decimals":0,"cap":340282366920938463463374607431768211456,"totalSupply":1,"issuer":"0x1"}]}}');
      },
      'GET /api/v1/transactions/transfers': () => new Response(env({ total: 1, list: [{ hash: 'h', timestamp: 1, fee: 0.01, senderAddress: '0xa', senderSignature: 's', senderPublicKey: 'p', status: true, amount: 1.5, recipientAddress: '0xb', data: null, results: null, blockHash: null }] })),
    });
    const c = new JanzeerClient('http://node:7019', { fetch: m.fetch });
    const page = await c.tokens.list({ size: 5 });
    expect(page.list[0]!.cap).toBe(340282366920938463463374607431768211456n);
    const t = await c.transfers.list({ address: '0xa', unconfirmed: true });
    expect(t.list[0]).toMatchObject({ fee: '0.01', amount: '1.5', blockHash: null });
    expect(m.calls[1]!.url).toContain('unconfirmed=true');
  });
  it('submit posts the body and maps rejections', async () => {
    const acct = Account.fromPrivateKey('6deadaf98b65c46612b57db1551da40d79ed6a759f23f9cf137612f8ef238efc');
    const tx = acct.signTx(TxBuilder.transfer({ from: acct.address, to: '0x598b1301acef3baba6ce25e38dd17b723f7b98b1', amount: '1', nonce: 3, timestamp: 1 }));
    let n = 0;
    const m = mock({
      'POST /api/v1/transactions/transfers': (_u, init) => {
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({ hash: tx.hash, senderSignature: tx.signature, amount: '1', nonce: 3 });
        n++;
        if (n === 1) return new Response(env({ status: 400, message: `Invalid nonce for ${acct.address}: expected 4, got 3`, type: 'INVALID_NONCE' }), { status: 400 });
        if (n === 2) return new Response(env({ status: 400, message: 'Incorrect signature', type: 'INCORRECT_SIGNATURE' }), { status: 400 });
        if (n === 3) return new Response(env([{ message: 'amount must not be null' }]), { status: 400 });
        return new Response(env({ ...body, status: true, blockHash: null }), { status: 201 });
      },
    });
    const c = new JanzeerClient('http://node:7019', { fetch: m.fetch });
    await expect(c.submit(tx)).rejects.toSatisfy((e: any) => e instanceof NonceMismatchError && e.expected === 4 && e.got === 3);
    await expect(c.submit(tx)).rejects.toSatisfy((e: any) => e instanceof TxRejectedError && e.type === 'INCORRECT_SIGNATURE');
    await expect(c.submit(tx)).rejects.toBeInstanceOf(ValidationError);
    const ok = await c.submit(tx);
    expect(ok.hash).toBe(tx.hash);
    expect(ok.amount).toBe('1');
  });
  it('retries once on 429 honouring Retry-After', async () => {
    let n = 0;
    const m = mock({
      'GET /api/v1/info/uptime': () => (++n === 1 ? new Response(JSON.stringify({ status: 429, message: 'Rate limit exceeded' }), { status: 429, headers: { 'Retry-After': '0' } }) : new Response(env(42))),
    });
    const c = new JanzeerClient('http://node:7019', { fetch: m.fetch });
    expect(await c.uptime()).toBe(42);
    expect(n).toBe(2);
  });
});
