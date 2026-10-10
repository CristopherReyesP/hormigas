// Generic object-graph codec for save games.
//
// The simulation keeps its state in plain fields of plain classes (the World,
// the grids, every System). Instead of a hand-written serializer per class,
// which would silently miss every field a later branch adds, this walks the
// live objects by reflection and writes every data field it finds:
// primitives, arrays, plain objects, Maps, Sets, typed arrays and nested class
// instances. What it never writes:
//   - functions (callbacks, providers) and anything in `skip` (the other
//     roots: a System's `world` field is the World, saved once on its own);
//   - fields a policy denies by class name (VFX pools, render caches, timers
//     read off the wall clock);
//   - instances of denied classes.
// Shared objects are written once and referenced after (`$r`), so identity
// survives a round trip.
//
// Decoding writes back INTO the live objects of a freshly built game wherever
// one already sits at the same place: class instances keep their prototype,
// Maps, arrays and plain objects keep their identity (systems cache component
// stores, grids hand out tile objects), and fields the save does not carry
// (callbacks, wiring) are left alone.

export type Encoded = unknown;

export interface CodecPolicy {
  /** Objects never written (another root, or wiring) */
  readonly skip: ReadonlySet<object>;
  /** Field names never written, by class name */
  readonly denyFields: Readonly<Record<string, readonly string[]>>;
  /** Instances of these classes are never written */
  readonly denyClasses: ReadonlySet<string>;
}

/** Arrays of plain records at least this long are written column by column */
const COLUMNAR_MIN = 16;

type TypedArray =
  | Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array
  | Int32Array | Uint32Array | Float32Array | Float64Array;

const TYPED_ARRAYS: Record<string, new (buffer: ArrayBuffer) => TypedArray> = {
  Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
  Int32Array, Uint32Array, Float32Array, Float64Array,
};

/** Thrown for a save whose shape does not fit the game it is loaded into */
export class SaveShapeError extends Error {}

function isTypedArray(v: object): v is TypedArray {
  return ArrayBuffer.isView(v) && !(v instanceof DataView);
}

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function className(v: object): string {
  return (Object.getPrototypeOf(v)?.constructor?.name as string | undefined) ?? 'Object';
}

// ── base64 for typed arrays (exact bytes, so floats round-trip bit for bit) ──

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function encodeTyped(v: TypedArray): Encoded {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  return { $t: className(v), d: bytesToBase64(bytes) };
}

function decodeTyped(enc: { $t: string; d: string }, hint: unknown): TypedArray {
  const Ctor = TYPED_ARRAYS[enc.$t];
  if (!Ctor) throw new SaveShapeError(`tipo desconocido ${enc.$t}`);
  const bytes = base64ToBytes(enc.d);
  const fresh = new Ctor(bytes.slice().buffer);
  if (hint instanceof Ctor && hint.length === fresh.length) {
    hint.set(fresh as never);
    return hint;
  }
  return fresh;
}

/** Marker for an array slot whose value is not written (a function or a skipped object) */
const OMITTED_SLOT = { $x: 1 };

export class Encoder {
  private readonly counts = new Map<object, number>();
  private readonly ids = new Map<object, number>();
  private nextId = 0;
  /** Classes written by reflection (for diagnostics) */
  readonly classes = new Set<string>();

  private readonly policy: CodecPolicy;

  constructor(policy: CodecPolicy) {
    this.policy = policy;
  }

  /** First pass over a root's fields: count how often each object is reached */
  count(root: object, fields: Record<string, unknown> = this.fieldsOf(root)): void {
    for (const key of Object.keys(fields)) this.countValue(fields[key]);
  }

  /** Second pass: a root's fields as JSON-safe data */
  encodeRoot(root: object, fields: Record<string, unknown> = this.fieldsOf(root)): Record<string, Encoded> {
    const out: Record<string, Encoded> = {};
    for (const key of Object.keys(fields)) {
      const value = fields[key];
      if (this.omitted(value)) continue;
      out[key] = this.encode(value);
    }
    return out;
  }

