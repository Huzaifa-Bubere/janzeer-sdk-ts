/** Typed JSON-RPC views (the `janzeer_*` result shapes) and their mappers. @module */
import { asArray, asBigInt, asBool, asDecimal, asInt, asObject, asOptDecimal, asOptInt, asOptString, asString, isObject, type JsonValue } from '../json.js';
import type { AnyTxType, TokenOpName } from '../constants.js';
import { mapReceiptResult, type ReceiptResult } from '../rest/models.js';

export type TxStatus = 'FINAL' | 'PENDING' | 'UNKNOWN';

/** One shape for every transaction type; `type` tells them apart, `status` FINAL carries block + receipt. */
export interface TxView {
  hash: string;
  type: AnyTxType | string | null;
  status: TxStatus;
  timestamp: number | null;
  fee: string | null;
  nonce: number | null;
  senderAddress: string | null;
  senderPublicKey: string | null;
  senderSignature: string | null;
  blockHash: string | null;
  blockHeight: number | null;
  receipt: { successful: boolean; results: ReceiptResult[] } | null;
  /** transfer / reward / registerValidator: coin amount */
  amount: string | null;
  /** transfer / reward */
  recipientAddress: string | null;
  /** transfer memo */
  data: string | null;
  /** registerValidator / exitValidator */
  validatorKey: string | null;
  /** token op name (`CREATE`, …) */
  op: TokenOpName | null;
  tokenId: string | null;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  /** token base units */
  cap: bigint | null;
  tokenAmount: bigint | null;
  recipient: string | null;
  /** slashing */
  offenderKey: string | null;
  slot: number | null;
  /** set by `janzeer_waitForFinality` when the wait expired before finality */
  timedOut: boolean;
}

export interface BlockView {
  type: 'main' | 'genesis';
  height: number;
  hash: string;
  previousHash: string;
  timestamp: number;
  producer: string;
  signature: string;
  epochIndex: number | null;
  transactionsCount: number;
  transactionMerkleHash: string | null;
  stateMerkleHash: string | null;
  receiptMerkleHash: string | null;
  /** genesis only */
  activeAnchorCount: number | null;
  /** genesis only: the epoch's validator keys */
  validators: string[] | null;
  /** present when requested with `includeTransactions` */
  transactions: TxView[] | null;
}

export interface AccountView {
  address: string;
  /** spendable (committed − pending debits) */
  balance: string;
  committedBalance: string;
  /** the nonce to sign the next transaction with */
  nextNonce: number;
  committedNonce: number;
  pendingCount: number;
  isValidatorWallet: boolean;
}

export interface NodeInfoView {
  chainId: string;
  chainSpecDigest: string;
  version: string;
  apiVersion: string;
  wireProtocolVersion: string;
  nodeKey: string;
  tip: { height: number; hash: string; timestamp: number };
  epoch: number;
  syncStatus: string;
  synchronized: boolean;
  chainCorrupt: boolean;
  peers: number;
  finality: string;
}

export interface ChainSpecView {
  networkId: string;
  digest: string;
  epochHeight: number;
  timeSlotDurationMs: number;
  timeSlotIntervalMs: number;
  slotPeriodMs: number;
  validatorsCount: number;
  rotatingProducerSeats: number;
  blockCapacity: number;
  rewardBlock: string;
  rewardHalvingPeriod: number;
  rewardTailFloor: string;
  treasuryFeeShareBps: number;
  minimumFee: string;
  validatorRegistrationFee: string;
  validatorDeposit: string;
  tokenCreateFee: string;
  tokenActivationHeight: number;
  maxSupply: string;
  treasuryAddress: string;
  amountScale: number;
}

export interface StatsView {
  nodesCount: number;
  blocksCount: number;
  transactionsCount: number;
  pendingTransactions: number;
  blockProductionTimeMs: number;
  transactionsPerSecond: string;
  epoch: number;
  epochStart: number;
  validatorsCount: number;
  maxSupply: string;
  circulatingSupply: string;
}

export interface EpochView {
  index: number;
  genesisHeight: number;
  genesisHash: string;
  startTimestamp: number;
  epochHeight: number;
  nextGenesisHeight: number;
  slotPeriodMs: number;
  currentSlot: number;
  currentSlotOwner: string | null;
  activeAnchorCount: number;
  validators: string[];
}

