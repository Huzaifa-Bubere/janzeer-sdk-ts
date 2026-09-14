// Conformance: every entry of sdk_conformance/vectors/wallet-parity-vectors.json must be reproduced byte-for-byte.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Account, Mnemonic, SPEC_VERSION, TxBuilder, toChecksumAddress, toScaledLong, TokenOp, UnsignedTx } from '../src/index.js';
import { bytesToHex } from '../src/crypto/bytes.js';
import { deriveDefault, mnemonicToSeed } from '../src/crypto/hd.js';
import { exitValidatorPayload, registerValidatorPayload, tokenPayload, transactionBytes, transferPayload } from '../src/tx/payloads.js';
import { accountFromMnemonic, buildSignedTransfer, buildSignedPromoter, buildSignedExitPromoter, buildSignedTokenTx } from '../src/compat.js';

const dir = new URL('./vectors/', import.meta.url);
const V = JSON.parse(readFileSync(new URL('wallet-parity-vectors.json', dir), 'utf8'));

describe('vendored vectors', () => {
  it('match the conformance kit checksums', () => {
    const sums = readFileSync(new URL('SHA256SUMS', dir), 'utf8').trim().split('\n');
    for (const line of sums) {
      const [sha, name] = line.split(/\s+/) as [string, string];
      const actual = createHash('sha256').update(readFileSync(new URL(name, dir))).digest('hex');
      expect(actual, name).toBe(sha);
    }
  });
  it('are the format this SDK targets', () => {
    expect(V.vectorsVersion).toBe(SPEC_VERSION.vectors);
    expect(V.networkId).toBe('janzeer');
  });
});

describe('hd', () => {
  it('mnemonic → seed → m/0/0/0 → address', () => {
    const seed = mnemonicToSeed(V.hd.mnemonic, V.hd.passphrase);
    expect(bytesToHex(seed)).toBe(V.hd.seedHex);
    const node = deriveDefault(seed);
    expect(bytesToHex(node.priv)).toBe(V.hd.privHex);
    const a = Account.fromMnemonic(V.hd.mnemonic, V.hd.passphrase);
    expect(a.privateKeyHex).toBe(V.hd.privHex);
    expect(a.publicKeyHex).toBe(V.hd.pubHex);
    expect(a.address).toBe(V.hd.address);
    expect(Mnemonic.validate(V.hd.mnemonic)).toBe(true);
  });
  it('raw key → address', () => {
    const a = Account.fromPrivateKey(V.rawKey.privHex);
    expect(a.publicKeyHex).toBe(V.rawKey.pubHex);
    expect(a.address).toBe(V.rawKey.address);
  });
  it('addresses: EIP-55 overlay', () => {
    for (const { lower, checksum } of V.addresses) expect(toChecksumAddress(lower)).toBe(checksum);
  });
  it('scaled: toScaledLong table', () => {
    for (const { in: i, out } of V.scaled) expect(toScaledLong(i)).toBe(BigInt(out));
  });
});

const signer = () => Account.fromPrivateKey(V.rawKey.privHex);

function check(unsigned: UnsignedTx, v: any) {
  if (v.preimageHex) expect(bytesToHex(unsigned.preimage())).toBe(v.preimageHex);
  expect(unsigned.hash()).toBe(v.hash);
  const signed = signer().signTx(unsigned);
  expect(signed.signature).toBe(v.signature);
  expect(signed.senderPublicKey).toBe(v.publicKey);
  expect(signer().verify(signed.hash, signed.signature)).toBe(true);
  return signed;
}

