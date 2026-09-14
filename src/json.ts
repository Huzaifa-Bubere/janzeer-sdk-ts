/**
 * Lossless JSON. The node serializes coin amounts (`BigDecimal`, 8 decimals) and token amounts (`BigInteger`) as
 * bare JSON numbers; `JSON.parse` would round them through a double. This parser keeps every number as its exact
 * source text ({@link JsonNumber}); the model mappers then convert each field to the type it documents.
 * @module
 */

/** A JSON number kept as its exact source text. */
export class JsonNumber {
  constructor(readonly raw: string) {}
  /** Exact decimal string (`"1.50000000"`, `"0"`, `"1e3"` normalized to `"1000"`). */
  toDecimalString(): string {
    return normalizeNumberText(this.raw);
  }
  /** Integer as bigint (throws if the number has a fractional part). */
  toBigInt(): bigint {
    const s = this.toDecimalString();
    if (s.includes('.')) throw new RangeError(`not an integer: ${this.raw}`);
    return BigInt(s);
  }
  /** As a JS number (may lose precision — only for values known to be small). */
  toNumber(): number {
    return Number(this.raw);
  }
  /** Safe-integer JS number (throws beyond ±2^53). */
  toSafeInteger(): number {
    const b = this.toBigInt();
    if (b > BigInt(Number.MAX_SAFE_INTEGER) || b < BigInt(Number.MIN_SAFE_INTEGER)) throw new RangeError(`integer exceeds 2^53: ${this.raw}`);
    return Number(b);
  }
  toString(): string {
    return this.toDecimalString();
  }
  toJSON(): unknown {
    return this.toDecimalString();
  }
}

export type JsonValue = null | boolean | string | JsonNumber | JsonValue[] | { [k: string]: JsonValue };

/** Parse JSON text; numbers become {@link JsonNumber}. Throws `SyntaxError` on invalid input. */
export function parseJson(text: string): JsonValue {
  const p = new Parser(text);
  p.ws();
  const v = p.value();
  p.ws();
  if (p.i !== text.length) p.fail('trailing characters');
  return v;
}

class Parser {
  i = 0;
  constructor(readonly s: string) {}
  fail(msg: string): never {
    throw new SyntaxError(`JSON parse error at ${this.i}: ${msg}`);
  }
  ws() {
    const s = this.s;
    while (this.i < s.length) {
      const c = s.charCodeAt(this.i);
      if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) this.i++;
      else break;
    }
  }
  value(): JsonValue {
    const c = this.s[this.i];
    switch (c) {
      case '{':
        return this.object();
      case '[':
        return this.array();
      case '"':
        return this.string();
      case 't':
        return this.literal('true', true);
      case 'f':
        return this.literal('false', false);
      case 'n':
        return this.literal('null', null);
      default:
        if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return this.number();
        return this.fail(`unexpected ${JSON.stringify(c)}`);
    }
  }
  literal<T>(word: string, v: T): T {
    if (this.s.startsWith(word, this.i)) {
      this.i += word.length;
      return v;
    }
    return this.fail(`expected ${word}`);
  }
  number(): JsonNumber {
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.s.slice(this.i));
    if (!m) this.fail('bad number');
    this.i += m[0].length;
    return new JsonNumber(m[0]);
  }
  string(): string {
    this.i++; // opening quote
    let out = '';
    const s = this.s;
    while (this.i < s.length) {
      const c = s[this.i++]!;
      if (c === '"') return out;
      if (c === '\\') {
        const e = s[this.i++];
        switch (e) {
          case '"': out += '"'; break;
          case '\\': out += '\\'; break;
          case '/': out += '/'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          case 'u': {
            const hex = s.slice(this.i, this.i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('bad \\u escape');
            out += String.fromCharCode(parseInt(hex, 16));
            this.i += 4;
            break;
          }
          default:
            this.fail('bad escape');
        }
      } else out += c;
    }
    return this.fail('unterminated string');
  }
  array(): JsonValue[] {
    this.i++;
    const out: JsonValue[] = [];
    this.ws();
    if (this.s[this.i] === ']') {
      this.i++;
      return out;
    }
    for (;;) {
      this.ws();
      out.push(this.value());
      this.ws();
      const c = this.s[this.i++];
      if (c === ']') return out;
      if (c !== ',') this.fail('expected , or ]');
    }
  }
  object(): { [k: string]: JsonValue } {
    this.i++;
    const out: { [k: string]: JsonValue } = {};
    this.ws();
    if (this.s[this.i] === '}') {
      this.i++;
      return out;
    }
    for (;;) {
      this.ws();
      if (this.s[this.i] !== '"') this.fail('expected key');
      const k = this.string();
      this.ws();
      if (this.s[this.i++] !== ':') this.fail('expected :');
      this.ws();
      out[k] = this.value();
      this.ws();
      const c = this.s[this.i++];
      if (c === '}') return out;
      if (c !== ',') this.fail('expected , or }');
    }
  }
}

