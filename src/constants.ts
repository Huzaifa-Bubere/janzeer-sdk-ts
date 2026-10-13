/**
 * Chain constants. Every value mirrors the node (`backend_v03` `Constants.kt` / `application.yaml consensus.*`)
 * and is pinned by the conformance vectors or the e2e flow.
 * @module
 */

/** `consensus.network-id` — bound into every signed transaction preimage (cross-network replay protection). */
export const NETWORK_ID = 'janzeer';
/** Native coin decimals: amounts are scaled ×10^8 into an int64 on the wire (`toScaledLong`). */
export const DECIMALS = 8;
/** Display ticker of the native coin. */
export const TICKER = 'JNZ';
/** Minimum fee of every transaction, in JNZ. */
export const MIN_FEE = '0.01';
/** Minimum transfer amount in JNZ unless the transfer carries a memo (`data`). */
export const MIN_TRANSFER = '0.1';
/** Maximum memo (`data`) length in UTF-8 bytes. */
export const MAX_MEMO_BYTES = 256;
/** Exact fee of a validator registration. */
export const VALIDATOR_FEE = '3';
/** Exact, NON-REFUNDABLE deposit of a validator registration. */
export const VALIDATOR_DEPOSIT = '2000';
/** Exact fee of a token CREATE; every other token op pays {@link MIN_FEE}. */
export const TOKEN_CREATE_FEE = '5';

/** The node / API / wire-protocol versions this SDK release was built and tested against. */
export const SPEC_VERSION = Object.freeze({
  /** `GET info/version` → `version` */
  node: '0.1.2',
  /** REST envelope `version` and JSON-RPC `apiVersion` */
  api: '1.1.0',
  /** peer-to-peer wire protocol (informational) */
  protocol: '3.2.0',
  /** conformance vectors format consumed by this SDK's tests */
  vectors: 2,
});

/** JZT-1 token operation codes carried in the `op` byte. */
export const TokenOp = Object.freeze({ CREATE: 0, MINT: 1, BURN: 2, SETCAP: 3, TRANSFER: 4 } as const);
export type TokenOpCode = (typeof TokenOp)[keyof typeof TokenOp];
export type TokenOpName = keyof typeof TokenOp;
/** `op` byte → name, as the node reports it (`opName` / RPC `op`). */
export const TOKEN_OP_NAMES: readonly TokenOpName[] = ['CREATE', 'MINT', 'BURN', 'SETCAP', 'TRANSFER'];

/** Client-submittable transaction types (the RPC `txView.type` strings). */
export type TxType = 'transfer' | 'token' | 'registerValidator' | 'exitValidator';
/** All transaction types a node reports, including the system-generated ones. */
export type AnyTxType = TxType | 'reward' | 'slashing';

/** Server-side limits (informational; the node enforces them). */
export const LIMITS = Object.freeze({
  /** max `size` of a paged REST/RPC list */
  pageSize: 100,
  /** max `toHeight - fromHeight` of `janzeer_getBlocks` */
  blockRange: 100,
  /** max `timeoutMs` of one `janzeer_waitForFinality` call */
  waitForFinalityMs: 60_000,
  /** subscriptions per WebSocket session */
  subscriptionsPerSession: 16,
  /** addresses per `addressActivity` subscription */
  watchedAddresses: 1000,
  /** requests per batch on `/rpc` */
  rpcBatch: 50,
  /** bytes per `/rpc` body */
  rpcBodyBytes: 524_288,
});
