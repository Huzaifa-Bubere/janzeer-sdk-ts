/** BIP39 English mnemonics (standard wordlist + checksum); only the seed derivation is Janzeer-specific — see {@link mnemonicToSeed}. @module */
import { generateMnemonic as bip39Generate, validateMnemonic as bip39Validate, entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { mnemonicToSeed } from './crypto/hd.js';

export const Mnemonic = Object.freeze({
  /** A fresh mnemonic: 12 words (128-bit, default), 15 (160), 18 (192), 21 (224) or 24 (256). */
  generate(strength: 128 | 160 | 192 | 224 | 256 = 128): string {
    return bip39Generate(wordlist, strength);
  },
  /** Wordlist membership + checksum. Client-side UX only — the node never sees a mnemonic. */
  validate(mnemonic: string): boolean {
    try {
      return bip39Validate(mnemonic.trim().toLowerCase().split(/\s+/).join(' '), wordlist);
    } catch {
      return false;
    }
  },
  /** Normalize whitespace and case so equivalent phrases derive the same seed. */
  normalize(mnemonic: string): string {
    return mnemonic.trim().toLowerCase().split(/\s+/).join(' ');
  },
  /** Janzeer seed (PBKDF2-HMAC-SHA512, salt `@_Janzeer_Blockchain_@` + passphrase) — NOT the BIP39 standard seed. */
  toSeed(mnemonic: string, passphrase = ''): Uint8Array {
    return mnemonicToSeed(Mnemonic.normalize(mnemonic), passphrase);
  },
  /** Entropy bytes → mnemonic (for hardware / dice-generated entropy). */
  fromEntropy(entropy: Uint8Array): string {
    return entropyToMnemonic(entropy, wordlist);
  },
  /** Mnemonic → entropy bytes. */
  toEntropy(mnemonic: string): Uint8Array {
    return mnemonicToEntropy(Mnemonic.normalize(mnemonic), wordlist);
  },
  /** The 2048 English words. */
  wordlist,
});
