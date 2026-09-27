# @janzeer/sdk

Official TypeScript SDK for the [Janzeer](https://janzeer.org) blockchain — a stake-free, permissionless
Layer-1 with instant finality. Wallet keys and signing, transaction builders, a typed REST client, JSON-RPC over
HTTP and WebSocket subscriptions. Non-custodial by construction: keys never leave your process, the node only
verifies.

[![npm](https://img.shields.io/npm/v/@janzeer/sdk)](https://www.npmjs.com/package/@janzeer/sdk)
![license](https://img.shields.io/badge/license-Apache--2.0-blue)

```bash
npm install @janzeer/sdk
```

## 60-second quickstart

```ts
import { Account, JanzeerClient, JanzeerRpc, TxBuilder, formatJnz, waitForFinality } from '@janzeer/sdk';

const client = new JanzeerClient('http://localhost:7019');          // REST  (/api/v1)
const rpc    = new JanzeerRpc('http://localhost:7019');             // JSON-RPC (/rpc)
const me     = Account.fromMnemonic('abandon abandon … about');    // 12/24-word BIP39 phrase

console.log(me.checksumAddress, formatJnz(await client.balance(me.address)));

const tx = me.signTx(TxBuilder.transfer({
  from: me.address, to: '0x598b1301acef3baba6ce25e38dd17b723f7b98b1',
  amount: '1.25', data: 'hello', nonce: await client.nonce(me.address),
}));
await client.submit(tx);                                            // HTTP 201, or a typed error
const final = await waitForFinality(rpc, tx.hash);                  // one or two 15-second slots
console.log('final in block', final.blockHeight);
```

That is the whole integration: derive → nonce → build → sign → submit → wait. A committed block is final
(2f+1 BFT commit), so there is no confirmation count.

## What is in the box

| Area | Entry points | Guide |
|---|---|---|
| Keys & addresses | `Mnemonic`, `Account`, `toChecksumAddress`, `isValidAddress` | [wallet-and-keys](docs/wallet-and-keys.md) |
| Transactions | `TxBuilder.transfer / registerValidator / exitValidator / token.*` → `UnsignedTx` → `SignedTx` | [sending-transactions](docs/sending-transactions.md) |
| Amounts | `toScaledLong`, `fromScaledLong`, `formatJnz`, `parseJnz`, `addAmounts`… | [sending-transactions](docs/sending-transactions.md#amounts) |
| REST | `JanzeerClient`: balances, nonces, transactions, blocks, validators, tokens (typed, paged) | [reading-chain-data](docs/reading-chain-data.md) |
| JSON-RPC | `JanzeerRpc` (HTTP, batches) and `JanzeerRpcWs` (WebSocket + `newBlocks` / `addressActivity` subscriptions) | [json-rpc-and-subscriptions](docs/json-rpc-and-subscriptions.md) |
| Flows | `waitForFinality`, `sendAndWait`, `nextNonce` | [json-rpc-and-subscriptions](docs/json-rpc-and-subscriptions.md#finality) |
| Errors | `TxRejectedError`, `NonceMismatchError`, `RateLimitedError`, `RpcError`… | [errors](docs/errors.md) |
| Vault | `@janzeer/sdk/vault`: `encryptVault` / `decryptVault` (PBKDF2 + AES-GCM) | [vault](docs/vault.md) |
| Legacy API | `@janzeer/sdk/crypto`: the old `janzeerCrypto.js` functions | [migration](docs/migration.md) |

Subpath exports: `@janzeer/sdk` (everything), `@janzeer/sdk/rest`, `@janzeer/sdk/rpc`, `@janzeer/sdk/vault`,
`@janzeer/sdk/crypto`. ESM and CommonJS, TypeScript declarations included, `sideEffects: false`.

## Platforms

- **Node.js ≥ 20** (global `fetch` and WebCrypto). WebSocket: Node ≥ 22 has a global `WebSocket`; on 20–21 pass the
  [`ws`](https://www.npmjs.com/package/ws) package: `JanzeerRpcWs.connect(url, { WebSocket })`.
- **Browsers** (evergreen): works from plain-http pages too — the crypto is pure JS (`@noble/*`), nothing
  depends on `crypto.subtle`. Nodes answer CORS `*`.
- Deno / Bun: global `fetch` + `WebSocket`, no special setup.

## Compatibility

| SDK | Node | REST envelope `version` | Wire protocol | Vectors |
|---|---|---|---|---|
| 0.1.x | 0.1.0 | 1.1.0 | 3.4.0 | v2 |

`SPEC_VERSION` exports these values; the e2e test checks them against the node on the first call.

## Examples

Runnable scripts in `examples/` ([quickstart](examples/01-quickstart-transfer.ts)): quickstart transfer, address-activity subscription, token
create + transfer, validator registration (dry run), vault round trip. `npm run examples` runs them against
the network in `JANZEER_NODE_URL`.

## Conformance

Every release reproduces the shared [conformance vectors](docs/conformance.md) byte-for-byte (seed, keys,
address, every transaction preimage/hash/signature) and passes the 14-step end-to-end flow against a real
network. `npm test` runs the vectors; `npm run e2e` runs the flow.

## Documentation

- Guides: `docs/` (start with [wallet-and-keys](docs/wallet-and-keys.md)) · API reference: `npm run docs` → `docs/api/` (TypeDoc)
- Chain documentation: developer guide, API reference, yellow paper — https://janzeer.org

## License

Apache-2.0. See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.
