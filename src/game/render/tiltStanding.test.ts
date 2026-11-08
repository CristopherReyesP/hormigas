import { describe, expect, it } from 'vitest';
import { RenderSystem } from '../systems/RenderSystem';
import { StandingSprites } from '../../engine/renderer/standingSprites';
import { AntRole } from '../components/components';
import { TILE_SIZE } from '../../shared/constants';

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

// A quarter turn at zoom 2 with the deepest tilt (0.55): what Camera.applyTransform builds
const TILTED: Matrix = { a: 0, b: 1.1, c: -2, d: 0, e: 400, f: 300 };
const FLAT: Matrix = { a: 0, b: 2, c: -2, d: 0, e: 400, f: 300 };

function apply(m: Matrix, x: number, y: number) {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

function scene(start: Matrix, tilt: number) {
  let matrix = { ...start };
  const stack: Matrix[] = [];
  const ctx = {
    save: () => stack.push({ ...matrix }),
    restore: () => { matrix = stack.pop()!; },
    getTransform: () => ({ ...matrix }),
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => { matrix = { a, b, c, d, e, f }; },
    globalAlpha: 1,
    drawImage: () => shadows.push({ ...matrix }),
  } as unknown as CanvasRenderingContext2D;
  const shadows: Matrix[] = [];
  const sprites: Array<{ matrix: Matrix; px: number; py: number; facing: number }> = [];
  const renderer = Object.create(RenderSystem.prototype) as RenderSystem;
  renderer['animationTime'] = 0;
  renderer['fxShadowSmall'] = {} as OffscreenCanvas;
  renderer['spriteAtlas'] = {
    drawAnt: (_c: unknown, px: number, py: number, facing: number) => sprites.push({ matrix: { ...matrix }, px, py, facing }),
  } as never;
  const standing = new StandingSprites();
  standing.begin(ctx, {
    getTilt: () => tilt,
    getTiltScale: () => (tilt ? 0.55 : 1),
    getRotation: () => 1,
    worldToScreen: (x: number, y: number) => apply(start, x, y),
  });
  renderer['standing'] = standing;
  const ant = (tileX: number, facing: number) =>
    renderer['drawAnt'](ctx, tileX, 1, facing, 0, AntRole.Worker, false, false, false, false);
  return { ant, standing, sprites, shadows, stack, matrix: () => matrix };
}

describe('ants under a tilted camera', () => {
  it('stand upright on their ground point, face the screen way and paint back to front', () => {
    const { ant, standing, sprites, shadows, stack, matrix } = scene(TILTED, 2);
    ant(5, 0);
    ant(1, Math.PI / 2);
    // The shadows lie on the tilted ground at once; the bodies wait for the sort
    expect(shadows).toEqual([TILTED, TILTED]);
    expect(sprites).toEqual([]);
    standing.flush();
    expect(sprites.map((s) => s.px)).toEqual([1 * TILE_SIZE + TILE_SIZE / 2, 5 * TILE_SIZE + TILE_SIZE / 2]);
    for (const sprite of sprites) {
      const { a, b, c, d } = sprite.matrix;
      expect([a, b, c, d]).toEqual([2, 0, 0, 2]);
      const ground = apply(TILTED, sprite.px, sprite.py);
      const lift = TILE_SIZE * 0.5 * (1 - 0.55);
      const drawnAt = apply(sprite.matrix, sprite.px, sprite.py);
      expect(drawnAt.x).toBeCloseTo(ground.x);
      expect(drawnAt.y).toBeCloseTo(ground.y - lift * 2);
    }
    expect(sprites[0].facing).toBeCloseTo(Math.PI / 2 + Math.PI / 2);
    expect(sprites[1].facing).toBeCloseTo(Math.PI / 2);
    expect(stack).toHaveLength(0);
    expect(matrix()).toEqual(TILTED);
  });

  it('draw exactly as before when the camera is flat', () => {
    const { ant, standing, sprites, stack, matrix } = scene(FLAT, 0);
    ant(5, 0.3);
    ant(1, 0.7);
    expect(sprites).toEqual([
      { matrix: FLAT, px: 5 * TILE_SIZE + TILE_SIZE / 2, py: TILE_SIZE * 1.5, facing: 0.3 },
      { matrix: FLAT, px: 1 * TILE_SIZE + TILE_SIZE / 2, py: TILE_SIZE * 1.5, facing: 0.7 },
    ]);
    standing.flush();
    expect(sprites).toHaveLength(2);
    expect(stack).toHaveLength(0);
    expect(matrix()).toEqual(FLAT);
  });
});
