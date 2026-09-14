/** Byte helpers shared by the preimage builders (all integers big-endian, like Java's ByteBuffer). @module */
import { bytesToHex as nobleBytesToHex, hexToBytes as nobleHexToBytes, utf8ToBytes as nobleUtf8ToBytes, concatBytes as nobleConcat } from '@noble/hashes/utils.js';

/** bytes → lowercase hex */
export function bytesToHex(bytes: Uint8Array): string {
  return nobleBytesToHex(bytes);
}
/** UTF-8 encode */
export function utf8ToBytes(s: string): Uint8Array {
  return nobleUtf8ToBytes(s);
}
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  return nobleConcat(...arrays);
}

/** Lenient hex → bytes: accepts an optional `0x` prefix and either case. */
export function hexToBytes(hex: string): Uint8Array {
  return nobleHexToBytes(hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex);
}

/** 8-byte big-endian two's-complement (Java `putLong`). */
export function i64be(value: bigint | number): Uint8Array {
  let v = BigInt.asUintN(64, BigInt(value));
  const out = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** 4-byte big-endian (BIP32 `ser32` / Java `putInt`). */
export function ser32(i: number): Uint8Array {
  return new Uint8Array([(i >>> 24) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff]);
}

/** `int32(len) ‖ utf8(s)` — the node's length-prefixed string (`TokenPayload`). `null`/`undefined` → empty. */
export function lenPrefixed(s: string | null | undefined): Uint8Array {
  const b = utf8ToBytes(s == null ? '' : String(s));
  return concatBytes(ser32(b.length), b);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** UTF-8 byte length of a string (memo limit checks). */
export function utf8Length(s: string): number {
  return utf8ToBytes(s).length;
}
