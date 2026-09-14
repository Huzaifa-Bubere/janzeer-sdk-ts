import { describe, expect, it } from 'vitest';
import { addAmounts, compareAmounts, formatJnz, fromScaledLong, isValidAmount, normalizeAmount, parseJnz, subAmounts, toScaledLong } from '../src/amounts.js';

describe('amounts', () => {
  it('toScaledLong matches BigDecimal.setScale(8, HALF_UP)', () => {
    expect(toScaledLong('0.01')).toBe(1_000_000n);
    expect(toScaledLong('1.5')).toBe(150_000_000n);
    expect(toScaledLong(0.1)).toBe(10_000_000n);
    expect(toScaledLong('0.123456785')).toBe(12_345_679n); // HALF_UP on the 9th digit
    expect(toScaledLong('0.123456784')).toBe(12_345_678n);
    expect(toScaledLong('-2')).toBe(-200_000_000n);
    expect(toScaledLong(1e-7)).toBe(10n);
    expect(toScaledLong(123456789012345n)).toBe(12345678901234500000000n);
  });
  it('fromScaledLong is the inverse with 8 fixed decimals', () => {
    expect(fromScaledLong(150_000_000n)).toBe('1.50000000');
    expect(fromScaledLong(1n)).toBe('0.00000001');
    expect(fromScaledLong(-1n)).toBe('-0.00000001');
    expect(fromScaledLong('0')).toBe('0.00000000');
  });
  it('formatJnz / parseJnz', () => {
    expect(formatJnz('1.50000000')).toBe('1.5 JNZ');
    expect(formatJnz('1234.5', { group: true, ticker: false })).toBe('1,234.5');
    expect(formatJnz('2', { trim: false, decimals: 2 })).toBe('2.00 JNZ');
    expect(formatJnz('0.123456789', { ticker: false })).toBe('0.12345678');
    expect(parseJnz('1,234.5 JNZ')).toBe('1234.5');
    expect(() => parseJnz('abc')).toThrow(RangeError);
  });
  it('validation and arithmetic', () => {
    expect(isValidAmount('0.00000001')).toBe(true);
    expect(isValidAmount('0.000000001')).toBe(false);
    expect(isValidAmount('1e3')).toBe(false);
    expect(normalizeAmount(' 1.25 ')).toBe('1.25');
    expect(() => normalizeAmount('1,25')).toThrow(RangeError);
    expect(compareAmounts('1.10', '1.1')).toBe(0);
    expect(compareAmounts('0.01', '0.1')).toBe(-1);
    expect(addAmounts('1.25', '0.01')).toBe('1.26000000');
    expect(subAmounts('100', '1.26')).toBe('98.74000000');
  });
});
