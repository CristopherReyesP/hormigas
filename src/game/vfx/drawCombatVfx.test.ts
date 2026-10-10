import { describe, expect, it } from 'vitest';
import { Layer } from '../components/components';
import { FOG_CLEAR_BRIGHTNESS, type VisibilityReader } from '../../engine/renderer/fogVisibility';
import { CombatVfx, VFX_LIFE } from './CombatVfx';
import { drawCombatVfx, type VfxCanvas } from './drawCombatVfx';

/** Counts the art pixels a draw call paints */
function recorder(): VfxCanvas & { rects: Array<[number, number, number, number]> } {
  const rects: Array<[number, number, number, number]> = [];
  return {
    fillStyle: '#000000',
    rects,
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push([x, y, w, h]);
    },
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) as DOMMatrix,
    setTransform: () => {},
  };
}

const CLEAR: VisibilityReader = { isExplored: () => true, getBrightness: () => 255 };
const DARK: VisibilityReader = { isExplored: () => true, getBrightness: () => FOG_CLEAR_BRIGHTNESS - 1 };

function run(vfx: CombatVfx, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) vfx.advance(1 / 60);
}

describe('drawCombatVfx — layers', () => {
  it('draws an effect only on the layer it happened on', () => {
    const vfx = new CombatVfx();
    vfx.hit(10, 10, 11, 10, Layer.Underground, 'swarm', 'beetle');
    vfx.death(11, 10, Layer.Underground, 'beetle', 0);

    for (const pass of ['ground', 'air'] as const) {
      const surface = recorder();
      drawCombatVfx(surface, vfx, pass, Layer.Surface, CLEAR);
      expect(surface.rects, pass).toHaveLength(0);

      const underground = recorder();
      drawCombatVfx(underground, vfx, pass, Layer.Underground, null);
      expect(underground.rects.length, pass).toBeGreaterThan(0);
    }
  });
});

describe('drawCombatVfx — fog', () => {
  it('hides every effect on tiles the colony cannot see right now', () => {
    const vfx = new CombatVfx();
    vfx.hit(10, 10, 11, 10, Layer.Surface, 'swarm', 'cricket');
    vfx.death(11, 10, Layer.Surface, 'cricket', 0);

    for (const pass of ['ground', 'air'] as const) {
      const fogged = recorder();
      drawCombatVfx(fogged, vfx, pass, Layer.Surface, DARK);
      expect(fogged.rects, pass).toHaveLength(0);

      const clear = recorder();
      drawCombatVfx(clear, vfx, pass, Layer.Surface, CLEAR);
      expect(clear.rects.length, pass).toBeGreaterThan(0);
    }
  });

  it('checks the tile each effect is on, not the whole fight', () => {
    const vfx = new CombatVfx();
    vfx.death(4, 4, Layer.Surface, 'ant', 0);
    vfx.death(30, 30, Layer.Surface, 'ant', 0);
    const onlyNearTile4: VisibilityReader = {
      isExplored: () => true,
      getBrightness: (x, y) => (Math.abs(x - 4) <= 1 && Math.abs(y - 4) <= 1 ? 255 : 0),
    };
    const ctx = recorder();
    drawCombatVfx(ctx, vfx, 'ground', Layer.Surface, onlyNearTile4);
    // Every painted art pixel sits within a tile or so of (4, 4): 32 px per tile
    const tile = (px: number) => (px - 16) / 32;
    for (const [x, y] of ctx.rects) {
      expect(Math.abs(tile(x) - 4)).toBeLessThan(2);
      expect(Math.abs(tile(y) - 4)).toBeLessThan(2);
    }
    expect(ctx.rects.length).toBeGreaterThan(0);
  });
});

describe('drawCombatVfx — pixel art', () => {
  it('snaps art pixels to whole device pixels under the camera, then restores it', () => {
    const vfx = new CombatVfx();
    vfx.death(6, 6, Layer.Surface, 'beetle', 0);
    const ctx = recorder();
    // Zoom 1 with the camera's 0.85 perspective squash and a fractional pan
    const camera = { a: 1, b: 0, c: 0, d: 0.85, e: -10.3, f: -7.6 } as DOMMatrix;
    const set: unknown[] = [];
    ctx.getTransform = () => camera;
    ctx.setTransform = ((...args: unknown[]) => { set.push(args); }) as VfxCanvas['setTransform'];

    drawCombatVfx(ctx, vfx, 'ground', Layer.Surface, CLEAR);

    expect(ctx.rects.length).toBeGreaterThan(0);
    for (const [x, y, w, h] of ctx.rects) {
      for (const v of [x, y, w, h]) expect(Number.isInteger(v)).toBe(true);
    }
    expect(set.at(-1)).toEqual([camera]);
  });

  it('paints whole 2×2 art pixels on the 2 px grid, never a smooth shape', () => {
    const vfx = new CombatVfx();
    vfx.hit(10, 10, 11, 10, Layer.Surface, 'swarm', 'beetle');
    run(vfx, VFX_LIFE.dropletFlight * 0.5);
    const ctx = recorder();
    drawCombatVfx(ctx, vfx, 'air', Layer.Surface, CLEAR);
    expect(ctx.rects.length).toBeGreaterThan(0);
    for (const [x, y, w, h] of ctx.rects) {
      expect(x % 2).toBe(0);
      expect(y % 2).toBe(0);
      expect(w % 2).toBe(0);
      expect(h % 2).toBe(0);
    }
  });

  it('fades the acid puddle in 3 dithered steps, then it is gone', () => {
    const vfx = new CombatVfx();
    // Acid on an ant: the puddle is the only ground decal
    vfx.hit(10, 10, 11, 10, Layer.Surface, 'swarm', 'ant');
    run(vfx, VFX_LIFE.dropletFlight + 1 / 60);

    const counts: number[] = [];
    for (let step = 0; step < 3; step++) {
      const ctx = recorder();
      drawCombatVfx(ctx, vfx, 'ground', Layer.Surface, CLEAR);
      counts.push(ctx.rects.length);
      run(vfx, VFX_LIFE.puddle / 3);
    }
    expect(counts[0]).toBeGreaterThan(counts[1]);
    expect(counts[1]).toBeGreaterThan(counts[2]);
    expect(counts[2]).toBeGreaterThan(0);

    const after = recorder();
    drawCombatVfx(after, vfx, 'ground', Layer.Surface, CLEAR);
    expect(after.rects).toHaveLength(0);
  });

  it('lets a carcass linger at full strength before it fades', () => {
    const vfx = new CombatVfx();
    vfx.death(6, 6, Layer.Surface, 'beetle', 0);
    const fresh = recorder();
    drawCombatVfx(fresh, vfx, 'ground', Layer.Surface, CLEAR);
    run(vfx, VFX_LIFE.carcass * 0.5);
    const lingering = recorder();
    drawCombatVfx(lingering, vfx, 'ground', Layer.Surface, CLEAR);
    run(vfx, VFX_LIFE.carcass * 0.4);
    const fading = recorder();
    drawCombatVfx(fading, vfx, 'ground', Layer.Surface, CLEAR);

    expect(lingering.rects.length).toBe(fresh.rects.length);
    expect(fading.rects.length).toBeLessThan(lingering.rects.length);
    expect(fading.rects.length).toBeGreaterThan(0);
  });
});
