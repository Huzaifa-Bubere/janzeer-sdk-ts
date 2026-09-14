/**
 * Key derivation — BIP39/BIP32-SHAPED but with Janzeer's own constants (`SeedConstant.SALT`), so stock
 * bip32/ethers libraries will NOT reproduce it. Mirrors `SeedCalculator`, `ExtendedKey`, `DerivationKeysHelper`.
 * @module
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE, numberToBytesBE } from '@noble/curves/utils.js';
import { concatBytes, ser32, utf8ToBytes } from './bytes.js';
import { hmacSha512, pbkdf2Sha512 } from './hash.js';

/** Used BOTH as the PBKDF2 salt base (instead of BIP39's `"mnemonic"`) AND as the root HMAC key (instead of `"Bitcoin seed"`). */
export const HD_SALT = '@_Janzeer_Blockchain_@';
/** The only derivation path wallets use; all three levels are non-hardened. */
export const DEFAULT_PATH = 'm/0/0/0';
const N = secp256k1.Point.Fn.ORDER;

/** An extended private key node: 32-byte private key + 32-byte chain code. */
export interface HdNode {
  priv: Uint8Array;
  chainCode: Uint8Array;
}

/** `SeedCalculator.calculateSeed` — PBKDF2-HMAC-SHA512, 2048 rounds, 64 bytes, salt `HD_SALT + passphrase`, NFKD inputs. */
export function mnemonicToSeed(mnemonic: string, passphrase = ''): Uint8Array {
  return pbkdf2Sha512(utf8ToBytes(mnemonic.normalize('NFKD')), utf8ToBytes(HD_SALT + passphrase.normalize('NFKD')), 2048, 64);
}

/** `ExtendedKey.root` — `I = HMAC-SHA512(key = HD_SALT, msg = seed)`; `IL` = private key, `IR` = chain code. */
export function seedToMasterKey(seed: Uint8Array): HdNode {
  const I = hmacSha512(utf8ToBytes(HD_SALT), seed);
  return { priv: I.slice(0, 32), chainCode: I.slice(32, 64) };
}

/** `ExtendedKey.getChild` — standard BIP32 non-hardened CKDpriv (`index` must be < 2^31). */
export function deriveChild(node: HdNode, index: number): HdNode {
  if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) throw new RangeError('non-hardened index expected');
  const pub = secp256k1.getPublicKey(node.priv, true);
  const I = hmacSha512(node.chainCode, concatBytes(pub, ser32(index)));
  const child = (bytesToNumberBE(I.slice(0, 32)) + bytesToNumberBE(node.priv)) % N;
  return { priv: numberToBytesBE(child, 32), chainCode: I.slice(32, 64) };
}

/** Derive a path like `m/0/0/0` (non-hardened segments only). */
export function derivePath(seed: Uint8Array, path: string = DEFAULT_PATH): HdNode {
  const parts = path.split('/');
  if (parts[0] !== 'm') throw new RangeError(`path must start with m/: ${path}`);
  let node = seedToMasterKey(seed);
  for (const p of parts.slice(1)) {
    if (/['hH]$/.test(p)) throw new RangeError('hardened derivation is not part of the Janzeer scheme');
    node = deriveChild(node, Number(p));
  }
  return node;
}

/** The wallet key: seed → `m/0/0/0`. */
export function deriveDefault(seed: Uint8Array): HdNode {
  return derivePath(seed, DEFAULT_PATH);
}
