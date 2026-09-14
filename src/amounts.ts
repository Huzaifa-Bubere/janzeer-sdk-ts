/**
 * Native-coin amount handling. Amounts cross this SDK as decimal STRINGS (`"1.5"`, `"0.01"`) — never floats —
 * and are scaled to an int64 (`bigint`) exactly the way the node's `ByteUtils.toScaledLong` does.
 * @module
 */
import { DECIMALS, TICKER } from './constants.js';

const SCALE = 10n ** BigInt(DECIMALS);
const DECIMAL_RE = /^-?(\d+)(?:\.(\d+))?$/;

/** Amount input accepted everywhere: a decimal string (preferred), a bigint of whole coins, or a number (avoid for values with more than 15 significant digits). */
export type AmountLike = string | number | bigint;

/** Canonicalize an amount: returns a decimal string with no exponent, no leading `+`, no trailing zeros beyond what was given. Throws on anything that is not a plain decimal. */
export function normalizeAmount(amount: AmountLike): string {
  if (typeof amount === 'bigint') return amount.toString();
  const s = typeof amount === 'number' ? numberToDecimal(amount) : amount.trim();
  if (!DECIMAL_RE.test(s)) throw new RangeError(`Not a decimal amount: ${JSON.stringify(amount)}`);
  return s;
}

/** True when `amount` is a plain decimal with at most {@link DECIMALS} fractional digits (what the node accepts). */
export function isValidAmount(amount: AmountLike): boolean {
  try {
    const s = normalizeAmount(amount);
    const frac = s.split('.')[1] ?? '';
    return frac.length <= DECIMALS;
  } catch {
    return false;
  }
}

/**
 * `ByteUtils.toScaledLong`: `BigDecimal(amount).setScale(8, HALF_UP) × 10^8` as an integer.
 * Pinned by the `scaled` table of the conformance vectors.
 */
export function toScaledLong(amount: AmountLike): bigint {
  const s = normalizeAmount(amount);
  const neg = s.startsWith('-');
  const [intPart = '0', fracPart = ''] = (neg ? s.slice(1) : s).split('.');
  const frac8 = (fracPart + '0'.repeat(DECIMALS)).slice(0, DECIMALS);
  let scaled = BigInt(intPart) * SCALE + BigInt(frac8);
  const ninth = fracPart.charCodeAt(DECIMALS);
  if (!Number.isNaN(ninth) && ninth - 48 >= 5) scaled += 1n; // HALF_UP on the first dropped digit
  return neg ? -scaled : scaled;
}

/** Inverse of {@link toScaledLong}: an int64 of base units → decimal string with exactly 8 fractional digits (`"1.50000000"`). */
export function fromScaledLong(scaled: bigint | number | string): string {
  const v = BigInt(scaled);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const int = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(DECIMALS, '0');
  return `${neg ? '-' : ''}${int}.${frac}`;
}

export interface FormatOptions {
  /** fractional digits to keep (default {@link DECIMALS}); trailing zeros are trimmed unless `trim: false` */
  decimals?: number;
  /** trim trailing zeros and a dangling `.` (default `true`) */
  trim?: boolean;
  /** append ` JNZ` (default `true`) */
  ticker?: boolean;
  /** group thousands with `,` (default `false`) */
  group?: boolean;
}

/** Human-readable JNZ amount: `formatJnz("1.50000000")` → `"1.5 JNZ"`, `formatJnz("1234.5", { group: true, ticker: false })` → `"1,234.5"`. Truncates (never rounds) beyond `decimals`. */
export function formatJnz(amount: AmountLike, opts: FormatOptions = {}): string {
  const { decimals = DECIMALS, trim = true, ticker = true, group = false } = opts;
  const s = normalizeAmount(amount);
  const neg = s.startsWith('-');
  let [int = '0', frac = ''] = (neg ? s.slice(1) : s).split('.');
  frac = frac.slice(0, decimals);
  if (trim) frac = frac.replace(/0+$/, '');
  else if (frac.length < decimals) frac = frac.padEnd(decimals, '0');
  if (group) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const out = `${neg ? '-' : ''}${int}${frac ? '.' + frac : ''}`;
  return ticker ? `${out} ${TICKER}` : out;
}

/** Parse user input like `"1,234.5 JNZ"` into a canonical amount string (`"1234.5"`). Throws on garbage. */
export function parseJnz(input: string): string {
  const cleaned = input.replace(new RegExp(`\\s*${TICKER}\\s*$`, 'i'), '').replace(/,/g, '').trim();
  return normalizeAmount(cleaned);
}

/** Exact decimal comparison of two amounts: -1, 0 or 1. */
export function compareAmounts(a: AmountLike, b: AmountLike): -1 | 0 | 1 {
  const x = toScaledLong(a);
  const y = toScaledLong(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Exact `a + b` as a canonical 8-decimal string. */
export function addAmounts(a: AmountLike, b: AmountLike): string {
  return fromScaledLong(toScaledLong(a) + toScaledLong(b));
}

/** Exact `a - b` as a canonical 8-decimal string. */
export function subAmounts(a: AmountLike, b: AmountLike): string {
  return fromScaledLong(toScaledLong(a) - toScaledLong(b));
}

function numberToDecimal(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`Not a finite amount: ${n}`);
  const s = String(n);
  if (!/e/i.test(s)) return s;
  // expand exponent notation (e.g. 1e-7) without floating arithmetic
  const [mant, expStr] = s.toLowerCase().split('e') as [string, string];
  const exp = Number(expStr);
  const neg = mant.startsWith('-');
  const digits = (neg ? mant.slice(1) : mant).replace('.', '');
  const pointAt = (mant.indexOf('.') === -1 ? (neg ? mant.length - 1 : mant.length) : mant.indexOf('.') - (neg ? 1 : 0)) + exp;
  let out: string;
  if (pointAt <= 0) out = '0.' + '0'.repeat(-pointAt) + digits;
  else if (pointAt >= digits.length) out = digits + '0'.repeat(pointAt - digits.length);
  else out = digits.slice(0, pointAt) + '.' + digits.slice(pointAt);
  return (neg ? '-' : '') + out.replace(/^0+(?=\d)/, '');
}
