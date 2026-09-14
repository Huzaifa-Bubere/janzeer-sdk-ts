/** A signing identity: private key → public key → address. The node never sees the private key. @module */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { publicKeyToAddress, toChecksumAddress } from './crypto/address.js';
import { bytesToHex, hexToBytes } from './crypto/bytes.js';
import { deriveDefault, derivePath, type HdNode } from './crypto/hd.js';
import { isValidPrivateKey, signHash, verifyHash } from './crypto/sign.js';
import { Mnemonic } from './mnemonic.js';
import { SignedTx, UnsignedTx, type TxFields } from './tx/types.js';
import type { TxType } from './constants.js';

export class Account {
  /** compressed secp256k1 public key, hex (66 chars) */
  readonly publicKeyHex: string;
  /** canonical lowercase address */
  readonly address: string;
  /** EIP-55 display form of {@link address} */
  readonly checksumAddress: string;
  readonly #priv: Uint8Array;

  private constructor(priv: Uint8Array) {
    this.#priv = priv;
    const pub = secp256k1.getPublicKey(priv, true);
    this.publicKeyHex = bytesToHex(pub);
    this.address = publicKeyToAddress(pub);
    this.checksumAddress = toChecksumAddress(this.address);
  }

  /** Wallet account from a BIP39 mnemonic (Janzeer seed, path `m/0/0/0`). */
  static fromMnemonic(mnemonic: string, passphrase = ''): Account {
    if (!Mnemonic.validate(mnemonic)) throw new RangeError('invalid mnemonic (unknown word or bad checksum)');
    return Account.fromSeed(Mnemonic.toSeed(mnemonic, passphrase));
  }

  /** Account from a 64-byte seed (default path `m/0/0/0`; any non-hardened path accepted). */
  static fromSeed(seed: Uint8Array, path?: string): Account {
    const node: HdNode = path ? derivePath(seed, path) : deriveDefault(seed);
    return new Account(node.priv);
  }

  /** Account from a raw private key (hex, optional `0x`). */
  static fromPrivateKey(privateKeyHex: string): Account {
    if (!isValidPrivateKey(privateKeyHex)) throw new RangeError('invalid secp256k1 private key');
    return new Account(hexToBytes(privateKeyHex));
  }

  /** A fresh random key (not mnemonic-backed; prefer `Mnemonic.generate()` + `fromMnemonic` for user wallets). */
  static random(): Account {
    return new Account(secp256k1.utils.randomSecretKey(randomBytes(32)));
  }

  /** The private key as hex. Handle with care: never log or send it. */
  get privateKeyHex(): string {
    return bytesToHex(this.#priv);
  }

  /** RFC-6979 low-S DER signature (Base64) over a 32-byte digest given as hex. */
  sign(hashHex: string): string {
    return signHash(hashHex, this.privateKeyHex);
  }

  /** Verify a signature made by this account. */
  verify(hashHex: string, signatureBase64: string): boolean {
    return verifyHash(hashHex, signatureBase64, this.publicKeyHex);
  }

  /** Hash and sign an {@link UnsignedTx}. Throws if the tx names another sender. */
  signTx<F extends TxFields, T extends TxType>(tx: UnsignedTx<F, T>): SignedTx<F, T> {
    if (tx.senderAddress !== this.address) throw new RangeError(`tx sender ${tx.senderAddress} is not this account (${this.address})`);
    return tx.withSignature(this.sign(tx.hash()), this.publicKeyHex);
  }

  toJSON(): { address: string; publicKeyHex: string } {
    return { address: this.address, publicKeyHex: this.publicKeyHex };
  }
}
