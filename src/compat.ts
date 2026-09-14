/**
 * `@janzeer/sdk/crypto` — the function-style API of the `janzeerCrypto.js` module that the explorer, the jPong
 * mini-app and the parity scripts used before the SDK existed. Kept so those apps migrate by changing an import
 * path. New code should use `Account`, `TxBuilder` and `SignedTx` from the package root.
 * @module
 */
import { toScaledLong } from './amounts.js';
import { NETWORK_ID, TokenOp, type TokenOpCode } from './constants.js';
import { Mnemonic } from './mnemonic.js';
import { publicKeyToAddress, toChecksumAddress, isChecksumValid } from './crypto/address.js';
import { bytesToHex, hexToBytes } from './crypto/bytes.js';
import { hashPreimage } from './crypto/hash.js';
import { deriveChild, deriveDefault, mnemonicToSeed, seedToMasterKey, type HdNode } from './crypto/hd.js';
import { privateToPublic, signHash } from './crypto/sign.js';
import { exitValidatorPayload, registerValidatorPayload, tokenPayload as tokenPayloadTyped, transactionBytes as txBytes, transferPayload, type TokenPayloadFields } from './tx/payloads.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';

export { NETWORK_ID, TokenOp, toScaledLong, publicKeyToAddress, toChecksumAddress, isChecksumValid, mnemonicToSeed, seedToMasterKey, deriveChild, deriveDefault, privateToPublic, signHash, transferPayload };
export type { HdNode };

export interface LegacyAccount {
  privHex: string;
  pubHex: string;
  address: string;
}

export function generateMnemonic(): string {
  return Mnemonic.generate(128);
}
export function validateMnemonic(mnemonic: string): boolean {
  return Mnemonic.validate(mnemonic);
}
export function accountFromSeed(seed: Uint8Array): LegacyAccount {
  const { priv } = deriveDefault(seed);
  const pub = secp256k1.getPublicKey(priv, true);
  return { privHex: bytesToHex(priv), pubHex: bytesToHex(pub), address: publicKeyToAddress(pub) };
}
export function accountFromMnemonic(mnemonic: string, passphrase = ''): LegacyAccount {
  return accountFromSeed(mnemonicToSeed(mnemonic, passphrase));
}
export function accountFromPrivateKey(privHex: string): LegacyAccount {
  const pub = secp256k1.getPublicKey(hexToBytes(privHex), true);
  return { privHex, pubHex: bytesToHex(pub), address: publicKeyToAddress(pub) };
}

export interface LegacyBase {
  networkId?: string;
  timestamp: number;
  fee: string | number;
  nonce: number;
  senderAddress: string;
}

/** `Transaction.bytes()` */
export function transactionBytes(p: LegacyBase & { payload: Uint8Array }): Uint8Array {
  return txBytes(p, p.payload);
}
/** legacy name: validator-registration payload */
export function promoterPayload(p: { amount: string | number; promoterKey: string }): Uint8Array {
  return registerValidatorPayload({ amount: p.amount, validatorKey: p.promoterKey });
}
/** legacy name: validator-exit payload */
export function exitPromoterPayload(p: { promoterKey: string }): Uint8Array {
  return exitValidatorPayload({ validatorKey: p.promoterKey });
}
export function tokenPayload(p: { op: number; tokenId?: string; symbol?: string; name?: string; decimals?: number; cap?: string | number | bigint | null; amount?: string | number | bigint | null; recipient?: string | null }): Uint8Array {
  const f: TokenPayloadFields = { op: p.op as TokenOpCode, tokenId: p.tokenId, symbol: p.symbol, name: p.name, decimals: p.decimals, cap: p.cap == null ? null : String(p.cap), amount: p.amount == null ? null : String(p.amount), recipient: p.recipient };
  return tokenPayloadTyped(f);
}
/** double-SHA256 → hex */
export function hashBytes(bytes: Uint8Array): string {
  return hashPreimage(bytes);
}

function signWithPayload(p: LegacyBase & { privHex: string; payload: Uint8Array }) {
  const hash = hashPreimage(txBytes(p, p.payload));
  return { hash, signature: signHash(hash, p.privHex) };
}

export function buildSignedTransfer(p: LegacyBase & { publicKey: string; recipientAddress: string; amount: string | number; data?: string | null; privHex: string }) {
  const { hash, signature } = signWithPayload({ ...p, payload: transferPayload(p) });
  const { timestamp, fee, nonce, senderAddress, publicKey, recipientAddress, amount, data } = p;
  return { timestamp, fee, nonce, senderAddress, publicKey, recipientAddress, amount, data, hash, signature };
}
/** Validator registration (legacy name). */
export function buildSignedPromoter(p: LegacyBase & { publicKey: string; amount: string | number; promoterKey: string; privHex: string }) {
  const { hash, signature } = signWithPayload({ ...p, payload: promoterPayload(p) });
  const { timestamp, fee, nonce, senderAddress, publicKey, amount, promoterKey } = p;
  return { timestamp, fee, nonce, senderAddress, publicKey, amount, promoterKey, hash, signature };
}
export const buildSignedValidator = buildSignedPromoter;
/** Validator exit (legacy name). */
export function buildSignedExitPromoter(p: LegacyBase & { publicKey: string; promoterKey: string; privHex: string }) {
  const { hash, signature } = signWithPayload({ ...p, payload: exitPromoterPayload(p) });
  const { timestamp, fee, nonce, senderAddress, publicKey, promoterKey } = p;
  return { timestamp, fee, nonce, senderAddress, publicKey, promoterKey, hash, signature };
}
export const buildSignedExitValidator = buildSignedExitPromoter;
export function buildSignedTokenTx(p: LegacyBase & { publicKey: string; op: number; tokenId?: string; symbol?: string; name?: string; decimals?: number; cap?: string | number | bigint | null; amount?: string | number | bigint | null; recipient?: string | null; privHex: string }) {
  const { hash, signature } = signWithPayload({ ...p, payload: tokenPayload(p) });
  const { timestamp, fee, nonce, senderAddress, publicKey, op, tokenId = '', symbol = '', name = '', decimals = 0, cap = null, amount = null, recipient = null } = p;
  return { timestamp, fee, nonce, senderAddress, publicKey, op, tokenId, symbol, name, decimals, cap, amount, recipient, hash, signature };
}
