/** Unsigned / signed transaction objects. @module */
import { normalizeAmount } from '../amounts.js';
import { NETWORK_ID, TOKEN_OP_NAMES, type TokenOpCode, type TokenOpName, type TxType } from '../constants.js';
import { hashPreimage } from '../crypto/hash.js';
import { transactionBytes } from './payloads.js';

/** Type-specific fields of each client-submittable transaction, as they appear in the REST/RPC request body. */
export interface TransferFields {
  amount: string;
  recipientAddress: string;
  data?: string | null;
}
export interface RegisterValidatorFields {
  amount: string;
  validatorKey: string;
}
export interface ExitValidatorFields {
  validatorKey: string;
}
export interface TokenFields {
  op: TokenOpCode;
  tokenId?: string | null;
  symbol?: string | null;
  name?: string | null;
  decimals?: number | null;
  cap?: string | null;
  amount?: string | null;
  recipient?: string | null;
}
export type TxFields = TransferFields | RegisterValidatorFields | ExitValidatorFields | TokenFields;

/** REST path (relative to the API base) and JSON-RPC method that accept each type. */
export const TX_ROUTES: Readonly<Record<TxType, { restPath: string; rpcMethod: string }>> = Object.freeze({
  transfer: { restPath: 'transactions/transfers', rpcMethod: 'janzeer_sendTransfer' },
  token: { restPath: 'transactions/tokens', rpcMethod: 'janzeer_sendToken' },
  registerValidator: { restPath: 'transactions/validators', rpcMethod: 'janzeer_sendRegisterValidator' },
  exitValidator: { restPath: 'transactions/exit-validators', rpcMethod: 'janzeer_sendExitValidator' },
});

/**
 * A transaction that is fully specified but not yet signed. Produced by {@link TxBuilder}; sign it with
 * `account.signTx(tx)`, or sign `hash()` elsewhere and attach it with {@link UnsignedTx.withSignature}.
 */
export class UnsignedTx<F extends TxFields = TxFields, T extends TxType = TxType> {
  readonly networkId: string;
  readonly timestamp: number;
  readonly fee: string;
  readonly nonce: number;
  readonly senderAddress: string;

  constructor(
    readonly type: T,
    base: { networkId?: string; timestamp: number; fee: string; nonce: number; senderAddress: string },
    readonly fields: F,
    /** the type-specific payload bytes */
    readonly payload: Uint8Array,
  ) {
    this.networkId = base.networkId ?? NETWORK_ID;
    this.timestamp = base.timestamp;
    this.fee = normalizeAmount(base.fee);
    this.nonce = base.nonce;
    this.senderAddress = base.senderAddress;
  }

  /** The exact bytes that are hashed and signed. */
  preimage(): Uint8Array {
    return transactionBytes(this, this.payload);
  }

  /** Double-SHA256 of the preimage, lowercase hex — the transaction id. */
  hash(): string {
    return hashPreimage(this.preimage());
  }

  /** Attach a signature (+ the signer's public key). Use `Account.signTx` unless you hold the key elsewhere (hardware wallet, KMS). */
  withSignature(signature: string, senderPublicKey: string): SignedTx<F, T> {
    return new SignedTx(this, this.hash(), signature, senderPublicKey);
  }
}

/** A signed transaction ready for `client.submit(tx)` / `rpc.send(tx)`. */
export class SignedTx<F extends TxFields = TxFields, T extends TxType = TxType> {
  readonly type: T;
  readonly restPath: string;
  readonly rpcMethod: string;

  constructor(
    readonly unsigned: UnsignedTx<F, T>,
    readonly hash: string,
    /** Base64 DER ECDSA signature over `hash` */
    readonly signature: string,
    /** compressed secp256k1 public key, hex */
    readonly senderPublicKey: string,
  ) {
    this.type = unsigned.type;
    this.restPath = TX_ROUTES[unsigned.type].restPath;
    this.rpcMethod = TX_ROUTES[unsigned.type].rpcMethod;
  }

  get fields(): F {
    return this.unsigned.fields;
  }

  /** The JSON body the node's REST endpoints and `janzeer_send*` methods accept. Amounts are strings. */
  toRestBody(): Record<string, unknown> {
    const u = this.unsigned;
    return {
      timestamp: u.timestamp,
      fee: u.fee,
      nonce: u.nonce,
      hash: this.hash,
      senderAddress: u.senderAddress,
      senderPublicKey: this.senderPublicKey,
      senderSignature: this.signature,
      ...fieldsToBody(u.type, u.fields),
    };
  }

  /** Same as {@link toRestBody} (the RPC methods take the REST body as their single object parameter). */
  toRpcParams(): Record<string, unknown> {
    return this.toRestBody();
  }

  toJSON(): Record<string, unknown> {
    return { type: this.type, ...this.toRestBody() };
  }
}

function fieldsToBody(type: TxType, f: TxFields): Record<string, unknown> {
  switch (type) {
    case 'transfer': {
      const t = f as TransferFields;
      return { amount: t.amount, recipientAddress: t.recipientAddress, ...(t.data != null ? { data: t.data } : {}) };
    }
    case 'registerValidator': {
      const t = f as RegisterValidatorFields;
      return { amount: t.amount, validatorKey: t.validatorKey };
    }
    case 'exitValidator':
      return { validatorKey: (f as ExitValidatorFields).validatorKey };
    case 'token': {
      const t = f as TokenFields;
      const body: Record<string, unknown> = { op: t.op };
      if (t.tokenId) body.tokenId = t.tokenId;
      if (t.symbol) body.symbol = t.symbol;
      if (t.name) body.name = t.name;
      if (t.decimals != null) body.decimals = t.decimals;
      if (t.cap != null) body.cap = t.cap;
      if (t.amount != null) body.amount = t.amount;
      if (t.recipient) body.recipient = t.recipient;
      return body;
    }
  }
}

/** `op` code → name (`'CREATE'` …). */
export function tokenOpName(op: TokenOpCode): TokenOpName {
  return TOKEN_OP_NAMES[op]!;
}
