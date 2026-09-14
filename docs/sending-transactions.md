# Sending transactions

Every transaction is built locally, signed locally, and submitted as JSON. The node re-checks hash, signature,
sender/public-key match, nonce, balance and fees, and either accepts it into the mempool (HTTP 201 / RPC
`{hash, status: "PENDING"}`) or rejects it with a typed reason.

```ts
const unsigned = TxBuilder.transfer({ from: me.address, to, amount: '1.25', nonce });
const signed   = me.signTx(unsigned);       // SignedTx: hash, signature, senderPublicKey
await client.submit(signed);                // REST
await rpc.send(signed);                     // or JSON-RPC — same body, same result
```

## Nonces

Each sender has a nonce that must be consecutive. `client.nonce(address)` (or
`rpc.getAccount(address).nextNonce`) returns **committed nonce + pending count**, so you can pipeline several
transactions before the first is final: nonce `n`, `n+1`, `n+2`… A gap or a replay is refused with
`NonceMismatchError { expected, got }` — read `expected`, rebuild, resend.

Sending the *same* signed transaction twice is harmless: the node answers `PENDING` again (idempotent by hash).

## Fees and limits

| Transaction | Fee | Other rule |
|---|---|---|
| transfer | ≥ `MIN_FEE` (0.01) | amount ≥ `MIN_TRANSFER` (0.1) unless a memo is present; memo ≤ 256 UTF-8 bytes |
| registerValidator | exactly `VALIDATOR_FEE` (3) | deposit exactly `VALIDATOR_DEPOSIT` (2000), **non-refundable** |
| exitValidator | ≥ 0.01 | — |
| token.create | exactly `TOKEN_CREATE_FEE` (5) | sender must be a validator wallet |
| token.mint / burn / setCap / transfer | ≥ 0.01 | issuer-only for mint/burn/setCap |

`TxBuilder` fills the default fee and refuses locally anything the node would refuse for these reasons, so you
get a `RangeError` with a plain message instead of a 400. `rpc.estimateFee(kind)` returns the same numbers from
the node (`rule: "minimum" | "exact"`). There is no fee market.

## Amounts

Coin amounts are **decimal strings** (`'1.25'`). Internally they are scaled by 10^8 to an integer
(`toScaledLong('1.25') === 125_000_000n`), which is what gets signed. Helpers:

```ts
formatJnz('1.50000000')                  // '1.5 JNZ'
formatJnz('1234.5', { group: true })     // '1,234.5 JNZ'
parseJnz('1,234.5 JNZ')                  // '1234.5'
addAmounts('1.25', '0.01')               // '1.26000000'
compareAmounts('0.1', '0.10')            // 0
```

Never do float arithmetic on amounts; a `number` with more than 15 significant digits is already wrong.

## Transfer

```ts
TxBuilder.transfer({ from, to, amount: '1.25', data: 'invoice 42', nonce, fee: '0.01', timestamp: Date.now() });
```

`data` is an optional memo (≤ 256 bytes). With a memo the amount may be below 0.1, even `'0'`, which makes a
transfer a cheap on-chain note.

## Validator registration and exit

```ts
const validatorKey = (await client.info()).nodeKey;              // the node's public key
TxBuilder.registerValidator({ from, validatorKey, nonce });       // fee 3, deposit 2000 (non-refundable)
TxBuilder.exitValidator({ from, validatorKey, nonce: nonce + 1 }); // removed at the next epoch
```

The wallet that registers a node becomes its *validator wallet* (rewards go there; only it can create tokens).

## Tokens (JZT-1)

Token amounts are **integer base units** (`bigint` or digit string) — the token's `decimals` is display-only.

```ts
const create = TxBuilder.token.create({ from, symbol: 'DEMO', name: 'Demo', decimals: 2, cap: 1_000_000n, amount: 500_000n, nonce });
const tokenId = me.signTx(create).hash;                            // for CREATE the tokenId IS the tx hash
TxBuilder.token.mint({ from, tokenId, amount: 100n, recipient, nonce });
TxBuilder.token.burn({ from, tokenId, amount: 100n, nonce });
TxBuilder.token.setCap({ from, tokenId, cap: 2_000_000n, nonce });
TxBuilder.token.transfer({ from, tokenId, amount: 12_345n, recipient, nonce });
```

## Waiting for finality

```ts
const view = await waitForFinality(rpc, signed.hash);       // FINAL TxView with blockHeight and receipt
const view = await sendAndWait(rpc, signed, { submitVia: client }); // submit + wait in one call
```

A transaction in a committed block is final; there is nothing to wait for beyond that. See
[json-rpc-and-subscriptions](json-rpc-and-subscriptions.md#finality) for how the wait works and its limits.

## Signing elsewhere (hardware wallet, KMS)

```ts
const unsigned = TxBuilder.transfer({ … });
const digest   = unsigned.hash();                        // 32-byte hex to sign (RFC-6979 low-S DER expected)
const signed   = unsigned.withSignature(base64Der, publicKeyHex);
```
