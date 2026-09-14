import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decryptVault, encryptVault, VaultError } from '../src/vault/index.js';

const F = JSON.parse(readFileSync(new URL('./vectors/vault-fixture.json', import.meta.url), 'utf8'));

describe('vault', () => {
  it('decrypts the cross-SDK fixture', () => {
    expect(decryptVault(F.blob, F.password)).toBe(F.secret);
    expect(() => decryptVault(F.blob, F.wrongPassword)).toThrow(VaultError);
  });
  it('round-trips a fresh blob', () => {
    const blob = encryptVault('top secret', 'pw');
    expect(blob.v).toBe(1);
    expect(decryptVault(blob, 'pw')).toBe('top secret');
    expect(() => decryptVault({ ...blob, ct: blob.ct.slice(0, -4) + 'AAAA' }, 'pw')).toThrow(VaultError);
  });
});
