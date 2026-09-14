/**
 * `@janzeer/sdk/vault` — the mnemonic (or any secret) at rest, sealed with a password: PBKDF2-HMAC-SHA256
 * (250 000 rounds) → AES-256-GCM. Pure JS (no WebCrypto, which is unavailable on plain-http pages). The blob is
 * byte-compatible with the Dart and Kotlin SDK vaults (conformance fixture `vault-fixture.json`).
 * @module
 */
import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { base64ToBytes, bytesToBase64, utf8ToBytes } from '../crypto/bytes.js';
import { pbkdf2Sha256 } from '../crypto/hash.js';

export const VAULT_VERSION = 1;
export const VAULT_ITERATIONS = 250_000;

export interface VaultBlob {
  v: 1;
  /** 16 bytes, base64 */
  salt: string;
  /** 12 bytes, base64 */
  iv: string;
  /** ciphertext ‖ 16-byte GCM tag, base64 */
  ct: string;
}

const dec = new TextDecoder();

function deriveKey(password: string, salt: Uint8Array): Uint8Array {
  return pbkdf2Sha256(utf8ToBytes(password), salt, VAULT_ITERATIONS, 32);
}

/** Seal `secret` under `password`. Randomized (fresh salt + IV each call). */
export function encryptVault(secret: string, password: string): VaultBlob {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const ct = gcm(deriveKey(password, salt), iv).encrypt(utf8ToBytes(secret));
  return { v: 1, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ct: bytesToBase64(ct) };
}

/** Open a blob. Throws `VaultError` when the password is wrong or the blob was tampered with (GCM tag mismatch). */
export function decryptVault(blob: VaultBlob, password: string): string {
  if (blob?.v !== VAULT_VERSION) throw new VaultError(`unsupported vault version ${String(blob?.v)}`);
  try {
    return dec.decode(gcm(deriveKey(password, base64ToBytes(blob.salt)), base64ToBytes(blob.iv)).decrypt(base64ToBytes(blob.ct)));
  } catch (e) {
    throw new VaultError('wrong password or corrupted vault', { cause: e });
  }
}

export class VaultError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'VaultError';
  }
}
