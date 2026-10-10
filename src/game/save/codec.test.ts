import { describe, expect, it } from 'vitest';
import { Decoder, Encoder, type CodecPolicy } from './codec';

const POLICY: CodecPolicy = { skip: new Set(), denyFields: { Thing: ['cache'] }, denyClasses: new Set() };

class Inner {
  n = 1;
  bump(): void {
    this.n++;
  }
}

class Thing {
  inner = new Inner();
  cache: number[] = [1, 2, 3];
  listeners = new Set<unknown>();
  tags = new Set(['a']);
  values = new Map<number, { x: number }>();
  floats = new Float32Array([0.1, NaN]);
  odd = { $weird: 1, inf: -Infinity, nothing: undefined as number | undefined };
}

function roundTrip(source: Thing, target: Thing): void {
  const encoder = new Encoder(POLICY);
  encoder.count(source);
  const data = JSON.parse(JSON.stringify(encoder.encodeRoot(source)));
  new Decoder().decodeRoot(target, data);
}

describe('save codec', () => {
  it('writes data fields back into the live object, keeping classes, wiring and denied fields', () => {
    const source = new Thing();
    source.inner.n = 5;
    source.cache = [9];
    source.tags.add('b');
    for (let i = 0; i < 20; i++) source.values.set(i, { x: i / 3 });
    const target = new Thing();
    const inner = target.inner;
    const listener = () => {};
    target.listeners.add(listener);
    source.listeners.add(() => {});
    roundTrip(source, target);
    expect(target.inner).toBe(inner);
    target.inner.bump();
    expect(target.inner.n).toBe(6);
    expect(target.cache).toEqual([1, 2, 3]); // denied: not saved
    expect([...target.listeners]).toEqual([listener]); // callbacks are wiring
    expect([...target.tags]).toEqual(['a', 'b']);
    expect(target.values.get(7)).toEqual({ x: 7 / 3 });
    expect(Array.from(target.floats)).toEqual(Array.from(source.floats));
    expect(target.odd).toEqual({ $weird: 1, inf: -Infinity, nothing: undefined });
  });

  it('keeps shared objects shared', () => {
    const source = new Thing();
    const shared = { x: 1 };
    source.values.set(1, shared);
    source.values.set(2, shared);
    const target = new Thing();
    roundTrip(source, target);
    expect(target.values.get(1)).toBe(target.values.get(2));
  });
});
