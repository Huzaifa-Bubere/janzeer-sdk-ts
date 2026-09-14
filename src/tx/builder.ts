/**
 * Transaction builders. Each returns an {@link UnsignedTx}; sign with `account.signTx(tx)`.
 * The builders validate what the node validates at intake (amounts, memo size, exact validator fees) so a
 * mistake fails locally with a clear message instead of a 400.
 * @module
 */
import { compareAmounts, isValidAmount, normalizeAmount, type AmountLike } from '../amounts.js';
import { MAX_MEMO_BYTES, MIN_FEE, MIN_TRANSFER, TokenOp, TOKEN_CREATE_FEE, VALIDATOR_DEPOSIT, VALIDATOR_FEE, type TokenOpCode } from '../constants.js';
import { isValidAddress, normalizeAddress } from '../crypto/address.js';
import { utf8Length } from '../crypto/bytes.js';
import { exitValidatorPayload, registerValidatorPayload, tokenPayload, transferPayload } from './payloads.js';
import { UnsignedTx, type ExitValidatorFields, type RegisterValidatorFields, type TokenFields, type TransferFields } from './types.js';

/** Fields common to every builder. `nonce` comes from the node (`client.nonce(address)` / `janzeer_getAccount.nextNonce`). */
export interface BaseTxOptions {
  /** canonical lowercase sender address (an EIP-55 address is normalized) */
  from: string;
  /** the sender's next nonce (committed nonce + pending count) */
  nonce: number;
  /** ms since epoch; defaults to `Date.now()` */
  timestamp?: number;
  /** defaults to the type's required/minimum fee */
  fee?: AmountLike;
  /** defaults to `NETWORK_ID` */
  networkId?: string;
}

export interface TransferOptions extends BaseTxOptions {
  to: string;
  amount: AmountLike;
  /** optional memo, ≤ 256 UTF-8 bytes; with a memo the amount may be below {@link MIN_TRANSFER} (even 0) */
  data?: string | null;
}

export interface RegisterValidatorOptions extends BaseTxOptions {
  /** the validator node's public key (hex) as shown by `GET info` → `nodeKey` */
  validatorKey: string;
  /** must equal {@link VALIDATOR_DEPOSIT}; defaults to it */
  amount?: AmountLike;
}

export interface ExitValidatorOptions extends BaseTxOptions {
  validatorKey: string;
}

export interface TokenCreateOptions extends BaseTxOptions {
  symbol: string;
  name: string;
  /** display decimals of the token (0–18); token amounts are always integer base units */
  decimals?: number;
  /** max supply in base units; omit for uncapped */
  cap?: string | bigint | null;
  /** initial mint to the creator, base units */
  amount?: string | bigint | null;
}
export interface TokenMintOptions extends BaseTxOptions {
  tokenId: string;
  amount: string | bigint;
  /** defaults to the sender */
  recipient?: string | null;
}
export interface TokenBurnOptions extends BaseTxOptions {
  tokenId: string;
  amount: string | bigint;
}
export interface TokenSetCapOptions extends BaseTxOptions {
  tokenId: string;
  cap: string | bigint;
}
export interface TokenTransferOptions extends BaseTxOptions {
  tokenId: string;
  amount: string | bigint;
  recipient: string;
}

function base(o: BaseTxOptions, defaultFee: string) {
  const fee = normalizeAmount(o.fee ?? defaultFee);
  if (!isValidAmount(fee) || compareAmounts(fee, MIN_FEE) < 0) throw new RangeError(`fee must be a decimal ≥ ${MIN_FEE}, got ${fee}`);
  if (!Number.isInteger(o.nonce) || o.nonce < 0) throw new RangeError(`nonce must be a non-negative integer, got ${o.nonce}`);
  return { networkId: o.networkId, timestamp: o.timestamp ?? Date.now(), fee, nonce: o.nonce, senderAddress: normalizeAddress(o.from) };
}

function integerUnits(v: string | bigint, what: string): string {
  const s = typeof v === 'bigint' ? v.toString() : String(v).trim();
  if (!/^\d+$/.test(s)) throw new RangeError(`${what} must be a non-negative integer of base units, got ${JSON.stringify(v)}`);
  return s;
}