  /** A root's own data fields, minus the denied ones */
  fieldsOf(obj: object): Record<string, unknown> {
    const denied = this.policy.denyFields[className(obj)] ?? [];
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (denied.includes(key)) continue;
      out[key] = (obj as Record<string, unknown>)[key];
    }
    return out;
  }

  /** Values a save never writes */
  omitted(value: unknown): boolean {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return true;
    if (typeof value !== 'object' || value === null) return false;
    if (this.policy.skip.has(value)) return true;
    if (Array.isArray(value) || value instanceof Map || value instanceof Set || isTypedArray(value) || isPlainObject(value)) return false;
    if (value instanceof WeakMap || value instanceof WeakSet || value instanceof Promise) return true;
    if (typeof EventTarget !== 'undefined' && value instanceof EventTarget) return true;
    return this.policy.denyClasses.has(className(value));
  }

  private countValue(value: unknown): void {
    if (typeof value !== 'object' || value === null || this.omitted(value)) return;
    const seen = this.counts.get(value) ?? 0;
    this.counts.set(value, seen + 1);
    if (seen > 0) return;
    if (Array.isArray(value)) {
      for (const item of value) this.countValue(item);
    } else if (value instanceof Map) {
      for (const [k, v] of value) {
        this.countValue(k);
        this.countValue(v);
      }
    } else if (value instanceof Set) {
      for (const item of value) this.countValue(item);
    } else if (!isTypedArray(value)) {
      const fields = isPlainObject(value) ? (value as Record<string, unknown>) : this.fieldsOf(value);
      for (const key of Object.keys(fields)) this.countValue(fields[key]);
    }
  }

  encode(value: unknown): Encoded {
    switch (typeof value) {
      case 'undefined':
        return { $u: 1 };
      case 'number':
        if (Number.isFinite(value)) return Object.is(value, -0) ? { $n: '-0' } : value;
        return { $n: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Inf' : '-Inf' };
      case 'string':
      case 'boolean':
        return value;
      case 'object':
        break;
      default:
        return OMITTED_SLOT;
    }
    if (value === null) return null;
    if (this.omitted(value)) return OMITTED_SLOT;
    const known = this.ids.get(value);
    if (known !== undefined) return { $r: known };
    const shared = (this.counts.get(value) ?? 1) > 1;
    const id = shared ? this.nextId++ : -1;
    if (shared) this.ids.set(value, id);
    const tag = (body: Record<string, Encoded>): Encoded => (shared ? { $id: id, ...body } : body);

    if (Array.isArray(value)) {
      const columns = shared ? null : this.columnar(value);
      if (columns) return columns;
      const items = value.map((item) => this.encode(item));
      return shared ? tag({ $a: items }) : items;
    }
    if (value instanceof Map) {
      // A component store: ids once, then the records column by column
      const keys = [...value.keys()];
      if (keys.every((k) => typeof k === 'string' || (typeof k === 'number' && Number.isFinite(k)))) {
        const columns = this.columnar([...value.values()]);
        if (columns) return tag({ $mk: runLength(keys), $mv: columns });
      }
      return tag({ $m: [...value].map(([k, v]) => [this.encode(k), this.encode(v)]) });
    }
    if (value instanceof Set) {
      return tag({ $s: [...value].map((item) => this.encode(item)) });
    }
    if (isTypedArray(value)) {
      return tag(encodeTyped(value) as Record<string, Encoded>);
    }
    if (isPlainObject(value)) {
      const body: Record<string, Encoded> = {};
      let dollar = false;
      for (const key of Object.keys(value)) {
        const v = (value as Record<string, unknown>)[key];
        if (this.omitted(v)) continue;
        if (key.startsWith('$')) dollar = true;
        body[key] = this.encode(v);
      }
      return shared || dollar ? tag({ $p: body }) : body;
    }
    const name = className(value);
    this.classes.add(name);
    const fields = this.fieldsOf(value);
    const body: Record<string, Encoded> = {};
    for (const key of Object.keys(fields)) {
      if (this.omitted(fields[key])) continue;
      body[key] = this.encode(fields[key]);
    }
    return tag({ $c: name, $o: body });
  }

  /**
   * A long array of plain records with the same keys (tiles, waypoints) is
   * written as columns, each key once. Values are primitives or unshared
   * plain objects (a tile's food pile). Number columns that are not all small
   * integers are written as raw Float64 bytes (exact), sparse when mostly 0;
   * other columns are run-length encoded.
   */
  private columnar(arr: unknown[]): Encoded | null {
    if (arr.length < COLUMNAR_MIN) return null;
    const first = arr[0];
    if (typeof first !== 'object' || first === null || !isPlainObject(first)) return null;
    const keys = Object.keys(first);
    if (keys.length === 0 || keys.some((k) => k.startsWith('$'))) return null;
    for (const row of arr) {
      if (typeof row !== 'object' || row === null || !isPlainObject(row)) return null;
      if ((this.counts.get(row) ?? 1) > 1) return null;
      const rowKeys = Object.keys(row);
      if (rowKeys.length !== keys.length) return null;
      for (let i = 0; i < keys.length; i++) {
        if (rowKeys[i] !== keys[i]) return null;
        const v = (row as Record<string, unknown>)[keys[i]];
        if (v === null || typeof v === 'string' || typeof v === 'boolean') continue;
        if (typeof v === 'number' && Number.isFinite(v) && !Object.is(v, -0)) continue;
        if (typeof v === 'object' && isPlainObject(v) && (this.counts.get(v) ?? 1) === 1) continue;
        return null;
      }
    }
    const cols = keys.map((key) => {
      const col = arr.map((row) => (row as Record<string, unknown>)[key]);
      if (col.every((v) => typeof v === 'number') && !col.every((v) => Number.isInteger(v) && Math.abs(v as number) < 1e9)) {
        return encodeFloats(col as number[]);
      }
      return runLength(col.map((v) => (typeof v === 'object' && v !== null ? this.encode(v) : v)));
    });
    return { $cols: keys, n: arr.length, v: cols };
  }
}

