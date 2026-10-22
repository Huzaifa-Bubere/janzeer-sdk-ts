# Changelog

All notable changes to `@janzeer/sdk` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [SemVer](https://semver.org/).

## Unreleased

- Add the typed JSON-RPC `getGenesis()` method for `janzeer_getGenesis`.
- Minimum Node.js is now **20**: Node 18 is end-of-life and has no global WebCrypto, which the vault (random salt and IV) needs.
- `npm run typecheck` no longer needs a build first (the examples resolve `@janzeer/sdk` to the sources).

## Unreleased

- Verified against node **0.1.0** (P2P protocol 3.4.0): `SPEC_VERSION.node` bumped from 0.0.3. No API change for SDK users. New node rule worth knowing: a transaction's `timestamp` must be within 60 s ahead / 6 h behind the node's clock — sign right before you send.

## Versioning policy

- **MAJOR** — a change in the signed preimage, hashing, derivation or the REST envelope that makes older
  releases produce transactions a node rejects, or a breaking TypeScript API change.
- **MINOR** — new node methods, fields or SDK features; existing code keeps working.
- **PATCH** — fixes and documentation.

Each release states the node / API / protocol versions it was tested against (`SPEC_VERSION`).

## [Unreleased]

## [0.1.1] — 2026-09-14

### Added
- `NodeInfo` (REST `info()`) now carries `networkId`, `genesisHash`, `chainSpecDigest`, `version`, `apiVersion`, `protocolVersion`, `syncStatus` and `faucet` (node 0.0.3); older nodes are tolerated (defaults). Read `info().networkId` and pass it as `networkId` to the builders to work on the public testnet (`janzeer-testnet`).

### Changed
- `SPEC_VERSION`: node `0.0.3`, protocol `3.2.0`.

## [0.1.0] — 2026-09-14

First release.

- Keys: BIP39 mnemonics, Janzeer seed + `m/0/0/0` derivation, `Account` (mnemonic / private key / seed),
  canonical + EIP-55 addresses.
- Transactions: `TxBuilder` for transfer, validator registration/exit and all five JZT-1 token operations;
  `UnsignedTx` (preimage, hash) → `SignedTx` (REST body / RPC params). Local validation of amounts, memo size and
  exact validator fees.
- REST: `JanzeerClient` with typed models for every `/api/v1` endpoint, lossless number parsing, envelope
  unwrapping, 404 → empty/`null`, one automatic retry on 429.
- JSON-RPC: `JanzeerRpc` (HTTP, batches) and `JanzeerRpcWs` (WebSocket, auto-reconnect with re-subscription,
  `newBlocks` / `addressActivity` feeds), one typed method per `janzeer_*` method.
- Helpers: `waitForFinality` (server long-poll or REST polling), `sendAndWait`, `nextNonce`.
- Errors: `TxRejectedError` / `NonceMismatchError` shared by both transports, `RateLimitedError`,
  `NotSynchronizedError`, `RpcError` family.
- Vault: PBKDF2-SHA256/250k + AES-256-GCM, cross-SDK fixture.
- Compat: `@janzeer/sdk/crypto` re-exports the `janzeerCrypto.js` function API; `toPlainNumbers` converts a lossless tree to `JSON.parse` shapes for migrating code.
- Tested against node 0.0.2 / API 1.1.0 / protocol 3.1.0 / vectors v2.
