# Wallet and keys

Janzeer wallets are BIP39-shaped but use the chain's own constants, so a stock bip32/ethers wallet derives a
**different** key from the same phrase. Always derive with the SDK (or a client that passes the
[conformance vectors](conformance.md)).

## Create or import

```ts
import { Mnemonic, Account } from '@janzeer/sdk';

const phrase  = Mnemonic.generate();              // 12 words (pass 256 for 24)
const account = Account.fromMnemonic(phrase);     // optional second arg: BIP39 passphrase
account.address          // canonical, lowercase — what the chain stores and what you sign with
account.checksumAddress  // EIP-55 mixed case — for display and typo detection
account.publicKeyHex     // compressed secp256k1, 66 hex chars

Account.fromPrivateKey('6dea…8efc');             // raw key import
Account.fromSeed(Mnemonic.toSeed(phrase), 'm/0/1/0'); // another non-hardened path (advanced)
```

`Mnemonic.validate(phrase)` checks the wordlist and checksum; `Account.fromMnemonic` throws on an invalid phrase.

## How derivation works (so you can audit it)

| Step | Janzeer | Standard BIP39/32 |
|---|---|---|
| seed | PBKDF2-HMAC-SHA512, 2048 rounds, salt `"@_Janzeer_Blockchain_@" + passphrase` | salt `"mnemonic" + passphrase` |
| master key | HMAC-SHA512 keyed with `"@_Janzeer_Blockchain_@"` | keyed with `"Bitcoin seed"` |
| path | `m/0/0/0`, all non-hardened | varies |
| address | `0x` + first 20 bytes of keccak256(**compressed** pubkey), lowercase | Ethereum hashes the uncompressed key |

The low-level functions are exported: `mnemonicToSeed`, `seedToMasterKey`, `deriveChild`, `derivePath`,
`publicKeyToAddress`.

## Addresses

```ts
import { isValidAddress, normalizeAddress, toChecksumAddress } from '@janzeer/sdk';
isValidAddress('0x06e1c0FA9955A700876f8cB0Acc7f13fBA9FB8BA'); // true (correct EIP-55 casing)
isValidAddress('0x06E1c0fa9955a700876f8cb0acc7f13fba9fb8ba'); // false (mis-cased → likely typo)
normalizeAddress('0x06e1c0FA…');                              // '0x06e1c0fa…'
```

The node accepts lowercase or correctly-cased addresses in requests and always answers lowercase. Sign and
store the lowercase form; show the checksum form.

## Signing

`account.sign(hashHex)` produces an RFC-6979 deterministic, low-S, DER-encoded, Base64 signature over the
32-byte digest — exactly what the node verifies. You rarely call it directly: `account.signTx(unsignedTx)`
hashes and signs a transaction built by `TxBuilder`. Hardware wallets or KMS integrations can sign the
`unsignedTx.hash()` externally and attach it with `unsignedTx.withSignature(sig, publicKeyHex)`.

## Keeping the phrase at rest

Use the [vault](vault.md) module, or your platform's secure storage. Never send the phrase or private key to
any server — the node has no endpoint that would accept one.