/** Exact floats: raw Float64 bytes, only the non-zero ones (with their indices) when that is smaller */
function encodeFloats(col: number[]): Encoded {
  const nonZero: number[] = [];
  for (let i = 0; i < col.length; i++) if (col[i] !== 0) nonZero.push(i);
  if (nonZero.length * 2 < col.length) {
    // Index gaps keep the numbers short
    const gaps = nonZero.map((idx, k) => (k === 0 ? idx : idx - nonZero[k - 1]));
    return { $z: gaps, d: bytesToBase64(new Uint8Array(Float64Array.from(nonZero, (i) => col[i]).buffer)) };
  }
  return { $f: bytesToBase64(new Uint8Array(Float64Array.from(col).buffer)) };
}

/** Runs of equal primitives as [value, count, ...] when that is shorter */
function runLength(col: unknown[]): Encoded {
  const runs: unknown[] = [];
  for (let i = 0; i < col.length; ) {
    let j = i + 1;
    if (typeof col[i] !== 'object' || col[i] === null) while (j < col.length && col[j] === col[i]) j++;
    runs.push(col[i], j - i);
    i = j;
  }
  return runs.length < col.length ? { $rle: runs } : col;
}

function readFloats(b64: string): Float64Array {
  const bytes = base64ToBytes(b64);
  if (bytes.length % 8 !== 0) throw new SaveShapeError('columna numérica rota');
  return new Float64Array(bytes.buffer);
}

/** A column as its encoded values, one per row */
function decodeColumn(enc: unknown, length: number): unknown[] {
  let out: unknown[];
  if (Array.isArray(enc)) {
    out = enc;
  } else if (typeof enc === 'object' && enc !== null && '$f' in enc) {
    out = Array.from(readFloats((enc as { $f: string }).$f));
  } else if (typeof enc === 'object' && enc !== null && '$z' in enc) {
    const { $z: gaps, d } = enc as { $z: number[]; d: string };
    const values = readFloats(d);
    if (values.length !== gaps.length) throw new SaveShapeError('columna dispersa rota');
    const sparse = new Array<unknown>(length).fill(0);
    let idx = 0;
    gaps.forEach((gap, k) => {
      idx = k === 0 ? gap : idx + gap;
      if (idx < 0 || idx >= length) throw new SaveShapeError('columna dispersa rota');
      sparse[idx] = values[k];
    });
    out = sparse;
  } else if (typeof enc === 'object' && enc !== null && '$rle' in enc) {
    const runs = (enc as { $rle: unknown[] }).$rle;
    out = [];
    for (let i = 0; i < runs.length; i += 2) {
      const count = runs[i + 1] as number;
      if (!Number.isInteger(count) || count < 1 || out.length + count > length) throw new SaveShapeError('columna con largo distinto');
      for (let n = 0; n < count; n++) out.push(runs[i]);
    }
  } else {
    throw new SaveShapeError('columna ilegible');
  }
  if (out.length !== length) throw new SaveShapeError('columna con largo distinto');
  return out;
}

/** Drop a reused object's data keys unless it already has exactly `keys`, in order */
function resetKeys(target: Record<string, unknown>, keys: readonly string[]): void {
  const own = Object.keys(target).filter((key) => typeof target[key] !== 'function');
  if (own.length === keys.length && own.every((key, i) => key === keys[i])) return;
  for (const key of own) delete target[key];
}

export class Decoder {
  private readonly ids = new Map<number, unknown>();
  /** Class instances the fresh game had no live object for (written as plain objects) */
  readonly orphans = new Set<string>();

