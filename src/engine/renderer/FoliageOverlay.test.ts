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

function blitOf(overlay: FoliageOverlay, camera: Camera): number[] {
  const calls: number[][] = [];
  const ctx = { drawImage: (_src: unknown, ...args: number[]) => calls.push(args) };
  overlay.draw(ctx as unknown as CanvasRenderingContext2D, camera);
  return calls[0];
}

describe('FoliageOverlay at real window sizes', () => {
  it('blits the world rect the whole canvas sees, and follows a resize', () => {
    const overlay = new FoliageOverlay(grid);
    const camera = new Camera();
    camera.setCanvasSize(2560, 1440, 1);
    camera.zoom = 1;
    camera.x = 320;
    camera.y = 160;
    const [sx, sy, sw, sh] = blitOf(overlay, camera);
    expect([sx, sy]).toEqual([320, 160]);
    expect(sw).toBeGreaterThanOrEqual(2560);
    expect(sh).toBeGreaterThanOrEqual(1440);

    camera.setCanvasSize(1280, 720, 1);
    camera.x = 320;
    camera.y = 160;
    const [, , sw2, sh2] = blitOf(overlay, camera);
    expect(sw2).toBeGreaterThanOrEqual(1280);
    expect(sw2).toBeLessThan(1300);
    expect(sh2).toBeGreaterThanOrEqual(720);
    expect(sh2).toBeLessThan(740);
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
