import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Camera } from '../camera/Camera';
import { TerrainType } from '../../simulation/world/types';
import type { TileGrid } from '../../simulation/world/TileGrid';
import { FoliageOverlay } from './FoliageOverlay';

/** Counts the overlay's full re-renders (each one starts with a clearRect). */
let renders = 0;
const noop = () => {};
const overlayCtx = new Proxy({} as Record<string, unknown>, {
  get: (target, key) => (key === 'clearRect' ? () => { renders++; } : key in target ? target[key as string] : noop),
  set: (target, key, value) => { target[key as string] = value; return true; },
});

beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => overlayCtx }) });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

/** A bare-water map: nothing to decorate, so the cache renders fast. */
const grid = {
  width: 120,
  height: 90,
  getTile: () => ({ terrain: TerrainType.Water }),
  getNeighbors: () => [],
} as unknown as TileGrid;

/** The world px rect the drawn chunks cover */
function blitOf(overlay: FoliageOverlay, camera: Camera): number[] {
  const calls: number[][] = [];
  const ctx = { drawImage: (src: { width: number; height: number }, x: number, y: number) => calls.push([x, y, x + src.width, y + src.height]) };
  overlay.draw(ctx as unknown as CanvasRenderingContext2D, camera);
  const x0 = Math.min(...calls.map((c) => c[0]));
  const y0 = Math.min(...calls.map((c) => c[1]));
  return [x0, y0, Math.max(...calls.map((c) => c[2])) - x0, Math.max(...calls.map((c) => c[3])) - y0, calls.length];
}

describe('FoliageOverlay at real window sizes', () => {
  it('blits the world rect the whole canvas sees, and follows a resize', () => {
    const overlay = new FoliageOverlay(grid);
    const camera = new Camera();
    camera.setCanvasSize(2560, 1440, 1);
    camera.zoom = 1;
    camera.x = 320;
    camera.y = 160;
    // The chunks drawn cover the whole canvas's world rect
    const [sx, sy, sw, sh] = blitOf(overlay, camera);
    expect(sx).toBeLessThanOrEqual(320);
    expect(sy).toBeLessThanOrEqual(160);
    expect(sx + sw).toBeGreaterThanOrEqual(320 + 2560);
    expect(sy + sh).toBeGreaterThanOrEqual(160 + 1440);

    // A smaller canvas draws fewer chunks
    const before = blitOf(overlay, camera)[4];
    camera.setCanvasSize(640, 360, 1);
    camera.x = 320;
    camera.y = 160;
    const [sx2, sy2, sw2, sh2, count] = blitOf(overlay, camera);
    expect(sx2 + sw2).toBeGreaterThanOrEqual(320 + 640);
    expect(sy2 + sh2).toBeGreaterThanOrEqual(160 + 360);
    expect(count).toBeLessThan(before);
  });

  it('keeps its world-sized cache through resizes and frames (no per-size rebuild)', () => {
    const overlay = new FoliageOverlay(grid);
    const built = renders;
    const camera = new Camera();
    for (const [w, h] of [[1600, 900], [2560, 1440], [3200, 1800], [1280, 720]]) {
      camera.setCanvasSize(w, h, 1);
      for (let i = 0; i < 5; i++) blitOf(overlay, camera);
    }
    expect(renders).toBe(built);
  });
});
