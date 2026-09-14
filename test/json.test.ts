import { describe, expect, it } from 'vitest';
import { JsonNumber, normalizeNumberText, parseJson, toPlain } from '../src/json.js';

describe('lossless JSON', () => {
  it('keeps every digit of decimals and big integers', () => {
    const v = parseJson('{"balance": 123456789.12345678, "cap": 340282366920938463463374607431768211456, "n": -0, "e": 1.5e-7, "s": "x\\u0041\\n", "a": [true, null, 1]}') as any;
    expect(v.balance).toBeInstanceOf(JsonNumber);
    expect(v.balance.toDecimalString()).toBe('123456789.12345678');
    expect(v.cap.toBigInt()).toBe(340282366920938463463374607431768211456n);
    expect(() => v.cap.toSafeInteger()).toThrow(RangeError);
    expect(v.n.toDecimalString()).toBe('0');
    expect(v.e.toDecimalString()).toBe('0.00000015');
    expect(v.s).toBe('xA\n');
    expect(toPlain(v.a)).toEqual([true, null, 1]);
  });
  it('normalizes exponent notation exactly', () => {
    expect(normalizeNumberText('1e3')).toBe('1000');
    expect(normalizeNumberText('1.2345E+2')).toBe('123.45');
    expect(normalizeNumberText('-2.50')).toBe('-2.5');
    expect(normalizeNumberText('0.0')).toBe('0');
    expect(normalizeNumberText('007')).toBe('7');
  });
  it('rejects invalid JSON', () => {
    expect(() => parseJson('{"a":}')).toThrow(SyntaxError);
    expect(() => parseJson('[1,]')).toThrow(SyntaxError);
    expect(() => parseJson('1 2')).toThrow(SyntaxError);
  });
  it('toPlain yields numbers when safe, strings otherwise', () => {
    expect(toPlain(parseJson('{"a": 5, "b": 1.5, "c": 9007199254740993}'))).toEqual({ a: 5, b: '1.5', c: '9007199254740993' });
  });
});
