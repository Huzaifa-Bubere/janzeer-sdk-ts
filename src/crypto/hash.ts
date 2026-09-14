/** Hash primitives exactly as the node uses them (`HashUtils`). @module */
import { sha256 as nobleSha256, sha512 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { hmac } from '@noble/hashes/hmac.js';
import { pbkdf2 as noblePbkdf2 } from '@noble/hashes/pbkdf2.js';
import { bytesToHex } from './bytes.js';

export function sha256(data: Uint8Array): Uint8Array {
  return nobleSha256(data);
}

/** `HashUtils.doubleSha256` — the transaction hash function. */
export function doubleSha256(data: Uint8Array): Uint8Array {
  return nobleSha256(nobleSha256(data));
}

/** Double-SHA256 as lowercase hex — what the node calls the transaction `hash`. */
export function hashPreimage(preimage: Uint8Array): string {
  return bytesToHex(doubleSha256(preimage));
}

/** Keccak-256 (the Ethereum variant, NOT NIST SHA3-256) — addresses and the EIP-55 checksum. */
export function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

export function hmacSha512(key: Uint8Array, msg: Uint8Array): Uint8Array {
  return hmac(sha512, key, msg);
}

export function pbkdf2Sha512(password: Uint8Array, salt: Uint8Array, iterations: number, dkLen: number): Uint8Array {
  return noblePbkdf2(sha512, password, salt, { c: iterations, dkLen });
}

export function pbkdf2Sha256(password: Uint8Array, salt: Uint8Array, iterations: number, dkLen: number): Uint8Array {
  return noblePbkdf2(nobleSha256, password, salt, { c: iterations, dkLen });
}