export const TxBuilder = Object.freeze({
  /** A native-coin transfer. Fee defaults to {@link MIN_FEE}. */
  transfer(o: TransferOptions): UnsignedTx<TransferFields, 'transfer'> {
    const b = base(o, MIN_FEE);
    const amount = normalizeAmount(o.amount);
    if (!isValidAmount(amount) || amount.startsWith('-')) throw new RangeError(`amount must be a decimal with ≤ 8 fractional digits, got ${amount}`);
    const data = o.data == null || o.data === '' ? null : o.data;
    if (data != null && utf8Length(data) > MAX_MEMO_BYTES) throw new RangeError(`memo exceeds ${MAX_MEMO_BYTES} UTF-8 bytes`);
    if (data == null && compareAmounts(amount, MIN_TRANSFER) < 0) throw new RangeError(`amount must be ≥ ${MIN_TRANSFER} unless the transfer carries a memo`);
    const recipientAddress = normalizeAddress(o.to);
    const fields: TransferFields = { amount, recipientAddress, data };
    return new UnsignedTx('transfer', b, fields, transferPayload(fields));
  },

  /** Register a validator node: pays the exact {@link VALIDATOR_FEE} and locks the NON-REFUNDABLE {@link VALIDATOR_DEPOSIT}. */
  registerValidator(o: RegisterValidatorOptions): UnsignedTx<RegisterValidatorFields, 'registerValidator'> {
    const b = base(o, VALIDATOR_FEE);
    if (compareAmounts(b.fee, VALIDATOR_FEE) !== 0) throw new RangeError(`validator registration fee must be exactly ${VALIDATOR_FEE}`);
    const amount = normalizeAmount(o.amount ?? VALIDATOR_DEPOSIT);
    if (compareAmounts(amount, VALIDATOR_DEPOSIT) !== 0) throw new RangeError(`validator deposit must be exactly ${VALIDATOR_DEPOSIT}`);
    const fields: RegisterValidatorFields = { amount, validatorKey: checkKey(o.validatorKey) };
    return new UnsignedTx('registerValidator', b, fields, registerValidatorPayload(fields));
  },

  /** Gracefully exit a validator (removed at the next epoch; the deposit stays locked). */
  exitValidator(o: ExitValidatorOptions): UnsignedTx<ExitValidatorFields, 'exitValidator'> {
    const b = base(o, MIN_FEE);
    const fields: ExitValidatorFields = { validatorKey: checkKey(o.validatorKey) };
    return new UnsignedTx('exitValidator', b, fields, exitValidatorPayload(fields));
  },

  /** JZT-1 token operations. Token amounts are integer base units (strings or bigints). */
  token: Object.freeze({
    /** Create a token; the new `tokenId` is the transaction hash. Fee is exactly {@link TOKEN_CREATE_FEE}. */
    create(o: TokenCreateOptions): UnsignedTx<TokenFields, 'token'> {
      const b = base(o, TOKEN_CREATE_FEE);
      if (compareAmounts(b.fee, TOKEN_CREATE_FEE) !== 0) throw new RangeError(`token create fee must be exactly ${TOKEN_CREATE_FEE}`);
      const decimals = o.decimals ?? 0;
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new RangeError('decimals must be an integer 0–18');
      if (!o.symbol?.trim() || !o.name?.trim()) throw new RangeError('symbol and name are required');
      return tokenTx(b, { op: TokenOp.CREATE, tokenId: '', symbol: o.symbol.trim(), name: o.name.trim(), decimals, cap: o.cap == null ? null : integerUnits(o.cap, 'cap'), amount: o.amount == null ? null : integerUnits(o.amount, 'amount'), recipient: null });
    },
    mint(o: TokenMintOptions): UnsignedTx<TokenFields, 'token'> {
      const b = base(o, MIN_FEE);
      return tokenTx(b, { op: TokenOp.MINT, tokenId: checkTokenId(o.tokenId), amount: integerUnits(o.amount, 'amount'), recipient: o.recipient ? normalizeAddress(o.recipient) : null });
    },
    burn(o: TokenBurnOptions): UnsignedTx<TokenFields, 'token'> {
      const b = base(o, MIN_FEE);
      return tokenTx(b, { op: TokenOp.BURN, tokenId: checkTokenId(o.tokenId), amount: integerUnits(o.amount, 'amount') });
    },
    setCap(o: TokenSetCapOptions): UnsignedTx<TokenFields, 'token'> {
      const b = base(o, MIN_FEE);
      return tokenTx(b, { op: TokenOp.SETCAP, tokenId: checkTokenId(o.tokenId), cap: integerUnits(o.cap, 'cap') });
    },
    transfer(o: TokenTransferOptions): UnsignedTx<TokenFields, 'token'> {
      const b = base(o, MIN_FEE);
      return tokenTx(b, { op: TokenOp.TRANSFER, tokenId: checkTokenId(o.tokenId), amount: integerUnits(o.amount, 'amount'), recipient: normalizeAddress(o.recipient) });
    },
    /** Escape hatch: any op with raw fields (no validation beyond the payload layout). */
    raw(o: BaseTxOptions & TokenFields): UnsignedTx<TokenFields, 'token'> {
      const b = base(o, o.op === TokenOp.CREATE ? TOKEN_CREATE_FEE : MIN_FEE);
      const { op, tokenId, symbol, name, decimals, cap, amount, recipient } = o;
      return tokenTx(b, { op, tokenId, symbol, name, decimals, cap, amount, recipient });
    },
  }),
});

function tokenTx(b: ReturnType<typeof base>, f: TokenFields & { op: TokenOpCode }): UnsignedTx<TokenFields, 'token'> {
  const fields: TokenFields = { op: f.op, tokenId: f.tokenId ?? '', symbol: f.symbol ?? '', name: f.name ?? '', decimals: f.decimals ?? 0, cap: f.cap ?? null, amount: f.amount ?? null, recipient: f.recipient ?? null };
  return new UnsignedTx('token', b, fields, tokenPayload(fields));
}

function checkKey(key: string): string {
  if (!/^0[23][0-9a-fA-F]{64}$/.test(key)) throw new RangeError('validatorKey must be a compressed secp256k1 public key (66 hex chars)');
  return key.toLowerCase();
}

function checkTokenId(id: string): string {
  if (!/^[0-9a-fA-F]{64}$/.test(id)) throw new RangeError('tokenId must be a 64-hex transaction hash');
  return id.toLowerCase();
}

// re-export for convenience
export { isValidAddress };
