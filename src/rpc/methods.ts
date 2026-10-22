/** Typed `janzeer_*` methods shared by the HTTP and WebSocket transports. @module */
import type { JsonValue } from '../json.js';
import { asString, asBool, asArray } from '../json.js';
import type { SignedTx } from '../tx/types.js';
import { mapTokenBalance, mapToken, mapGenesisBlock, type TokenBalance, type Token, type GenesisBlock } from '../rest/models.js';
import {
  mapAccountView, mapBlockView, mapChainSpecView, mapEpochView, mapFeeEstimate, mapMethodSpec, mapNodeInfoView, mapRpcPage, mapSendResult, mapStatsView, mapTxView, mapValidatorInfo,
  type AccountView, type AddressTransactions, type BlockView, type ChainSpecView, type EpochView, type FeeEstimate, type FeeKind, type NodeInfoView, type RpcMethodSpec, type RpcPage, type SendResult, type StatsView, type TxView, type ValidatorInfo,
} from './types.js';
import type { TxType } from '../constants.js';

export interface PageParams {
  page?: number;
  /** 1–100 (node default 20) */
  size?: number;
}

/** Anything that can perform a JSON-RPC call. */
export interface RpcTransport {
  call(method: string, params?: unknown): Promise<JsonValue>;
}

export abstract class RpcMethods implements RpcTransport {
  /** Raw call: `params` by name (object) or by position (array). Throws the mapped SDK error on a JSON-RPC error. */
  abstract call(method: string, params?: unknown): Promise<JsonValue>;

  methods(): Promise<RpcMethodSpec[]> {
    return this.call('janzeer_methods').then((v) => asArray(v).map(mapMethodSpec));
  }
  getGenesis(): Promise<GenesisBlock> {
    return this.call('janzeer_getGenesis').then(mapGenesisBlock);
  }
  getInfo(): Promise<NodeInfoView> {
    return this.call('janzeer_getInfo').then(mapNodeInfoView);
  }
  getChainSpec(): Promise<ChainSpecView> {
    return this.call('janzeer_getChainSpec').then(mapChainSpecView);
  }
  getStats(): Promise<StatsView> {
    return this.call('janzeer_getStats').then(mapStatsView);
  }
  getEpoch(): Promise<EpochView> {
    return this.call('janzeer_getEpoch').then(mapEpochView);
  }

  getAccount(address: string): Promise<AccountView> {
    return this.call('janzeer_getAccount', { address }).then(mapAccountView);
  }
  /** spendable balance as a decimal string */
  getBalance(address: string): Promise<string> {
    return this.call('janzeer_getBalance', { address }).then((v) => asString(v));
  }
  /** next nonce (committed + pending) */
  getNonce(address: string): Promise<number> {
    return this.call('janzeer_getNonce', { address }).then((v) => Number(asString(v)));
  }
  getTokenBalances(address: string, p: PageParams = {}): Promise<RpcPage<TokenBalance>> {
    return this.call('janzeer_getTokenBalances', { address, ...p }).then((v) => mapRpcPage(v, mapTokenBalance));
  }
  getTransactionsByAddress(address: string, p: PageParams = {}): Promise<AddressTransactions> {
    return this.call('janzeer_getTransactionsByAddress', { address, ...p }).then((v) => {
      const page = mapRpcPage(v, mapTxView);
      const o = v as { [k: string]: JsonValue };
      return { ...page, pending: Array.isArray(o.pending) ? o.pending.map(mapTxView) : [] };
    });
  }

  /** Submit a signed transaction through its type's `janzeer_send*` method. */
  send(tx: SignedTx): Promise<SendResult> {
    return this.call(tx.rpcMethod, tx.toRpcParams()).then(mapSendResult);
  }
  sendTransfer(body: Record<string, unknown>): Promise<SendResult> {
    return this.call('janzeer_sendTransfer', body).then(mapSendResult);
  }
  sendToken(body: Record<string, unknown>): Promise<SendResult> {
    return this.call('janzeer_sendToken', body).then(mapSendResult);
  }
  sendRegisterValidator(body: Record<string, unknown>): Promise<SendResult> {
    return this.call('janzeer_sendRegisterValidator', body).then(mapSendResult);
  }
  sendExitValidator(body: Record<string, unknown>): Promise<SendResult> {
    return this.call('janzeer_sendExitValidator', body).then(mapSendResult);
  }
  sendRawTransaction(type: TxType, tx: Record<string, unknown>): Promise<SendResult> {
    return this.call('janzeer_sendRawTransaction', { type, tx }).then(mapSendResult);
  }

  /** Unified view of any transaction; `status` is `UNKNOWN` when the node has never seen the hash. */
  getTransactionByHash(hash: string): Promise<TxView> {
    return this.call('janzeer_getTransactionByHash', { hash }).then(mapTxView);
  }
  /** Server-side wait (≤ 60 000 ms per call). Returns the FINAL view, or the current view with `timedOut: true`. Prefer the {@link waitForFinality} helper. */
  waitForFinality(hash: string, timeoutMs = 30_000): Promise<TxView> {
    return this.call('janzeer_waitForFinality', { hash, timeoutMs }).then(mapTxView);
  }
  estimateFee(kind: FeeKind): Promise<FeeEstimate> {
    return this.call('janzeer_estimateFee', { kind }).then(mapFeeEstimate);
  }

  getTip(): Promise<BlockView> {
    return this.call('janzeer_getTip').then(mapBlockView);
  }
  getBlockByNumber(height: number, includeTransactions = false): Promise<BlockView> {
    return this.call('janzeer_getBlockByNumber', { height, includeTransactions }).then(mapBlockView);
  }
  getBlockByHash(hash: string, includeTransactions = false): Promise<BlockView> {
    return this.call('janzeer_getBlockByHash', { hash, includeTransactions }).then(mapBlockView);
  }
  /** ascending, at most 100 blocks per call */
  getBlocks(fromHeight: number, toHeight: number, includeTransactions = false): Promise<BlockView[]> {
    return this.call('janzeer_getBlocks', { fromHeight, toHeight, includeTransactions }).then((v) => asArray(v).map(mapBlockView));
  }

  getToken(tokenId: string): Promise<Token> {
    return this.call('janzeer_getToken', { tokenId }).then(mapToken);
  }
  listTokens(p: PageParams = {}): Promise<RpcPage<Token>> {
    return this.call('janzeer_listTokens', p).then((v) => mapRpcPage(v, mapToken));
  }
  getTokenHolders(tokenId: string, p: PageParams = {}): Promise<RpcPage<TokenBalance>> {
    return this.call('janzeer_getTokenHolders', { tokenId, ...p }).then((v) => mapRpcPage(v, mapTokenBalance));
  }

  listValidators(p: PageParams = {}): Promise<RpcPage<ValidatorInfo>> {
    return this.call('janzeer_listValidators', p).then((v) => mapRpcPage(v, mapValidatorInfo));
  }
  getActiveValidators(): Promise<ValidatorInfo[]> {
    return this.call('janzeer_getActiveValidators').then((v) => asArray(v).map(mapValidatorInfo));
  }
  getValidator(key: string): Promise<ValidatorInfo> {
    return this.call('janzeer_getValidator', { key }).then(mapValidatorInfo);
  }

  /** @internal used by the WS transport for `janzeer_unsubscribe` */
  protected unsubscribeRaw(subscription: string): Promise<boolean> {
    return this.call('janzeer_unsubscribe', { subscription }).then((v) => asBool(v));
  }
}