/** Expand exponent notation and strip a leading `+`/redundant zeros, keeping every significant digit. */
export function normalizeNumberText(raw: string): string {
  let s = raw.trim();
  const neg = s.startsWith('-');
  if (neg || s.startsWith('+')) s = s.slice(1);
  const eIdx = s.search(/[eE]/);
  let mant = eIdx === -1 ? s : s.slice(0, eIdx);
  const exp = eIdx === -1 ? 0 : parseInt(s.slice(eIdx + 1), 10);
  let [int = '0', frac = ''] = mant.split('.');
  if (exp !== 0) {
    const digits = int + frac;
    const point = int.length + exp;
    if (point <= 0) {
      int = '0';
      frac = '0'.repeat(-point) + digits;
    } else if (point >= digits.length) {
      int = digits + '0'.repeat(point - digits.length);
      frac = '';
    } else {
      int = digits.slice(0, point);
      frac = digits.slice(point);
    }
  }
  int = int.replace(/^0+(?=\d)/, '');
  frac = frac.replace(/0+$/, '');
  mant = frac ? `${int}.${frac}` : int;
  if (mant === '0' || mant === '') return '0';
  return (neg ? '-' : '') + mant;
}

// ---- field converters used by the model mappers ----

export function asString(v: JsonValue | undefined, field = 'value'): string {
  if (typeof v === 'string') return v;
  if (v instanceof JsonNumber) return v.toDecimalString();
  throw new TypeError(`expected string for ${field}, got ${describe(v)}`);
}
export function asOptString(v: JsonValue | undefined): string | null {
  return v == null ? null : asString(v);
}
/** Decimal amount field → canonical string (numbers and strings both accepted). */
export function asDecimal(v: JsonValue | undefined, field = 'value'): string {
  if (v instanceof JsonNumber) return v.toDecimalString();
  if (typeof v === 'string') return normalizeNumberText(v);
  throw new TypeError(`expected decimal for ${field}, got ${describe(v)}`);
}
export function asOptDecimal(v: JsonValue | undefined): string | null {
  return v == null ? null : asDecimal(v);
}
/** Integer field that fits a JS number. */
export function asInt(v: JsonValue | undefined, field = 'value'): number {
  if (v instanceof JsonNumber) return v.toSafeInteger();
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return Number(v);
  throw new TypeError(`expected integer for ${field}, got ${describe(v)}`);
}
export function asOptInt(v: JsonValue | undefined): number | null {
  return v == null ? null : asInt(v);
}
/** Arbitrary-size integer field (token amounts) → bigint. */
export function asBigInt(v: JsonValue | undefined, field = 'value'): bigint {
  if (v instanceof JsonNumber) return v.toBigInt();
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return BigInt(v);
  throw new TypeError(`expected integer for ${field}, got ${describe(v)}`);
}
export function asOptBigInt(v: JsonValue | undefined): bigint | null {
  return v == null ? null : asBigInt(v);
}
export function asBool(v: JsonValue | undefined, field = 'value'): boolean {
  if (typeof v === 'boolean') return v;
  throw new TypeError(`expected boolean for ${field}, got ${describe(v)}`);
}
export function asObject(v: JsonValue | undefined, field = 'value'): { [k: string]: JsonValue } {
  if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof JsonNumber)) return v;
  throw new TypeError(`expected object for ${field}, got ${describe(v)}`);
}
export function asArray(v: JsonValue | undefined, field = 'value'): JsonValue[] {
  if (Array.isArray(v)) return v;
  throw new TypeError(`expected array for ${field}, got ${describe(v)}`);
}
export function isObject(v: JsonValue | undefined): v is { [k: string]: JsonValue } {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof JsonNumber);
}
/** Convert a parsed tree to plain JS (numbers → number when safe, else string). Handy for logging / untyped access. */
export function toPlain(v: JsonValue): unknown {
  if (v instanceof JsonNumber) {
    const s = v.toDecimalString();
    const n = Number(s);
    return Number.isSafeInteger(n) && !s.includes('.') ? n : s;
  }
  if (Array.isArray(v)) return v.map(toPlain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]));
  return v;
}
function describe(v: unknown): string {
  return v === undefined ? 'undefined' : v === null ? 'null' : v instanceof JsonNumber ? `number ${v.raw}` : Array.isArray(v) ? 'array' : typeof v;
}
