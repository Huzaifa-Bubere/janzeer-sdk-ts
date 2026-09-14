/**
 * Signed-bytes (preimage) layouts — byte-for-byte `Transaction.bytes()` of the node. Every multi-byte integer is
 * big-endian; strings and addresses are their UTF-8 bytes (an address is signed as text, not decoded).
 * @module
 */
import { toScaledLong, type AmountLike } from '../amounts.js';
import { NETWORK_ID, type TokenOpCode } from '../constants.js';
import { concatBytes, i64be, lenPrefixed, ser32, utf8ToBytes } from '../crypto/bytes.js';

export interface PreimageBase {
  /** defaults to {@link NETWORK_ID} */
  networkId?: string;
  timestamp: number | bigint;
  fee: AmountLike;
  nonce: number | bigint;
  senderAddress: string;
}

/** `networkId ‖ timestamp(8) ‖ toScaledLong(fee)(8) ‖ nonce(8) ‖ senderAddress ‖ payload`. */
export function transactionBytes(base: PreimageBase, payload: Uint8Array): Uint8Array {
  return concatBytes(
    utf8ToBytes(base.networkId ?? NETWORK_ID),
    i64be(base.timestamp),
    i64be(toScaledLong(base.fee)),
    i64be(base.nonce),
    utf8ToBytes(base.senderAddress),
    payload,
  );
}

/** Transfer payload: `toScaledLong(amount)(8) ‖ recipientAddress ‖ (data ?? "")`. */
export function transferPayload(p: { amount: AmountLike; recipientAddress: string; data?: string | null }): Uint8Array {
  return concatBytes(i64be(toScaledLong(p.amount)), utf8ToBytes(p.recipientAddress), utf8ToBytes(p.data ?? ''));
}

/** Validator registration payload: `toScaledLong(amount)(8) ‖ validatorKey`. */
export function registerValidatorPayload(p: { amount: AmountLike; validatorKey: string }): Uint8Array {
  return concatBytes(i64be(toScaledLong(p.amount)), utf8ToBytes(p.validatorKey));
}

/** Validator exit payload: `validatorKey` only (the deposit is non-refundable, so no amount). */
export function exitValidatorPayload(p: { validatorKey: string }): Uint8Array {
  return utf8ToBytes(p.validatorKey);
}

export interface TokenPayloadFields {
  op: TokenOpCode;
  tokenId?: string | null;
  symbol?: string | null;
  name?: string | null;
  decimals?: number | null;
  /** integer base units as a decimal string (NOT scaled) */
  cap?: string | bigint | null;
  /** integer base units as a decimal string (NOT scaled) */
  amount?: string | bigint | null;
  recipient?: string | null;
}

/** Token payload: `op(1) ‖ LP(tokenId) ‖ LP(symbol) ‖ LP(name) ‖ int32(decimals) ‖ LP(cap) ‖ LP(amount) ‖ LP(recipient)`; absent fields are empty strings. */
export function tokenPayload(p: TokenPayloadFields): Uint8Array {
  return concatBytes(
    new Uint8Array([p.op & 0xff]),
    lenPrefixed(p.tokenId),
    lenPrefixed(p.symbol),
    lenPrefixed(p.name),
    ser32(p.decimals ?? 0),
    lenPrefixed(p.cap == null ? '' : String(p.cap)),
    lenPrefixed(p.amount == null ? '' : String(p.amount)),
    lenPrefixed(p.recipient),
  );
}
