/** ECDSA secp256k1 exactly as `SignatureUtils` / `ECKey`: RFC-6979 deterministic, canonical low-S, DER, Base64, over the RAW 32-byte digest. @module */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { base64ToBytes, bytesToBase64, bytesToHex, hexToBytes } from './bytes.js';

/** Sign a 32-byte digest (hex) with a private key (hex). `prehash: false` is mandatory — the digest is signed as-is. */
export function signHash(hashHex: string, privateKeyHex: string): string {
  const der = secp256k1.sign(hexToBytes(hashHex), hexToBytes(privateKeyHex), { format: 'der', lowS: true, prehash: false });
  return bytesToBase64(der);
}

/** Verify a Base64 DER signature over a digest (hex) with a compressed public key (hex). */
export function verifyHash(hashHex: string, signatureBase64: string, publicKeyHex: string): boolean {
  try {
    return secp256k1.verify(base64ToBytes(signatureBase64), hexToBytes(hashHex), hexToBytes(publicKeyHex), { format: 'der', lowS: true, prehash: false });
  } catch {
    return false;
  }
}

/** Compressed (33-byte) public key, hex, from a private key (hex). */
export function privateToPublic(privateKeyHex: string): string {
  return bytesToHex(secp256k1.getPublicKey(hexToBytes(privateKeyHex), true));
}

/** True when `privateKeyHex` is a valid secp256k1 scalar (32 bytes, 0 < k < n). */
export function isValidPrivateKey(privateKeyHex: string): boolean {
  try {
    return secp256k1.utils.isValidSecretKey(hexToBytes(privateKeyHex));
  } catch {
    return false;
  }
}
