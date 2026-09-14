# Errors, nonces and rate limits

Everything the SDK throws extends `JanzeerError`. Branch on `instanceof`, never on message text.

```
JanzeerError
├─ NetworkError              node unreachable / non-JSON / socket closed / timeout
├─ TxRejectedError           the node refused a transaction — `type` names the rule
│   └─ NonceMismatchError    `expected`, `got`, `address`
├─ ApiError                  other REST errors: `status`, `message`, `type?`, `body`
│   ├─ ValidationError       400 with a list of field messages (`messages`)
│   └─ NotFoundError         404
├─ NotSynchronizedError      the node is still syncing (REST 400 / RPC -32002) — retry shortly
├─ RateLimitedError          HTTP 429 / RPC -32004 — `retryAfterMs`
├─ RpcError                  `code`, `message`, `data`
│   ├─ RpcInvalidParamsError -32602 (data: field messages)
│   ├─ RpcNotFoundError      -32000
│   ├─ RpcLimitError         -32003 (range / timeout above the cap)
│   └─ RpcMethodNotFoundError -32601
└─ FinalityTimeoutError      waitForFinality deadline (`last` view)
```

`TxRejectedError` and `NonceMismatchError` are the same classes on both transports (`transport: 'rest' | 'rpc'
| 'ws'`, plus `httpStatus` or `rpcCode`).

## Rejection types

| `type` | Meaning | What to do |
|---|---|---|
| `INVALID_NONCE` | nonce ≠ sender's next nonce (`NonceMismatchError.expected`) | refresh the nonce and rebuild |
| `INCORRECT_SIGNATURE` | signature does not verify | you signed a different preimage — check fields/network id |
| `INCORRECT_HASH` | `hash` ≠ double-SHA256 of the preimage | same |
| `INCORRECT_ADDRESS` | `senderAddress` is not the address of `senderPublicKey` | derive both from one `Account` |
| `INSUFFICIENT_ACTUAL_BALANCE` / `INSUFFICIENT_BALANCE` | not enough spendable balance for amount + fee | — |
| `INCORRECT_PROMOTER_KEY` / `ALREADY_PROMOTER` | validator key invalid / already registered | — |
| `UNKNOWN` | a type this SDK release does not know (`rawType` has the string) | update the SDK |

Other 400 messages without a type (fee below minimum, memo too long, "Only a validator can create a token")
arrive as `ApiError` / `RpcError` with the node's message.

## Nonce handling pattern

```ts
async function sendWithRetry(build: (nonce: number) => SignedTx) {
  let nonce = await client.nonce(me.address);
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await client.submit(build(nonce)); }
    catch (e) { if (e instanceof NonceMismatchError && e.expected != null) nonce = e.expected; else throw e; }
  }
  throw new Error('could not agree on a nonce');
}
```

Pipelining: after submitting nonce `n`, the node's `nonce()` already answers `n+1`; you may keep sending. If one
pending transaction is dropped (6 h mempool expiry) the ones behind it become gaps — rebuild from `expected`.

## Rate limits

Nodes throttle `POST /api/v1/transactions/**` and `/rpc` per client IP (default 20 req/s, burst 40). Reads are
never limited. The clients retry **once** after a 429 honouring `Retry-After` (`retryOnRateLimit: false` to
disable); resubmitting a transaction is safe because acceptance is idempotent by hash.

## Response shapes the SDK hides

For anyone writing their own client: the REST envelope `{timestamp, version, payload}` wraps **errors too**
(`payload: {status, message, type?}`); request-body validation errors put an **array** of `{message}` in
`payload`; the rate limiter's 429/413 bodies are flat `{status, message}` (written before the envelope layer).