export interface ValidatorInfo {
  key: string;
  walletAddress: string | null;
  registeredAt: number | null;
  active: boolean | null;
  banned: boolean | null;
  exited: boolean | null;
}

export interface FeeEstimate {
  kind: string;
  fee: string;
  rule: 'minimum' | 'exact' | string;
  feeMarket: boolean;
}
export type FeeKind = 'transfer' | 'token' | 'tokenCreate' | 'registerValidator' | 'exitValidator';

export interface SendResult {
  hash: string;
  status: 'PENDING';
}

export interface RpcPage<T> {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  list: T[];
}

export interface AddressTransactions extends RpcPage<TxView> {
  pending: TxView[];
}

export interface RpcMethodSpec {
  name: string;
  params: string[];
  description: string;
}

// ---- mappers ----
export function mapTxView(v: JsonValue): TxView {
  const o = asObject(v, 'tx');
  const type = asOptString(o.type);
  const isToken = type === 'token';
  return {
    hash: asString(o.hash, 'hash'),
    type,
    status: (asOptString(o.status) as TxStatus | null) ?? 'UNKNOWN',
    timestamp: asOptInt(o.timestamp),
    fee: asOptDecimal(o.fee),
    nonce: asOptInt(o.nonce),
    senderAddress: asOptString(o.senderAddress),
    senderPublicKey: asOptString(o.senderPublicKey),
    senderSignature: asOptString(o.senderSignature),
    blockHash: asOptString(o.blockHash),
    blockHeight: asOptInt(o.blockHeight),
    receipt: isObject(o.receipt) ? { successful: asBool(o.receipt.successful), results: asArray(o.receipt.results).map(mapReceiptResult) } : null,
    amount: isToken ? null : asOptDecimal(o.amount),
    recipientAddress: asOptString(o.recipientAddress),
    data: asOptString(o.data),
    validatorKey: asOptString(o.validatorKey),
    op: (asOptString(o.op) as TokenOpName | null),
    tokenId: asOptString(o.tokenId),
    symbol: asOptString(o.symbol),
    name: asOptString(o.name),
    decimals: asOptInt(o.decimals),
    cap: o.cap == null ? null : asBigInt(o.cap),
    tokenAmount: isToken && o.amount != null ? asBigInt(o.amount) : null,
    recipient: asOptString(o.recipient),
    offenderKey: asOptString(o.offenderKey),
    slot: asOptInt(o.slot),
    timedOut: o.timedOut === true,
  };
}
export function mapBlockView(v: JsonValue): BlockView {
  const o = asObject(v, 'block');
  return {
    type: asString(o.type) as 'main' | 'genesis',
    height: asInt(o.height), hash: asString(o.hash), previousHash: asString(o.previousHash), timestamp: asInt(o.timestamp),
    producer: asString(o.producer), signature: asString(o.signature), epochIndex: asOptInt(o.epochIndex), transactionsCount: asOptInt(o.transactionsCount) ?? 0,
    transactionMerkleHash: asOptString(o.transactionMerkleHash), stateMerkleHash: asOptString(o.stateMerkleHash), receiptMerkleHash: asOptString(o.receiptMerkleHash),
    activeAnchorCount: asOptInt(o.activeAnchorCount), validators: Array.isArray(o.validators) ? o.validators.map((x) => asString(x)) : null,
    transactions: Array.isArray(o.transactions) ? o.transactions.map(mapTxView) : null,
  };
}
export function mapAccountView(v: JsonValue): AccountView {
  const o = asObject(v, 'account');
  return { address: asString(o.address), balance: asDecimal(o.balance), committedBalance: asDecimal(o.committedBalance), nextNonce: asInt(o.nextNonce), committedNonce: asInt(o.committedNonce), pendingCount: asInt(o.pendingCount), isValidatorWallet: asBool(o.isValidatorWallet) };
}
export function mapNodeInfoView(v: JsonValue): NodeInfoView {
  const o = asObject(v, 'info');
  const tip = asObject(o.tip, 'tip');
  return {
    chainId: asString(o.chainId), chainSpecDigest: asString(o.chainSpecDigest), version: asString(o.version), apiVersion: asString(o.apiVersion), wireProtocolVersion: asString(o.wireProtocolVersion),
    nodeKey: asString(o.nodeKey), tip: { height: asInt(tip.height), hash: asString(tip.hash), timestamp: asInt(tip.timestamp) }, epoch: asInt(o.epoch), syncStatus: asString(o.syncStatus),
    synchronized: asBool(o.synchronized), chainCorrupt: asBool(o.chainCorrupt), peers: asInt(o.peers), finality: asString(o.finality),
  };
}
export function mapChainSpecView(v: JsonValue): ChainSpecView {
  const o = asObject(v, 'chainSpec');
  return {
    networkId: asString(o.networkId), digest: asString(o.digest), epochHeight: asInt(o.epochHeight), timeSlotDurationMs: asInt(o.timeSlotDurationMs), timeSlotIntervalMs: asInt(o.timeSlotIntervalMs),
    slotPeriodMs: asInt(o.slotPeriodMs), validatorsCount: asInt(o.validatorsCount), rotatingProducerSeats: asInt(o.rotatingProducerSeats), blockCapacity: asInt(o.blockCapacity), rewardBlock: asDecimal(o.rewardBlock),
    rewardHalvingPeriod: asInt(o.rewardHalvingPeriod), rewardTailFloor: asDecimal(o.rewardTailFloor), treasuryFeeShareBps: asInt(o.treasuryFeeShareBps), minimumFee: asDecimal(o.minimumFee),
    validatorRegistrationFee: asDecimal(o.validatorRegistrationFee), validatorDeposit: asDecimal(o.validatorDeposit), tokenCreateFee: asDecimal(o.tokenCreateFee), tokenActivationHeight: asInt(o.tokenActivationHeight),
    maxSupply: asDecimal(o.maxSupply), treasuryAddress: asString(o.treasuryAddress), amountScale: asInt(o.amountScale),
  };
}
export function mapStatsView(v: JsonValue): StatsView {
  const o = asObject(v, 'stats');
  return {
    nodesCount: asInt(o.nodesCount), blocksCount: asInt(o.blocksCount), transactionsCount: asInt(o.transactionsCount), pendingTransactions: asInt(o.pendingTransactions), blockProductionTimeMs: asInt(o.blockProductionTimeMs),
    transactionsPerSecond: asDecimal(o.transactionsPerSecond), epoch: asInt(o.epoch), epochStart: asInt(o.epochStart), validatorsCount: asInt(o.validatorsCount), maxSupply: asDecimal(o.maxSupply), circulatingSupply: asDecimal(o.circulatingSupply),
  };
}
export function mapEpochView(v: JsonValue): EpochView {
  const o = asObject(v, 'epoch');
  return {
    index: asInt(o.index), genesisHeight: asInt(o.genesisHeight), genesisHash: asString(o.genesisHash), startTimestamp: asInt(o.startTimestamp), epochHeight: asInt(o.epochHeight), nextGenesisHeight: asInt(o.nextGenesisHeight),
    slotPeriodMs: asInt(o.slotPeriodMs), currentSlot: asInt(o.currentSlot), currentSlotOwner: asOptString(o.currentSlotOwner), activeAnchorCount: asInt(o.activeAnchorCount), validators: asArray(o.validators).map((x) => asString(x)),
  };
}
export function mapValidatorInfo(v: JsonValue): ValidatorInfo {
  const o = asObject(v, 'validator');
  return { key: asString(o.key), walletAddress: asOptString(o.walletAddress), registeredAt: asOptInt(o.registeredAt), active: o.active == null ? null : asBool(o.active), banned: o.banned == null ? null : asBool(o.banned), exited: o.exited == null ? null : asBool(o.exited) };
}
export function mapFeeEstimate(v: JsonValue): FeeEstimate {
  const o = asObject(v, 'fee');
  return { kind: asString(o.kind), fee: asDecimal(o.fee), rule: asString(o.rule), feeMarket: asBool(o.feeMarket) };
}
export function mapSendResult(v: JsonValue): SendResult {
  const o = asObject(v, 'send');
  return { hash: asString(o.hash), status: 'PENDING' };
}
export function mapRpcPage<T>(v: JsonValue, item: (x: JsonValue) => T): RpcPage<T> {
  const o = asObject(v, 'page');
  return { total: asInt(o.total), page: asInt(o.page), pageSize: asInt(o.pageSize), totalPages: asInt(o.totalPages), list: asArray(o.list).map(item) };
}
export function mapMethodSpec(v: JsonValue): RpcMethodSpec {
  const o = asObject(v);
  return { name: asString(o.name), params: asArray(o.params).map((x) => asString(x)), description: asString(o.description) };
}
