import { describe, expect, it, vi } from 'vitest';
import { StandingSprites, type StandingCamera } from './standingSprites';

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

/** A context that tracks the transform, alpha and save stack like a canvas. */
function trackingContext(start: Matrix = { a: 2, b: 0, c: 0, d: 1.5, e: 10, f: 20 }) {
  let matrix = { ...start };
  let alpha = 1;
  const stack: Array<{ matrix: Matrix; alpha: number }> = [];
  const ctx = {
    save: () => stack.push({ matrix: { ...matrix }, alpha }),
    restore: () => { ({ matrix, alpha } = stack.pop()!); },
    getTransform: () => ({ ...matrix }),
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => { matrix = { a, b, c, d, e, f }; },
    get globalAlpha() { return alpha; },
    set globalAlpha(value: number) { alpha = value; },
    beginPath: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, raw: ctx, stack, matrix: () => matrix };
}

/** Screen Y is world X here, so depth order differs from world-Y order. */
function camera(tilt: number): StandingCamera {
  return {
    getTilt: () => tilt,
    getTiltScale: () => [1, 0.75, 0.55][tilt],
    getRotation: () => 1,
    worldToScreen: (x: number, y: number) => ({ x: y, y: x }),
  };
}

describe('standing sprites', () => {
  it('draws at once in call order when the camera is flat', () => {
    const { ctx } = trackingContext();
    const layer = new StandingSprites();
    const drawn: string[] = [];
    layer.begin(ctx, camera(0));
    layer.add(300, 0, () => drawn.push('far'));
    expect(drawn).toEqual(['far']);
    layer.add(100, 0, () => drawn.push('near'));
    layer.after(() => drawn.push('after'));
    layer.flush();
    expect(drawn).toEqual(['far', 'near', 'after']);
    expect(layer.isTilted()).toBe(false);
  });

  it('paints back to front by screen Y when tilted, ties in call order, then the after pass', () => {
    const { ctx } = trackingContext();
    const layer = new StandingSprites();
    const drawn: string[] = [];
    layer.begin(ctx, camera(2));
    layer.after(() => drawn.push('after'));
    layer.add(300, 0, () => drawn.push('front'));
    layer.add(100, 900, () => drawn.push('back'));
    layer.add(200, 5, () => drawn.push('middle-1'));
    layer.add(200, -5, () => drawn.push('middle-2'));
    expect(drawn).toEqual([]);
    layer.flush();
    expect(drawn).toEqual(['back', 'middle-1', 'middle-2', 'front', 'after']);
    // The frame is over: a later draw goes straight to the canvas
    layer.add(0, 0, () => drawn.push('late'));
    expect(drawn.at(-1)).toBe('late');
  });

  it('replays each deferred body under the transform and alpha it was queued with', () => {
    const { ctx, raw, stack, matrix } = trackingContext();
    const layer = new StandingSprites();
    const seen: Array<{ matrix: Matrix; alpha: number }> = [];
    const record = () => seen.push({ matrix: matrix(), alpha: raw.globalAlpha });
    layer.begin(ctx, camera(1));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 5, 6);
    raw.globalAlpha = 0.4;
    layer.add(50, 0, record);
    ctx.restore();
    layer.add(10, 0, record);
    layer.flush();
    expect(seen).toEqual([
      { matrix: { a: 2, b: 0, c: 0, d: 1.5, e: 10, f: 20 }, alpha: 1 },
      { matrix: { a: 1, b: 0, c: 0, d: 1, e: 5, f: 6 }, alpha: 0.4 },
    ]);
    expect(stack).toHaveLength(0);
    expect(matrix()).toEqual({ a: 2, b: 0, c: 0, d: 1.5, e: 10, f: 20 });
  });

  it('billboards only while tilted and draws the ground shadow only then', () => {
    const flat = trackingContext();
    const layer = new StandingSprites();
    layer.begin(flat.ctx, camera(0));
    expect(layer.billboard(flat.ctx, 100, 200, { height: 32, heading: 0.25 })).toBe(0.25);
    expect(flat.matrix()).toEqual({ a: 2, b: 0, c: 0, d: 1.5, e: 10, f: 20 });
    flat.ctx.restore();
    layer.shadow(flat.ctx, 100, 200, 12);
    expect(flat.raw.ellipse).not.toHaveBeenCalled();
    layer.flush();

    const tilted = trackingContext({ a: 0, b: 1.1, c: -2, d: 0, e: 10, f: 20 });
    layer.begin(tilted.ctx, camera(2));
    expect(layer.billboard(tilted.ctx, 100, 200, { height: 32, heading: 0.25 })).toBeCloseTo(0.25 + Math.PI / 2);
    const m = tilted.matrix();
    expect([m.a, m.b, m.c, m.d]).toEqual([2, 0, 0, 2]);
    tilted.ctx.restore();
    layer.shadow(tilted.ctx, 100, 200, 12);
    expect(tilted.raw.ellipse).toHaveBeenCalledWith(100, 200, 12, 12, 0, 0, Math.PI * 2);
    expect(tilted.stack).toHaveLength(0);
    layer.flush();
  });

  it('stays flat without a camera (the underground view)', () => {
    const { ctx, matrix } = trackingContext();
    const layer = new StandingSprites();
    const drawn: number[] = [];
    layer.add(5, 5, () => drawn.push(1));
    expect(drawn).toEqual([1]);
    expect(layer.billboard(ctx, 1, 2, { heading: 0.5 })).toBe(0.5);
    expect(matrix()).toEqual({ a: 2, b: 0, c: 0, d: 1.5, e: 10, f: 20 });
    ctx.restore();
  });
});
