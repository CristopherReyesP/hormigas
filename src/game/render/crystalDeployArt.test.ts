import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PAL } from '../../engine/renderer/pixelart/palette';
import { buildDroneFrames, buildShardFrames, DRONE_FRAME_SIZE, SHARD_FRAME_SIZE } from './crystalDeployArt';
import { DRONE_FRAME_COUNT, SHARD_COUNT } from './introTimeline';

/** A 2D context that only records which canvas pixels each fillRect paints, and in what color. */
class RecordingContext {
  fillStyle = '';
  globalAlpha = 1;
  readonly pixels = new Map<string, string>();

  fillRect(x: number, y: number, w: number, h: number): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.pixels.set(`${xx},${yy}`, this.fillStyle);
    }
  }
}

class RecordingCanvas {
  readonly ctx = new RecordingContext();
  readonly width: number;
  readonly height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext(): RecordingContext {
    return this.ctx;
  }
}

const pixelsOf = (c: OffscreenCanvas) => (c as unknown as RecordingCanvas).ctx.pixels;
const colorsOf = (c: OffscreenCanvas) => new Set(pixelsOf(c).values());
const HIVE_COLORS = new Set<string>([...PAL.crystal.shell, ...PAL.crystal.gold, PAL.crystal.shield, PAL.crystal.outline]);

/** Painted canvas pixels as [x, y] pairs. */
function painted(c: OffscreenCanvas): Array<[number, number]> {
  return [...pixelsOf(c).keys()].map((k) => k.split(',').map(Number) as [number, number]);
}

/**
 * True when every row and every column of painted pixels is one unbroken run:
 * a single solid gem. Legs, antennae or mandibles would leave detached runs.
 */
function isOneSolidShape(c: OffscreenCanvas): boolean {
  const rows = new Map<number, number[]>();
  const cols = new Map<number, number[]>();
  for (const [x, y] of painted(c)) {
    rows.set(y, [...(rows.get(y) ?? []), x]);
    cols.set(x, [...(cols.get(x) ?? []), y]);
  }
  const unbroken = (v: number[]) => Math.max(...v) - Math.min(...v) + 1 === v.length;
  return [...rows.values()].every(unbroken) && [...cols.values()].every(unbroken);
}

beforeAll(() => vi.stubGlobal('OffscreenCanvas', RecordingCanvas));
afterAll(() => vi.unstubAllGlobals());

describe('Crystal drone art', () => {
  it('pre-renders one square frame per core state', () => {
    const frames = buildDroneFrames();
    expect(frames).toHaveLength(DRONE_FRAME_COUNT);
    for (const f of frames) {
      expect(f.width).toBe(DRONE_FRAME_SIZE);
      expect(f.height).toBe(DRONE_FRAME_SIZE);
      for (const [x, y] of painted(f)) {
        expect(x >= 0 && x < f.width && y >= 0 && y < f.height).toBe(true);
      }
    }
  });

  it('draws a single solid crystal: no legs, antennae or mandibles', () => {
    for (const f of buildDroneFrames()) expect(isOneSolidShape(f)).toBe(true);
  });

  it('is cut from the Hive palette, with gold filigree in every frame', () => {
    for (const f of buildDroneFrames()) {
      for (const c of colorsOf(f)) expect(HIVE_COLORS.has(c)).toBe(true);
      expect(PAL.crystal.gold.some((g) => colorsOf(f).has(g))).toBe(true);
    }
  });

  it('wakes its energy core: dark while dormant, glowing cyan once lit', () => {
    const frames = buildDroneFrames();
    const shieldPixels = (f: OffscreenCanvas) => [...pixelsOf(f).values()].filter((c) => c === PAL.crystal.shield).length;
    expect(shieldPixels(frames[0])).toBe(0);
    expect(shieldPixels(frames[2])).toBeGreaterThan(0);
    expect(shieldPixels(frames[3])).toBeGreaterThan(shieldPixels(frames[2]));
  });
});

describe('orbiting shard art', () => {
  it('pre-renders a near and a darker far sprite for each shard', () => {
    const shards = buildShardFrames();
    expect(shards).toHaveLength(SHARD_COUNT);
    for (const { near, far } of shards) {
      for (const f of [near, far]) {
        expect(f.width).toBe(SHARD_FRAME_SIZE);
        expect(f.height).toBe(SHARD_FRAME_SIZE);
        expect(isOneSolidShape(f)).toBe(true);
        for (const c of colorsOf(f)) expect(HIVE_COLORS.has(c)).toBe(true);
      }
      // The far side of the orbit is in the body's shade: no white-hot highlight
      expect(colorsOf(near).has(PAL.crystal.shell[4])).toBe(true);
      expect(colorsOf(far).has(PAL.crystal.shell[4])).toBe(false);
    }
  });
});
