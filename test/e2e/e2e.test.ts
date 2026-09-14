// The conformance flow (sdk_conformance/e2e/SPEC.md) against a running network. Skipped unless JANZEER_NODE_URL is
// set — start the local 4-anchor net with `sdk_conformance/e2e/node-up.sh` and `eval "$(… --env)"`.
import { describe, expect, it } from 'vitest';
import {
  Account, JanzeerClient, JanzeerRpc, JanzeerRpcWs, NonceMismatchError, RpcInvalidParamsError, SPEC_VERSION, TxBuilder, TxRejectedError, subAmounts, waitForFinality,
  type AddressActivityEvent,
} from '../../src/index.js';

const NODE_URL = process.env.JANZEER_NODE_URL;
const RPC_URL = process.env.JANZEER_RPC_URL ?? NODE_URL;
const WS_URL = process.env.JANZEER_WS_URL ?? NODE_URL;
const MNEMONIC = process.env.JANZEER_E2E_MNEMONIC ?? 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const RECIPIENT = process.env.JANZEER_E2E_RECIPIENT ?? '0x598b1301acef3baba6ce25e38dd17b723f7b98b1';

describe.skipIf(!NODE_URL)('e2e: SPEC.md flow (TypeScript)', () => {
  it('runs all 14 steps', async () => {
    const client = new JanzeerClient(NODE_URL!);
    const rpc = new JanzeerRpc(RPC_URL!);

    // 1 derive
    const acct = Account.fromMnemonic(MNEMONIC);
    expect(acct.address).toBe('0x06e1c0fa9955a700876f8cb0acc7f13fba9fb8ba');

    // 2 version + network gate: every tx below is built for the node's own network id
    const info = await client.info();
    expect(info.version).toBe(SPEC_VERSION.node);
    expect(client.lastEnvelope?.version).toBe(SPEC_VERSION.api);
    const networkId = info.networkId;
    if (process.env.JANZEER_NETWORK_ID) expect(networkId).toBe(process.env.JANZEER_NETWORK_ID);
    expect(info.genesisHash).toMatch(/^[0-9a-f]{64}$/);

    // 3 account
    const a0 = await rpc.getAccount(acct.address);
    expect(Number(a0.balance)).toBeGreaterThan(0);
    const nonce = a0.nextNonce;

    // 4 subscribe first
    const ws = await JanzeerRpcWs.connect(WS_URL!);
    const seen: AddressActivityEvent[] = [];
    const sub = await ws.subscribeAddressActivity([RECIPIENT], (ev) => seen.push(ev));
    expect(sub.id).toMatch(/^[0-9a-f]{16}$/);

    // 5 build + sign
    const tx = acct.signTx(TxBuilder.transfer({ from: acct.address, to: RECIPIENT, amount: '1.25', fee: '0.01', data: 'sdk-e2e-ts', nonce, networkId }));
    expect(acct.verify(tx.hash, tx.signature)).toBe(true);

    // 6 REST submit (201)
    const submitted = await client.submit(tx);
    expect(submitted.hash).toBe(tx.hash);

    // 7 RPC resubmit is idempotent
    const again = await rpc.send(tx);
    expect(again).toEqual({ hash: tx.hash, status: 'PENDING' });
    expect((await rpc.getAccount(acct.address)).pendingCount).toBeLessThanOrEqual(1);

    // 8 status
    expect(['PENDING', 'FINAL']).toContain((await rpc.getTransactionByHash(tx.hash)).status);

    // 9 finality (via the WS transport, i.e. a different node than the one the tx was sent to)
    const fin = await waitForFinality(ws, tx.hash, { timeoutMs: 120_000 });
    expect(fin.status).toBe('FINAL');
    expect(fin.blockHeight).toBeGreaterThan(0);
    expect(fin.receipt?.successful).toBe(true);

    // 10 exact balance
    const expected = subAmounts(subAmounts(a0.balance, '1.25'), '0.01');
    expect(subAmounts(await client.balance(acct.address), '0')).toBe(expected);

    // 11 notification
    const deadline = Date.now() + 60_000;
    while (!seen.some((e) => e.transaction.hash === tx.hash) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
    const hit = seen.find((e) => e.transaction.hash === tx.hash);
    expect(hit?.blockHeight).toBe(fin.blockHeight);
    expect(await sub.unsubscribe()).toBe(true);
    ws.close();

    // 12 nonce gap → NonceMismatchError (REST and RPC)
    const gap = acct.signTx(TxBuilder.transfer({ from: acct.address, to: RECIPIENT, amount: '1', nonce: nonce + 10, networkId }));
    await expect(client.submit(gap)).rejects.toSatisfy((e: any) => e instanceof NonceMismatchError && e.type === 'INVALID_NONCE' && e.got === nonce + 10);
    await expect(rpc.send(gap)).rejects.toSatisfy((e: any) => e instanceof NonceMismatchError && e.rpcCode === -32001);

    // 13 bad signature → TxRejectedError INCORRECT_SIGNATURE
    const next = await client.nonce(acct.address);
    const good = acct.signTx(TxBuilder.transfer({ from: acct.address, to: RECIPIENT, amount: '1', nonce: next, networkId }));
    const forged = TxBuilder.transfer({ from: acct.address, to: RECIPIENT, amount: '2', nonce: next, networkId }).withSignature(good.signature, acct.publicKeyHex);
    await expect(client.submit(forged)).rejects.toSatisfy((e: any) => e instanceof TxRejectedError && e.type === 'INCORRECT_SIGNATURE');

    // 14 bad address → -32602
    await expect(rpc.getBalance('0x12')).rejects.toBeInstanceOf(RpcInvalidParamsError);
  });
});
