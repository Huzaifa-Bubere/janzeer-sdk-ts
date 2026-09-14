# Migrating from `janzeerCrypto.js` / `walletApi.js`

Before this SDK the explorer wallet, the jPong mini-app and the parity scripts shared a copied
`src/wallet/janzeerCrypto.js`. Every export of that file is available unchanged from `@janzeer/sdk/crypto`:

```diff
- import { accountFromMnemonic, buildSignedTransfer, NETWORK_ID } from '@/wallet/janzeerCrypto';
+ import { accountFromMnemonic, buildSignedTransfer, NETWORK_ID } from '@janzeer/sdk/crypto';
```

Same names, same results (the conformance test proves both APIs against the same vectors): `toScaledLong`,
`publicKeyToAddress`, `toChecksumAddress`, `isChecksumValid`, `generateMnemonic`, `validateMnemonic`,
`mnemonicToSeed`, `seedToMasterKey`, `deriveChild`, `deriveDefault`, `privateToPublic`, `accountFromSeed`,
`accountFromMnemonic`, `accountFromPrivateKey`, `transactionBytes`, `transferPayload`, `promoterPayload`,
`exitPromoterPayload`, `tokenPayload`, `hashBytes`, `signHash`, `buildSignedTransfer`, `buildSignedPromoter`,
`buildSignedExitPromoter`, `buildSignedTokenTx`, `TokenOp`.

`buildSignedPromoter` / `buildSignedExitPromoter` also exist as `buildSignedValidator` /
`buildSignedExitValidator`; the *promoter* names are kept for compatibility and will not be removed in 0.x.

`vault.js` → `@janzeer/sdk/vault` (`encryptVault` / `decryptVault`; note they are now synchronous — `await`
on a non-promise is harmless, so existing call sites keep working).

## Moving to the typed API (recommended)

| Old | New |
|---|---|
| `accountFromMnemonic(m)` → `{ privHex, pubHex, address }` | `Account.fromMnemonic(m)` → `Account` (`privateKeyHex`, `publicKeyHex`, `address`, `checksumAddress`) |
| `buildSignedTransfer({ …, privHex })` → body object | `acct.signTx(TxBuilder.transfer({ from, to, amount, data, nonce }))` → `SignedTx`; `.toRestBody()` is the same body |
| `fetch(API + 'wallets/' + a)` + unwrap `payload` | `client.balance(a)` |
| `fetch(API + 'wallets/' + a + '/nonce')` | `client.nonce(a)` |
| `postTx('transactions/transfers', body)` | `client.submit(signedTx)` |
| catch `Error(message)` and match text | catch `NonceMismatchError` / `TxRejectedError` |
| `walletApi.getTransfers(a)` | `client.transfers.list({ address: a })` (typed `Page<TransferTx>`) |

Behavioural differences to know about:

- The typed client parses numbers losslessly; balances are strings like `'99996.22'` (they were JS numbers
  before — most call sites already did `String(...)`).
- 404 on balance/nonce still means "fresh address" (`'0'` / `0`); `transfers.get` returns `null` instead of
  throwing.
- Errors are class instances with the node's `type`; the old `error.message` text is still there.
- `TxBuilder` validates amounts, memo size and exact validator fees **locally** and throws `RangeError`
  before anything is sent.
