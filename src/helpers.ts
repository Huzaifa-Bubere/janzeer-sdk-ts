/** High-level flows composed from the clients. @module */
import { JanzeerClient } from './rest/client.js';
import type { RpcMethods } from './rpc/methods.js';
import type { TxView } from './rpc/types.js';
import { LIMITS } from './constants.js';
import { JanzeerError, NetworkError, RpcNotFoundError } from './errors.js';
import type { SignedTx } from './tx/types.js';

export interface WaitOptions {
  /** total client-side deadline (default 180 000 ms — several 15 s slots) */
  timeoutMs?: number;
  /** REST polling interval when no RPC transport is given (default 1500 ms) */
  pollMs?: number;
  /** stop early (an `AbortSignal`) */
  signal?: AbortSignal;
}

/** Thrown by {@link waitForFinality} when the deadline passes; `last` is the most recent view (may be `PENDING` or `UNKNOWN`). */
export class FinalityTimeoutError extends JanzeerError {
  constructor(readonly hash: string, readonly last: TxView | null) {
    super(`transaction ${hash} not final within the deadline (last status: ${last?.status ?? 'unknown'})`);
  }
}

/**
 * Wait until `hash` is in a committed block. With an RPC transport (HTTP or WS) it uses the node's long-poll
 * `janzeer_waitForFinality` in ≤ 60 s slices; with a REST client it polls the transaction endpoints.
 * Resolves with the FINAL {@link TxView}; throws {@link FinalityTimeoutError} on deadline.
 */
export async function waitForFinality(source: RpcMethods | JanzeerClient, hash: string, opts: WaitOptions = {}): Promise<TxView> {
  const deadline = Date.now() + (opts.timeoutMs ?? 180_000);
  let last: TxView | null = null;
  while (Date.now() < deadline) {
    opts.signal?.throwIfAborted();
    if (source instanceof JanzeerClient) {
      const v = await restView(source, hash);
      last = v;
      if (v?.status === 'FINAL') return v;
      await sleep(opts.pollMs ?? 1500, opts.signal);
    } else {
      const slice = Math.max(1000, Math.min(LIMITS.waitForFinalityMs, deadline - Date.now()));
      try {
        last = await source.waitForFinality(hash, slice);
      } catch (e) {
        if (e instanceof RpcNotFoundError) last = null;
        else if (e instanceof NetworkError) {
          await sleep(1000, opts.signal);
          continue;
        } else throw e;
      }
      if (last?.status === 'FINAL') return last;
    }
  }
  throw new FinalityTimeoutError(hash, last);
}

async function restView(client: JanzeerClient, hash: string): Promise<TxView | null> {
  // The REST API has no unified view; a transfer is the common case, then the other types.
  const t = (await client.transfers.get(hash)) ?? (await client.tokenTxs.get(hash)) ?? (await client.validatorTxs.get(hash)) ?? (await client.exitValidatorTxs.get(hash));
  if (!t) return null;
  const final = !!t.blockHash;
  return {
    hash: t.hash, type: null, status: final ? 'FINAL' : 'PENDING', timestamp: t.timestamp, fee: t.fee, nonce: null, senderAddress: t.senderAddress, senderPublicKey: t.senderPublicKey, senderSignature: t.senderSignature,
    blockHash: t.blockHash, blockHeight: null, receipt: null, amount: 'amount' in t && typeof t.amount === 'string' ? t.amount : null, recipientAddress: 'recipientAddress' in t ? (t.recipientAddress as string | null) : null,
    data: 'data' in t ? (t.data as string | null) : null, validatorKey: 'validatorKey' in t ? (t.validatorKey as string) : null, op: null, tokenId: null, symbol: null, name: null, decimals: null, cap: null, tokenAmount: null, recipient: null, offenderKey: null, slot: null, timedOut: false,
  };
}

/** The sender's next nonce from either transport. */
export function nextNonce(source: RpcMethods | JanzeerClient, address: string): Promise<number> {
  return source instanceof JanzeerClient ? source.nonce(address) : source.getNonce(address);
}

export interface SendAndWaitOptions extends WaitOptions {
  /** where to submit; defaults to `wait` when it is an RPC transport */
  submitVia?: JanzeerClient | RpcMethods;
}

/** Submit a signed transaction and wait for finality. `via` is used for both unless `submitVia` is given. */
export async function sendAndWait(via: RpcMethods | JanzeerClient, tx: SignedTx, opts: SendAndWaitOptions = {}): Promise<TxView> {
  const submitter = opts.submitVia ?? via;
  if (submitter instanceof JanzeerClient) await submitter.submit(tx);
  else await submitter.send(tx);
  return waitForFinality(via, tx.hash, opts);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error('aborted'));
    }, { once: true });
  });
}