describe('transactions (TxBuilder + Account.signTx)', () => {
  it('transferTx', () => {
    const v = V.transferTx;
    const s = check(TxBuilder.transfer({ from: v.senderAddress, to: v.recipientAddress, amount: v.amount, data: v.data, fee: v.fee, nonce: v.nonce, timestamp: v.timestamp }), v);
    expect(s.toRestBody()).toMatchObject({ timestamp: v.timestamp, fee: v.fee, nonce: v.nonce, hash: v.hash, senderAddress: v.senderAddress, senderPublicKey: v.publicKey, senderSignature: v.signature, amount: v.amount, recipientAddress: v.recipientAddress, data: v.data });
  });
  it('transferNoMemoTx', () => {
    const v = V.transferNoMemoTx;
    const s = check(TxBuilder.transfer({ from: v.senderAddress, to: v.recipientAddress, amount: v.amount, fee: v.fee, nonce: v.nonce, timestamp: v.timestamp }), v);
    expect(s.toRestBody()).not.toHaveProperty('data');
  });
  it('promoterTx (registerValidator)', () => {
    const v = V.promoterTx;
    check(TxBuilder.registerValidator({ from: v.senderAddress, validatorKey: v.promoterKey, amount: v.amount, fee: v.fee, nonce: v.nonce, timestamp: v.timestamp }), v);
  });
  it('exitPromoterTx (exitValidator)', () => {
    const v = V.exitPromoterTx;
    check(TxBuilder.exitValidator({ from: v.senderAddress, validatorKey: v.promoterKey, fee: v.fee, nonce: v.nonce, timestamp: v.timestamp }), v);
  });
  it('tokenCreateTx', () => {
    const v = V.tokenCreateTx;
    check(TxBuilder.token.create({ from: v.senderAddress, symbol: v.symbol, name: v.name, decimals: v.decimals, cap: v.cap, amount: v.amount, fee: v.fee, nonce: v.nonce, timestamp: v.timestamp }), v);
  });
  it('tokenTransferTx', () => {
    const v = V.tokenTransferTx;
    check(TxBuilder.token.transfer({ from: v.senderAddress, tokenId: v.tokenId, amount: v.amount, recipient: v.recipient, fee: v.fee, nonce: v.nonce, timestamp: v.timestamp }), v);
  });
});

describe('low-level payload functions', () => {
  it('transfer preimage', () => {
    const v = V.transferTx;
    expect(bytesToHex(transactionBytes(v, transferPayload(v)))).toBe(v.preimageHex);
  });
  it('promoter / exit preimages', () => {
    const p = V.promoterTx;
    expect(bytesToHex(transactionBytes(p, registerValidatorPayload({ amount: p.amount, validatorKey: p.promoterKey })))).toBe(p.preimageHex);
    const e = V.exitPromoterTx;
    expect(bytesToHex(transactionBytes(e, exitValidatorPayload({ validatorKey: e.promoterKey })))).toBe(e.preimageHex);
  });
  it('token preimages', () => {
    for (const v of [V.tokenCreateTx, V.tokenTransferTx]) expect(bytesToHex(transactionBytes(v, tokenPayload(v)))).toBe(v.preimageHex);
    expect(TokenOp.TRANSFER).toBe(V.tokenTransferTx.op);
  });
});

describe('@janzeer/sdk/crypto compat layer', () => {
  it('reproduces the legacy janzeerCrypto.js results', () => {
    const acct = accountFromMnemonic(V.hd.mnemonic);
    expect(acct).toEqual({ privHex: V.hd.privHex, pubHex: V.hd.pubHex, address: V.hd.address });
    const t = V.transferTx;
    const s = buildSignedTransfer({ ...t, publicKey: t.publicKey, privHex: V.rawKey.privHex });
    expect(s.hash).toBe(t.hash);
    expect(s.signature).toBe(t.signature);
    const p = V.promoterTx;
    expect(buildSignedPromoter({ ...p, privHex: V.rawKey.privHex }).signature).toBe(p.signature);
    const e = V.exitPromoterTx;
    expect(buildSignedExitPromoter({ ...e, privHex: V.rawKey.privHex }).signature).toBe(e.signature);
    for (const v of [V.tokenCreateTx, V.tokenTransferTx]) expect(buildSignedTokenTx({ ...v, privHex: V.rawKey.privHex }).hash).toBe(v.hash);
  });
});
