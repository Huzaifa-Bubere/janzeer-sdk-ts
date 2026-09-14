# Vault — a secret at rest

`@janzeer/sdk/vault` seals a mnemonic (or any string) under a password so a wallet can persist it in
`localStorage`, a file or a keychain entry.

```ts
import { encryptVault, decryptVault, VaultError } from '@janzeer/sdk/vault';

const blob = encryptVault(mnemonic, password);   // { v: 1, salt, iv, ct } — JSON-safe, base64 fields
localStorage.setItem('janzeer.vault', JSON.stringify(blob));

try { const phrase = decryptVault(JSON.parse(stored), password); }
catch (e) { if (e instanceof VaultError) /* wrong password or tampered blob */ ; }
```

## Format (v1)

| Field | Value |
|---|---|
| key | PBKDF2-HMAC-SHA256, 250 000 rounds, 16-byte random `salt`, 32-byte key |
| cipher | AES-256-GCM, 12-byte random `iv`, `ct` = ciphertext ‖ 16-byte tag |
| encoding | all three fields base64 |

Blobs are interchangeable between this SDK, the Dart SDK and the Kotlin SDK (the conformance kit's
`vault-fixture.json` pins it) and with the wallets that used the older browser-side implementation.

## Notes

- Pure JavaScript (`@noble/ciphers`, `@noble/hashes`): works on plain-http pages where `crypto.subtle` is
  unavailable, and in Node without flags.
- 250 000 PBKDF2 rounds take ~100–300 ms on a laptop and more on a phone; run `decryptVault` off the UI thread
  (a Web Worker) if that matters to you.
- A vault protects a phrase at rest; it does not make a weak password strong. Pair it with the platform's
  biometric/keychain unlock where available.
