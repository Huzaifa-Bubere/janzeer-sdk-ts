# Reading chain data

`JanzeerClient` wraps every `/api/v1` endpoint with typed results. Amounts come back as decimal strings, token
quantities as `bigint`, timestamps as milliseconds. Responses are parsed losslessly — a 128-bit token cap or an
8-decimal balance never passes through a JavaScript `number`.

```ts
const client = new JanzeerClient('https://node.example.org');   // '/api/v1/' is appended automatically
```

## Node

```ts
await client.info();          // { nodeKey, host, port, networkId, genesisHash, chainSpecDigest, version, apiVersion, protocolVersion, syncStatus, faucet }
await client.version();       // { version: '0.0.2', protocolVersion: '1.1.0' }
await client.uptime();        // ms
await client.explorerInfo();  // counts, TPS, epoch, supply
client.lastEnvelope;          // { timestamp, version } of the last response
```

## Accounts

```ts
await client.balance(addr);   // spendable balance (committed − pending debits); '0' for an unknown address
await client.nonce(addr);     // next nonce to sign with; 0 for an unknown address
await client.validateAddress(addr);
await client.tokens.balancesOf(addr);
```

The JSON-RPC `rpc.getAccount(addr)` returns all of it in one call (`balance`, `committedBalance`, `nextNonce`,
`committedNonce`, `pendingCount`, `isValidatorWallet`).

## Pagination

Every list takes `{ page, size, sortBy, sortDirection }` (`page` 0-based, `size` 1–100, node default 10) and
returns `Page<T> = { total, list, page, pageSize, totalPages }`.

```ts
const p = await client.transfers.list({ address: addr, page: 0, size: 20 });
for (const t of p.list) console.log(t.hash, t.amount, t.blockHash ?? 'pending');
```

## Transactions

```ts
client.transfers.list({ address, unconfirmed })   // unconfirmed: true → the mempool
client.transfers.get(hash)                        // null when unknown
client.validatorTxs.list({ address, nodeKey })    // registrations
client.exitValidatorTxs.list({ address })
client.tokenTxs.list({ tokenId })
client.rewards.list({ address })                  // block rewards paid to `address`
client.receipt(hash)                              // execution receipt of a committed tx
```

For a transport-independent view of *any* transaction with its status (`FINAL | PENDING | UNKNOWN`), block and
receipt, use `rpc.getTransactionByHash(hash)`.

## Blocks

```ts
client.blocks.main.list({ size: 5 })      // newest first
client.blocks.main.get(hash); client.blocks.main.previous(hash); client.blocks.main.next(hash)
client.blocks.genesis.list()              // one per epoch: pins the epoch's validator set
```

`rpc.getTip()`, `rpc.getBlockByNumber(h, true)` and `rpc.getBlocks(from, to)` (≤ 100) give richer views with
the transactions inline.

## Validators and tokens

```ts
client.validators.list()      // every registered validator { address, nodeKey }
client.validators.active()    // the current epoch's producer set
client.validators.view()      // with registration timestamps
client.tokens.list(); client.tokens.get(tokenId); client.tokens.holders(tokenId)
```

## Choosing REST or JSON-RPC

Both talk to the same services. REST is convenient for explorers and dashboards (paged, cacheable GETs).
JSON-RPC adds batches, unified transaction/block views, `waitForFinality`, and the WebSocket feeds. Wallets
typically use REST for reads and writes and JSON-RPC (or WS) for finality and notifications.
