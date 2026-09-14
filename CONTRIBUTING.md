# Contributing

```bash
npm ci
npm run typecheck && npm run lint && npm test     # unit + conformance vectors (no network)
npm run build                                     # dist/ (ESM + CJS + d.ts)
npm run docs                                      # docs/api (TypeDoc)
```

## End-to-end tests and examples

They need a running Janzeer network with the faucet-funded test wallet. With the private node repo checked out
next to the conformance kit:

```bash
../sdk_conformance/e2e/node-up.sh            # starts the 4-anchor dev net, prints the JANZEER_* exports
eval "$(../sdk_conformance/e2e/node-up.sh --env)"
npm run e2e                                  # test/e2e — the 14-step SPEC flow
npm run examples                             # every script in examples/
../sdk_conformance/e2e/node-down.sh
```

Against any other network set `JANZEER_NODE_URL`, `JANZEER_RPC_URL`, `JANZEER_WS_URL`, `JANZEER_E2E_MNEMONIC`
(a funded wallet) and `JANZEER_E2E_RECIPIENT` yourself.

## Conformance vectors

`test/vectors/` is a vendored copy of `sdk_conformance/vectors/`. Never edit it by hand: after a node change run
`sdk_conformance/sync.sh --regen`, which regenerates the vectors from the node's `WalletParityVectorsTest` and
copies them here; `npm run check:vectors` (also part of CI) fails on drift.

## Style

- Amounts are decimal strings at the API boundary; never `number` arithmetic on coin values.
- Every new node method gets a typed wrapper in `src/rpc/methods.ts` or `src/rest/client.ts`, a model mapper,
  a unit test with a mocked transport, and a line in `CHANGELOG.md`.
- Public API says *validator*; *promoter* only survives as deprecated aliases in `@janzeer/sdk/crypto`.
