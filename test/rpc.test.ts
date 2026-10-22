import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocketServer, WebSocket as NodeWebSocket } from 'ws';
import { JanzeerRpc, JanzeerRpcWs, NonceMismatchError, RpcInvalidParamsError, RpcNotFoundError } from '../src/index.js';

const reply = (id: unknown, result?: unknown, error?: unknown) => JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) });

describe('JanzeerRpc (HTTP)', () => {
  const fetch = (async (_url: any, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const one = (r: any) => {
      switch (r.method) {
        case 'janzeer_getGenesis': return { jsonrpc: '2.0', id: r.id, result: { timestamp: 1, height: 0, previousHash: '', hash: 'genesis-hash', signature: 'sig', publicKey: 'pub', epochIndex: 1, validatorsCount: 3 } };
        case 'janzeer_getNonce': return { jsonrpc: '2.0', id: r.id, result: 7 };
        case 'janzeer_getBalance': return r.params.address === '0x12' ? { jsonrpc: '2.0', id: r.id, error: { code: -32602, message: "Invalid address '0x12'" } } : { jsonrpc: '2.0', id: r.id, result: 1000.00000001 };
        case 'janzeer_getTransactionByHash': return { jsonrpc: '2.0', id: r.id, result: { hash: r.params.hash, type: null, status: 'UNKNOWN' } };
        case 'janzeer_getToken': return { jsonrpc: '2.0', id: r.id, error: { code: -32000, message: 'Token not found' } };
        case 'janzeer_sendTransfer': return { jsonrpc: '2.0', id: r.id, error: { code: -32001, message: 'Invalid nonce for 0x06e1c0fa9955a700876f8cb0acc7f13fba9fb8ba: expected 1, got 5', data: { type: 'INVALID_NONCE' } } };
        default: return { jsonrpc: '2.0', id: r.id, error: { code: -32601, message: 'Method not found' } };
      }
    };
    const out = Array.isArray(body) ? body.map(one) : one(body);
    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;

  it('normalizes url, maps results losslessly and errors by code', async () => {
    const rpc = new JanzeerRpc('http://node:7019/api/v1', { fetch });
    expect(rpc.url).toBe('http://node:7019/rpc');
    expect(await rpc.getNonce('0xa')).toBe(7);
    expect(await rpc.getGenesis()).toEqual({ timestamp: 1, height: 0, previousHash: '', hash: 'genesis-hash', signature: 'sig', publicKey: 'pub', epochIndex: 1, validatorsCount: 3 });
    expect(await rpc.getBalance('0xa')).toBe('1000.00000001');
    await expect(rpc.getBalance('0x12')).rejects.toBeInstanceOf(RpcInvalidParamsError);
    await expect(rpc.getToken('x')).rejects.toBeInstanceOf(RpcNotFoundError);
    await expect(rpc.sendTransfer({})).rejects.toSatisfy((e: any) => e instanceof NonceMismatchError && e.expected === 1 && e.got === 5);
    expect((await rpc.getTransactionByHash('ab')).status).toBe('UNKNOWN');
  });
  it('batch keeps order and isolates failures', async () => {
    const rpc = new JanzeerRpc('http://node:7019', { fetch });
    const r = await rpc.batch([{ method: 'janzeer_getNonce', params: { address: '0xa' } }, { method: 'janzeer_nope' }, { method: 'janzeer_getBalance', params: { address: '0xa' } }]);
    expect(r[0]).toMatchObject({ ok: true });
    expect(r[1]!.ok).toBe(false);
    expect(String((r[2] as any).result)).toBe('1000.00000001');
  });
});

describe('JanzeerRpcWs', () => {
  let server: WebSocketServer;
  let port: number;
  let subs = 0;
  const clients = new Set<NodeWebSocket>();
  beforeAll(async () => {
    server = new WebSocketServer({ port: 0 });
    port = (server.address() as any).port;
    server.on('connection', (ws) => {
      clients.add(ws);
      ws.on('close', () => clients.delete(ws));
      ws.on('message', (raw) => {
        const m = JSON.parse(String(raw));
        switch (m.method) {
          case 'janzeer_getTip': ws.send(reply(m.id, { type: 'main', height: 10, hash: 'h', previousHash: 'p', timestamp: 1, producer: 'k', signature: 's', epochIndex: 1, transactionsCount: 0 })); break;
          case 'janzeer_subscribe': {
            const id = 'sub' + ++subs;
            ws.send(reply(m.id, id));
            setTimeout(() => ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'janzeer_subscription', params: { subscription: id, kind: m.params.kind, result: m.params.kind === 'newBlocks' ? { type: 'main', height: 11, hash: 'h2', previousHash: 'h', timestamp: 2, producer: 'k', signature: 's' } : { blockHeight: 11, blockHash: 'h2', transaction: { hash: 'tx1', type: 'transfer', status: 'FINAL', amount: 1.25 } } } })), 20);
            break;
          }
          case 'janzeer_unsubscribe': ws.send(reply(m.id, true)); break;
          default: ws.send(reply(m.id, undefined, { code: -32601, message: 'Method not found' }));
        }
      });
    });
  });
  afterAll(() => server.close());

  it('calls, subscribes, receives notifications, resubscribes after a drop', async () => {
    const events: string[] = [];
    const ws = await JanzeerRpcWs.connect(`http://localhost:${port}`, { WebSocket: NodeWebSocket as any, reconnectDelayMs: 50, onEvent: (e) => events.push(e.type) });
    expect(ws.url).toBe(`ws://localhost:${port}/rpc/ws`);
    expect((await ws.getTip()).height).toBe(10);
    const blocks: number[] = [];
    const sub = await ws.subscribeNewBlocks({ fromHeight: 1 }, (b) => blocks.push(b.height));
    const activity: string[] = [];
    await ws.subscribeAddressActivity(['0xABC'], (ev) => activity.push(ev.transaction.hash + ':' + ev.transaction.amount));
    await new Promise((r) => setTimeout(r, 100));
    expect(blocks).toEqual([11]);
    expect(activity).toEqual(['tx1:1.25']);
    const firstId = sub.id;
    // server drops the connection → client reconnects and re-subscribes with new ids
    for (const c of clients) c.terminate();
    await new Promise((r) => setTimeout(r, 400));
    expect(ws.connected).toBe(true);
    expect(events).toContain('resubscribed');
    expect(sub.id).not.toBe(firstId);
    expect(blocks.length).toBeGreaterThanOrEqual(2); // the replayed notification after resubscribe
    expect(await sub.unsubscribe()).toBe(true);
    ws.close();
    expect(ws.connected).toBe(false);
  });
});
