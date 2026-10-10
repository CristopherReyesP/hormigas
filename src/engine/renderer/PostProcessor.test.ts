import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DUSK_ALARM_DURATION,
  NIGHT_GLOW_MAX,
  PostProcessor,
  RESIZE_SETTLE_FRAMES,
  duskAlarmAlpha,
  nightGlowAlpha,
} from './PostProcessor';

/** A post processor that has just watched the day turn into night. */
function atNightfall(): PostProcessor {
  const pp = new PostProcessor();
  pp.setDayPhase('day', 0.99);
  pp.setDayPhase('night', 0);
  return pp;
}

describe('night sky (red-violet, the Swarm hour)', () => {
  it('uses the red-violet edge step at the start and end of the night', () => {
    const pp = new PostProcessor();
    pp.setDayPhase('night', 0.05);
    expect(pp.getSkyState()).toEqual({ color: '#2a0d1e', alpha: 0.22, night: true });
    pp.setDayPhase('night', 0.95);
    expect(pp.getSkyState()).toEqual({ color: '#2a0d1e', alpha: 0.22, night: true });
  });

  it('uses the deep red-violet step in the middle of the night', () => {
    const pp = new PostProcessor();
    pp.setDayPhase('night', 0.5);
    expect(pp.getSkyState()).toEqual({ color: '#1a0612', alpha: 0.38, night: true });
  });
});

describe('dusk alarm', () => {
  it('fires the moment day turns into night', () => {
    expect(atNightfall().getAlarmLevel()).toBeGreaterThan(0);
  });

  it('stays silent during the day', () => {
    const pp = new PostProcessor();
    pp.setDayPhase('day', 0.2);
    pp.setDayPhase('day', 0.9);
    expect(pp.getAlarmLevel()).toBe(0);
  });

  it('does not fire when the first frame it sees is already night', () => {
    const pp = new PostProcessor();
    pp.setDayPhase('night', 0.3);
    expect(pp.getAlarmLevel()).toBe(0);
  });

  it('is brief: gone once its duration has elapsed', () => {
    const pp = atNightfall();
    pp.advance(DUSK_ALARM_DURATION + 0.01);
    expect(pp.getAlarmLevel()).toBe(0);
    pp.setDayPhase('night', 0.1);
    expect(pp.getAlarmLevel()).toBe(0); // later night frames never re-fire it
  });

  it('holds still while the game is paused (dt = 0)', () => {
    const pp = atNightfall();
    pp.advance(0.1);
    const held = pp.getAlarmLevel();
    for (let i = 0; i < 100; i++) pp.advance(0);
    expect(pp.getAlarmLevel()).toBe(held);
  });

  it('fires again at the next nightfall', () => {
    const pp = atNightfall();
    pp.advance(DUSK_ALARM_DURATION + 1);
    pp.setDayPhase('day', 0);
    pp.setDayPhase('night', 0);
    expect(pp.getAlarmLevel()).toBeGreaterThan(0);
  });
});

describe('duskAlarmAlpha (stepped double pulse)', () => {
  const samples = Array.from({ length: Math.ceil(DUSK_ALARM_DURATION * 100) + 50 }, (_, i) => duskAlarmAlpha(i / 100));

  it('is quantized to a handful of stepped levels, never a smooth fade', () => {
    expect(new Set(samples).size).toBeLessThanOrEqual(4);
  });

  it('starts at full strength and ends at zero', () => {
    expect(duskAlarmAlpha(0)).toBe(Math.max(...samples));
    expect(duskAlarmAlpha(DUSK_ALARM_DURATION)).toBe(0);
    expect(duskAlarmAlpha(-1)).toBe(0);
  });

  it('beats twice, the second beat weaker than the first', () => {
    const half = DUSK_ALARM_DURATION / 2;
    expect(duskAlarmAlpha(half)).toBeGreaterThan(0);
    expect(duskAlarmAlpha(half)).toBeLessThan(duskAlarmAlpha(0));
    expect(duskAlarmAlpha(half - 0.01)).toBeLessThan(duskAlarmAlpha(half));
  });
});

describe('nightGlowAlpha (post-tint bioluminescence)', () => {
  it('is off during the day', () => {
    for (const p of [0, 0.3, 0.6, 0.99]) expect(nightGlowAlpha('day', p)).toBe(0);
  });

  it('glows at full strength in the deep night', () => {
    expect(nightGlowAlpha('night', 0.5)).toBe(NIGHT_GLOW_MAX);
  });

  it('scales with night depth: the dusk/dawn edge glows less than the deep night', () => {
    const edge = nightGlowAlpha('night', 0.05);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(NIGHT_GLOW_MAX);
    expect(nightGlowAlpha('night', 0.95)).toBe(edge);
    // Proportional to the tint it has to shine through (0.22 vs 0.38)
    expect(edge / NIGHT_GLOW_MAX).toBeCloseTo(0.22 / 0.38);
  });
});

