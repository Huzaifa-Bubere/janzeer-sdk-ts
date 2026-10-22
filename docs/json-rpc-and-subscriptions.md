# JSON-RPC and subscriptions

The node serves JSON-RPC 2.0 at `POST /rpc` and over WebSocket at `/rpc/ws` (same methods, plus
subscriptions). `JanzeerRpc` and `JanzeerRpcWs` expose **one typed method per `janzeer_*` method**; `call()`
sends anything else.

```ts
const rpc = new JanzeerRpc('http://localhost:7019');            // '/rpc' appended automatically
await rpc.getInfo();          // chainId, versions, tip, syncStatus, peers, finality: 'instant'
await rpc.getGenesis();        // typed genesis block (epoch index and validator count)
await rpc.getChainSpec();     // consensus parameters, fees, deposit, max supply
await rpc.getStats(); await rpc.getEpoch();
await rpc.getAccount(addr); await rpc.getBalance(addr); await rpc.getNonce(addr);
await rpc.getTransactionsByAddress(addr, { size: 20 });        // { list, pending, total… }
await rpc.getTransactionByHash(hash);                          // status FINAL | PENDING | UNKNOWN
await rpc.getTip(); await rpc.getBlockByNumber(12, true); await rpc.getBlocks(1, 100);
await rpc.listValidators(); await rpc.getActiveValidators(); await rpc.getValidator(key);
await rpc.listTokens(); await rpc.getToken(id); await rpc.getTokenHolders(id);
await rpc.estimateFee('transfer');                             // { fee, rule: 'minimum' | 'exact' }
await rpc.send(signedTx);                                      // or sendTransfer(body) etc.
await rpc.call('janzeer_methods');                             // raw
```

## Batches

```ts
const [nonce, tip] = await rpc.batch([{ method: 'janzeer_getNonce', params: { address } }, { method: 'janzeer_getTip' }]);
if (nonce.ok) console.log(nonce.result);      // each entry: { ok: true, result } | { ok: false, error }
```

Up to 50 requests per batch, 512 KiB per body. Results keep request order; one failing entry does not throw.

## Finality

`rpc.waitForFinality(hash, timeoutMs)` is the node's long-poll (≤ 60 s per call). The helper
`waitForFinality(rpc | ws | client, hash, { timeoutMs })` chains calls until a client-side deadline (default 3
minutes), tolerates a dropped connection, and throws `FinalityTimeoutError` (with the last view) on expiry.
Given a REST client instead of an RPC transport it polls the transaction endpoints.

A `FINAL` view carries `blockHash`, `blockHeight` and `receipt.successful`. The chain has instant finality
(2f+1 BFT commit), so no confirmation counting exists anywhere in the API.

## WebSocket

```ts
const ws = await JanzeerRpcWs.connect('ws://localhost:7019/rpc/ws');   // http(s) urls are converted
await ws.getTip();                                                     // every method works over the socket

const blocks = await ws.subscribeNewBlocks({ fromHeight: 100, includeTransactions: true }, (block) => …);
const watch  = await ws.subscribeAddressActivity([addr1, addr2], ({ blockHeight, transaction }) => …);
await watch.unsubscribe();
ws.close();
```

- `newBlocks` replays committed blocks from `fromHeight`, then streams live ones — exactly once per height.
- `addressActivity` fires for every **final** transaction whose sender, recipient or token recipient is in the
  list (≤ 1000 addresses, ≤ 16 subscriptions per socket).
- **Reconnect**: on a dropped socket the client reconnects with exponential backoff (1 s → 30 s) and re-issues
  every subscription; `subscription.id` changes, handlers stay. Pass `{ reconnect: false }` to opt out, and
  `{ onEvent }` to log `open` / `close` / `error` / `resubscribed`.
- Slow consumers are disconnected by the node (2 MiB send buffer, 5 s send timeout) — keep handlers fast.
- Node < 22 has no global `WebSocket`: `JanzeerRpcWs.connect(url, { WebSocket: require('ws') })`.

## Errors

JSON-RPC errors map to the same classes as REST — see [errors](errors.md). A `-32001` rejection is a
`TxRejectedError` (or `NonceMismatchError`), `-32602` a `RpcInvalidParamsError` whose `data` lists the field
messages, `-32000` a `RpcNotFoundError`.
