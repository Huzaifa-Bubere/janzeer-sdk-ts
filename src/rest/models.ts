/**
 * Typed REST models. Coin amounts are decimal strings; token amounts are `bigint`; timestamps are ms numbers.
 * Mappers accept the lossless JSON tree so no precision is lost on the way in.
 * @module
 */
import { asArray, asBigInt, asBool, asDecimal, asInt, asObject, asOptDecimal, asOptInt, asOptString, asString, isObject, type JsonValue } from '../json.js';
import { NETWORK_ID, TOKEN_OP_NAMES, type TokenOpName } from '../constants.js';

export interface Page<T> {
  total: number;
  list: T[];
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Query of every paged endpoint. `page` is 0-based; `size` 1–100 (default 10 on the node). */
export interface PageQuery {
  page?: number;
  size?: number;
  sortBy?: string | string[];
  sortDirection?: 'ASC' | 'DESC';
}

export interface NodeInfo {
  nodeKey: string;
  host: string;
  port: number;
  /** `consensus.network-id` — pass it as `networkId` to every builder when talking to a non-mainnet node. */
  networkId: string;
  /** Hash of the epoch-1 genesis block: the chain's identity. */
  genesisHash: string;
  /** Consensus rule-set + genesis digest exchanged in the P2P handshake. */
  chainSpecDigest: string;
  /** Node software version. */
  version: string;
  /** REST/JSON-RPC API version. */
  apiVersion: string;
  /** P2P wire protocol version. */
  protocolVersion: string;
  /** `SYNCHRONIZED`, `PROCESSING` or `NOT_SYNCHRONIZED`. */
  syncStatus: string;
  /** True when the node runs a testnet faucet (`POST /api/v1/faucet`). */
  faucet: boolean;
}
export interface NodeVersion {
  version: string;
  protocolVersion: string;
}
export interface ExplorerInfo {
  nodesCount: number;
  blocksCount: number;
  transactionsCount: number;
  blockProductionTime: number;
  transactionsPerSecond: string;
  currentEpochNumber: number;
  currentEpochDate: number;
  validatorsCount: number;
  maxSupply: string;
  circulatingSupply: string;
}

export interface BaseBlock {
  timestamp: number;
  height: number;
  previousHash: string;
  hash: string;
  signature: string;
  publicKey: string;
}
export interface MainBlock extends BaseBlock {
  merkleHash: string;
  transactionsCount: number;
  epochIndex: number;
}
export interface GenesisBlock extends BaseBlock {
  epochIndex: number;
  validatorsCount: number;
}

export interface ReceiptResult {
  from: string;
  to: string;
  amount: string;
  data: string | null;
  error: string | null;
}
export interface Receipt {
  transactionHash: string;
  results: ReceiptResult[];
}

export interface BaseTx {
  hash: string;
  timestamp: number;
  fee: string;
  senderAddress: string;
  senderSignature: string;
  senderPublicKey: string;
  /** `null` while pending */
  blockHash: string | null;
}
export interface TransferTx extends BaseTx {
  /** `true` when applied successfully (pending txs report `true`) */
  status: boolean;
  amount: string;
  recipientAddress: string | null;
  data: string | null;
  results: ReceiptResult[] | null;
}
export interface RegisterValidatorTx extends BaseTx {
  /** the node reports it as `nodeKey` */
  validatorKey: string;
  amount: string;
}
export interface ExitValidatorTx extends BaseTx {
  validatorKey: string;
}
export interface RewardTx extends BaseTx {
  reward: string;
  recipientAddress: string;
}
export interface TokenTx extends BaseTx {
  op: number;
  opName: TokenOpName;
  tokenId: string;
  symbol: string;
  name: string;
  decimals: number;
  cap: bigint | null;
  amount: bigint | null;
  recipient: string | null;
}

export interface Validator {
  address: string;
  nodeKey: string;
}
export interface ValidatorView {
  address: string;
  publicKey: string;
  timestamp: number;
}

export interface Token {
  tokenId: string;
  symbol: string;
  name: string;
  decimals: number;
  cap: bigint;
  totalSupply: bigint;
  issuer: string;
}
export interface TokenBalance {
  tokenId: string;
  holder: string;
  balance: bigint;
}

// ---- mappers ----
type J = { [k: string]: JsonValue };

export function mapPage<T>(v: JsonValue | undefined, item: (x: JsonValue) => T): Page<T> {
  if (v == null) return { total: 0, list: [], page: 0, pageSize: 0, totalPages: 0 };
  const o = asObject(v, 'page');
  const list = Array.isArray(o.list) ? o.list.map(item) : [];
  return { total: o.total == null ? list.length : asInt(o.total), list, page: asOptInt(o.page) ?? 0, pageSize: asOptInt(o.pageSize) ?? list.length, totalPages: asOptInt(o.totalPages) ?? 0 };
}
export const mapNodeInfo = (v: JsonValue): NodeInfo => {
  const o = asObject(v);
  return {
    nodeKey: asString(o.nodeKey, 'nodeKey'),
    host: asString(o.host),
    port: asInt(o.port),
    // fields added by node 0.0.3 — tolerate an older node
    networkId: o.networkId === undefined ? NETWORK_ID : asString(o.networkId),
    genesisHash: o.genesisHash === undefined ? '' : asString(o.genesisHash),
    chainSpecDigest: o.chainSpecDigest === undefined ? '' : asString(o.chainSpecDigest),
    version: o.version === undefined ? '' : asString(o.version),
    apiVersion: o.apiVersion === undefined ? '' : asString(o.apiVersion),
    protocolVersion: o.protocolVersion === undefined ? '' : asString(o.protocolVersion),
    syncStatus: o.syncStatus === undefined ? '' : asString(o.syncStatus),
    faucet: o.faucet === true,
  };
};
export const mapNodeVersion = (v: JsonValue): NodeVersion => {
  const o = asObject(v);
  return { version: asString(o.version), protocolVersion: asString(o.protocolVersion) };
};
export const mapExplorerInfo = (v: JsonValue): ExplorerInfo => {
  const o = asObject(v);
  return {
    nodesCount: asInt(o.nodesCount), blocksCount: asInt(o.blocksCount), transactionsCount: asInt(o.transactionsCount),
    blockProductionTime: asInt(o.blockProductionTime), transactionsPerSecond: asDecimal(o.transactionsPerSecond),
    currentEpochNumber: asInt(o.currentEpochNumber), currentEpochDate: asInt(o.currentEpochDate), validatorsCount: asInt(o.validatorsCount),
    maxSupply: asDecimal(o.maxSupply), circulatingSupply: asDecimal(o.circulatingSupply),
  };
};
function baseBlock(o: J): BaseBlock {
  return { timestamp: asInt(o.timestamp), height: asInt(o.height), previousHash: asString(o.previousHash), hash: asString(o.hash), signature: asString(o.signature), publicKey: asString(o.publicKey) };
}
export const mapMainBlock = (v: JsonValue): MainBlock => {
  const o = asObject(v);
  return { ...baseBlock(o), merkleHash: asString(o.merkleHash), transactionsCount: asInt(o.transactionsCount), epochIndex: asInt(o.epochIndex) };
};
export const mapGenesisBlock = (v: JsonValue): GenesisBlock => {
  const o = asObject(v);
  return { ...baseBlock(o), epochIndex: asInt(o.epochIndex), validatorsCount: asInt(o.validatorsCount) };
};
export const mapReceiptResult = (v: JsonValue): ReceiptResult => {
  const o = asObject(v);
  return { from: asString(o.from), to: asString(o.to), amount: asDecimal(o.amount), data: asOptString(o.data), error: asOptString(o.error) };
};
export const mapReceipt = (v: JsonValue): Receipt => {
  const o = asObject(v);
  return { transactionHash: asString(o.transactionHash), results: asArray(o.results).map(mapReceiptResult) };
};
function baseTx(o: J): BaseTx {
  return { hash: asString(o.hash), timestamp: asInt(o.timestamp), fee: asDecimal(o.fee), senderAddress: asString(o.senderAddress), senderSignature: asString(o.senderSignature), senderPublicKey: asString(o.senderPublicKey), blockHash: asOptString(o.blockHash) };
}
export const mapTransferTx = (v: JsonValue): TransferTx => {
  const o = asObject(v);
  return { ...baseTx(o), status: o.status == null ? true : asBool(o.status), amount: asDecimal(o.amount), recipientAddress: asOptString(o.recipientAddress), data: asOptString(o.data), results: Array.isArray(o.results) ? o.results.map(mapReceiptResult) : null };
};
export const mapRegisterValidatorTx = (v: JsonValue): RegisterValidatorTx => {
  const o = asObject(v);
  return { ...baseTx(o), validatorKey: asString(o.nodeKey ?? o.validatorKey, 'nodeKey'), amount: asDecimal(o.amount) };
};
export const mapExitValidatorTx = (v: JsonValue): ExitValidatorTx => {
  const o = asObject(v);
  return { ...baseTx(o), validatorKey: asString(o.nodeKey ?? o.validatorKey, 'nodeKey') };
};
export const mapRewardTx = (v: JsonValue): RewardTx => {
  const o = asObject(v);
  return { ...baseTx(o), reward: asDecimal(o.reward), recipientAddress: asString(o.recipientAddress) };
};
export const mapTokenTx = (v: JsonValue): TokenTx => {
  const o = asObject(v);
  const op = asInt(o.op);
  return { ...baseTx(o), op, opName: (isObject(o) && typeof o.opName === 'string' ? (o.opName as TokenOpName) : TOKEN_OP_NAMES[op]) ?? 'CREATE', tokenId: asString(o.tokenId), symbol: asString(o.symbol), name: asString(o.name), decimals: asInt(o.decimals), cap: o.cap == null ? null : asBigInt(o.cap), amount: o.amount == null ? null : asBigInt(o.amount), recipient: asOptString(o.recipient) };
};
export const mapValidator = (v: JsonValue): Validator => {
  const o = asObject(v);
  return { address: asString(o.address), nodeKey: asString(o.nodeKey) };
};
export const mapValidatorView = (v: JsonValue): ValidatorView => {
  const o = asObject(v);
  return { address: asString(o.address), publicKey: asString(o.publicKey), timestamp: asInt(o.timestamp) };
};
export const mapToken = (v: JsonValue): Token => {
  const o = asObject(v);
  return { tokenId: asString(o.tokenId), symbol: asString(o.symbol), name: asString(o.name), decimals: asInt(o.decimals), cap: asBigInt(o.cap), totalSupply: asBigInt(o.totalSupply), issuer: asString(o.issuer) };
};
export const mapTokenBalance = (v: JsonValue): TokenBalance => {
  const o = asObject(v);
  return { tokenId: asString(o.tokenId), holder: asString(o.holder), balance: asBigInt(o.balance) };
};
export const mapDecimal = (v: JsonValue): string => asDecimal(v);
export const mapInt = (v: JsonValue): number => asInt(v);
export { asOptDecimal };
