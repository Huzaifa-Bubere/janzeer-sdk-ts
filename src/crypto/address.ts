/** Addresses (`AddressUtils`, `ECKey.getAddress`). @module */
import { bytesToHex, utf8ToBytes } from './bytes.js';
import { keccak256 } from './hash.js';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** CANONICAL address = `"0x"` + lowercase hex of the first 20 bytes of keccak256(compressed public key). This is what the node stores, hashes and expects as `senderAddress`. */
export function publicKeyToAddress(compressedPublicKey: Uint8Array): string {
  if (compressedPublicKey.length !== 33) throw new RangeError('compressed (33-byte) public key expected');
  return '0x' + bytesToHex(keccak256(compressedPublicKey).slice(0, 20));
}

/** EIP-55 mixed-case display form (`AddressUtils.toChecksumAddress`). Presentation only — never sign or store it. */
export function toChecksumAddress(address: string): string {
  const body = address.toLowerCase().replace(/^0x/, '');
  const h = bytesToHex(keccak256(utf8ToBytes(body)));
  let out = '0x';
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    out += c >= 'a' && c <= 'f' && parseInt(h[i]!, 16) >= 8 ? c.toUpperCase() : c;
  }
  return out;
}

/** `AddressUtils.isChecksumValid`: all-lowercase (canonical) or all-uppercase or a correctly cased EIP-55 address. A mis-cased mixed-case address (likely typo) is rejected. */
export function isChecksumValid(address: string): boolean {
  if (!ADDRESS_RE.test(address)) return false;
  const body = address.slice(2);
  if (body === body.toLowerCase() || body === body.toUpperCase()) return true;
  return toChecksumAddress(address) === address;
}

/** Shape + checksum check — exactly what the node's `@AddressChecksum` validator accepts. */
export function isValidAddress(address: unknown): address is string {
  return typeof address === 'string' && isChecksumValid(address);
}

/** Canonical lowercase form; throws on an invalid address. */
export function normalizeAddress(address: string): string {
  if (!isValidAddress(address)) throw new RangeError(`Invalid address: ${address}`);
  return address.toLowerCase();
}
