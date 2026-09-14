# Security

## Reporting a vulnerability

Email **security@janzeer.org** with a description and, if possible, a minimal reproduction. Please do not open
a public issue for anything that could affect users' funds. We acknowledge reports within 3 working days.

## What this SDK does and does not do

- The SDK **never transmits private keys or mnemonics**. It derives keys and signs in your process; the node only
  ever receives a signed transaction and read queries. There is no server-side signing endpoint.
- `Account.privateKeyHex` exists for backup/export flows. Do not log it. Prefer the vault module to store a
  mnemonic at rest.
- Signatures are deterministic (RFC 6979): the same transaction always produces the same signature, so a
  compromised random number generator cannot leak the key through signing. Key *generation*
  (`Mnemonic.generate`, `Account.random`) does need a good RNG — `crypto.getRandomValues` on every supported
  platform.
- All cryptography is pure JavaScript from the audited `@noble/*` family; the SDK adds no primitive of its own.
- The SDK trusts the node it talks to for chain data. Use HTTPS/WSS to a node you operate or trust; balances and
  finality answers come from that node.