  /** Write a root's saved fields into the live object */
  decodeRoot(target: object, data: unknown): void {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new SaveShapeError(`${className(target)}: datos inválidos`);
    }
    const t = target as Record<string, unknown>;
    for (const key of Object.keys(data)) {
      t[key] = this.decode((data as Record<string, unknown>)[key], t[key]);
    }
  }

  decode(enc: unknown, hint: unknown): unknown {
    if (enc === null || typeof enc !== 'object') return enc;
    if (Array.isArray(enc)) return this.decodeArray(enc, hint, -1);
    const e = enc as Record<string, unknown>;
    if ('$x' in e) return hint;
    if ('$u' in e) return undefined;
    if ('$n' in e) return e.$n === 'NaN' ? NaN : e.$n === 'Inf' ? Infinity : e.$n === '-Inf' ? -Infinity : -0;
    if ('$r' in e) {
      if (!this.ids.has(e.$r as number)) throw new SaveShapeError(`referencia rota ${String(e.$r)}`);
      return this.ids.get(e.$r as number);
    }
    const id = typeof e.$id === 'number' ? e.$id : -1;
    if ('$a' in e) return this.decodeArray(e.$a as unknown[], hint, id);
    if ('$cols' in e) return this.decodeColumns(e as { $cols: string[]; n: number; v: unknown[] }, hint);
    if ('$mk' in e) {
      const target = hint instanceof Map ? hint : new Map();
      this.register(id, target);
      const cols = e.$mv as { $cols: string[]; n: number; v: unknown[] };
      const keys = decodeColumn(e.$mk, cols.n);
      const values = this.decodeColumns(cols, keys.map((k) => target.get(k)));
      target.clear();
      keys.forEach((k, i) => target.set(k, values[i]));
      return target;
    }
    if ('$m' in e) {
      const target = hint instanceof Map ? hint : new Map();
      this.register(id, target);
      const entries = (e.$m as unknown[][]).map(([k, v]) => {
        const key = this.decode(k, undefined);
        return [key, this.decode(v, target.get(key))] as const;
      });
      target.clear();
      for (const [k, v] of entries) target.set(k, v);
      return target;
    }
    if ('$s' in e) {
      const target = hint instanceof Set ? hint : new Set();
      this.register(id, target);
      const items = (e.$s as unknown[]).map((item) => this.decode(item, undefined));
      target.clear();
      for (const item of items) target.add(item);
      return target;
    }
    if ('$t' in e) {
      const typed = decodeTyped(e as { $t: string; d: string }, hint);
      this.register(id, typed);
      return typed;
    }
    if ('$c' in e) {
      const name = e.$c as string;
      const live = typeof hint === 'object' && hint !== null && className(hint) === name;
      if (!live) this.orphans.add(name);
      const target = (live ? hint : {}) as Record<string, unknown>;
      this.register(id, target);
      const body = e.$o as Record<string, unknown>;
      for (const key of Object.keys(body)) target[key] = this.decode(body[key], target[key]);
      return target;
    }
    const body = ('$p' in e ? e.$p : e) as Record<string, unknown>;
    return this.decodePlain(body, hint, id);
  }

  private register(id: number, value: unknown): void {
    if (id >= 0) this.ids.set(id, value);
  }

  private decodePlain(body: Record<string, unknown>, hint: unknown, id: number): Record<string, unknown> {
    const reuse = typeof hint === 'object' && hint !== null && !Array.isArray(hint) && isPlainObject(hint);
    const target = (reuse ? hint : {}) as Record<string, unknown>;
    this.register(id, target);
    const decoded: Array<[string, unknown]> = Object.keys(body).map((key) => [key, this.decode(body[key], target[key])]);
    // Rewritten in the saved key order; wiring the save never writes (functions) stays
    if (reuse) resetKeys(target, Object.keys(body));
    for (const [key, value] of decoded) target[key] = value;
    return target;
  }

  private decodeArray(items: unknown[], hint: unknown, id: number): unknown[] {
    const target = Array.isArray(hint) ? hint : [];
    this.register(id, target);
    const decoded = items.map((item, i) => this.decode(item, target[i]));
    target.length = 0;
    for (const item of decoded) target.push(item);
    return target;
  }

  private decodeColumns(enc: { $cols: string[]; n: number; v: unknown[] }, hint: unknown): unknown[] {
    const target = Array.isArray(hint) ? hint : [];
    const keys = enc.$cols;
    const length = enc.n;
    if (!Number.isInteger(length) || length < 0 || !Array.isArray(enc.v) || enc.v.length !== keys.length) {
      throw new SaveShapeError('columnas ilegibles');
    }
    const cols = keys.map((_, k) => {
      const col = decodeColumn(enc.v[k], length);
      if (col.length !== length) throw new SaveShapeError('columnas desparejas');
      return col;
    });
    const rows: unknown[] = [];
    for (let i = 0; i < length; i++) {
      const prev = target[i];
      const row = (typeof prev === 'object' && prev !== null && isPlainObject(prev) ? prev : {}) as Record<string, unknown>;
      const values = keys.map((key, k) => this.decode(cols[k][i], row[key]));
      resetKeys(row, keys);
      for (let k = 0; k < keys.length; k++) row[keys[k]] = values[k];
      rows.push(row);
    }
    target.length = 0;
    for (const row of rows) target.push(row);
    return target;
  }
}