/** A 2D context that accepts every call and records the full-canvas fills and blits. */
function fakeContext(canvas: { width: number; height: number }) {
  const ctx = {
    canvas,
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
    fills: [] as number[][],
    blits: [] as Array<{ source: unknown; args: number[] }>,
    fillRect(...args: number[]) { ctx.fills.push(args); },
    clearRect() {},
    drawImage(source: unknown, ...args: number[]) { ctx.blits.push({ source, args }); },
  };
  return ctx;
}

/** Every OffscreenCanvas the post processor allocates, by size. */
const allocated: Array<{ width: number; height: number }> = [];

class FakeOffscreenCanvas {
  width: number;
  height: number;
  private readonly ctx: ReturnType<typeof fakeContext>;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.ctx = fakeContext(this);
    allocated.push(this);
  }
  getContext() {
    return this.ctx;
  }
}

describe('screen-size caches', () => {
  beforeEach(() => {
    allocated.length = 0;
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** One surface frame on a canvas of the given size. */
  const frame = (pp: PostProcessor, canvas: { width: number; height: number }) => {
    const ctx = fakeContext(canvas);
    pp.apply(ctx as unknown as CanvasRenderingContext2D);
    return ctx;
  };

  it('washes the whole real-size canvas, not an 800×600 corner', () => {
    const pp = new PostProcessor();
    pp.setDayPhase('day', 0.5);
    const ctx = frame(pp, { width: 2560, height: 1440 });
    expect(ctx.fills).toContainEqual([0, 0, 2560, 1440]);
  });

  it('builds the vignette once and reuses it on later frames of the same size', () => {
    const pp = new PostProcessor();
    const canvas = { width: 1600, height: 900 };
    frame(pp, canvas);
    const built = allocated.length;
    expect(built).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) frame(pp, canvas);
    expect(allocated.length).toBe(built);
  });

  it('covers the whole canvas with the vignette', () => {
    const pp = new PostProcessor();
    const ctx = frame(pp, { width: 1600, height: 900 });
    const [, , w, h] = ctx.blits[0].args;
    expect(w).toBeGreaterThanOrEqual(1600);
    expect(h).toBeGreaterThanOrEqual(900);
  });

  it('waits for a resize to settle before rebuilding, stretching the old vignette meanwhile', () => {
    const pp = new PostProcessor();
    frame(pp, { width: 1600, height: 900 });
    const built = allocated.length;
    // A window drag: a new size every frame
    for (let w = 1610; w < 1700; w += 10) {
      const ctx = frame(pp, { width: w, height: 900 });
      expect(ctx.blits[0].args).toEqual([0, 0, w, 900]);
    }
    expect(allocated.length).toBe(built);
    // The size holds: one rebuild once it has settled, then none
    for (let i = 0; i < RESIZE_SETTLE_FRAMES + 5; i++) frame(pp, { width: 1700, height: 900 });
    expect(allocated.length).toBe(built + 1);
    for (let i = 0; i < 30; i++) frame(pp, { width: 1700, height: 900 });
    expect(allocated.length).toBe(built + 1);
  });

  it('keeps the night layer at the canvas size, reusing it from frame to frame', () => {
    const pp = new PostProcessor();
    pp.setDayPhase('night', 0.5);
    pp.setLights([{ x: 800, y: 450, radius: 120 }]);
    const canvas = { width: 3200, height: 1800 };
    for (let i = 0; i < 10; i++) frame(pp, canvas);
    const night = allocated.filter((c) => c.width * c.height >= (3200 * 1800) / 4);
    expect(night).toHaveLength(1);
    const ctx = frame(pp, canvas);
    const blit = ctx.blits.find((b) => b.source === night[0])!;
    expect(blit.args.slice(-2)).toEqual([3200, 1800]);
    // Resized with the canvas, not reallocated per frame
    frame(pp, { width: 1600, height: 900 });
    const after = frame(pp, { width: 1600, height: 900 });
    const resized = after.blits.find((b) => b.source === night[0])!;
    expect(resized.args.slice(-2)).toEqual([1600, 900]);
    expect(allocated.filter((c) => c.width * c.height >= (1600 * 900) / 4)).toHaveLength(1);
  });

  it('frames the dusk alarm on the real canvas edge', () => {
    const pp = atNightfall();
    const ctx = fakeContext({ width: 2560, height: 1440 });
    pp.applyAlarm(ctx as unknown as CanvasRenderingContext2D);
    const [, , w, h] = ctx.blits[0].args;
    expect(w).toBeGreaterThanOrEqual(2560);
    expect(h).toBeGreaterThanOrEqual(1440);
  });
});
