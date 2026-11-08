// SpriteAtlas.drawAnt picks the worker's 3/4 standing sheet only when asked to
// draw a standing ant; every flat draw keeps the top-down sheet exactly as
// before (standingCasteAtlas.test.ts covers the other castes).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AntRole } from '../../game/components/components';
import { SpriteAtlas } from './SpriteAtlas';
import { DIRECTIONS } from './pixelart/directions';
import { SPRITE_GRID, WALK_FRAMES } from './sprites/spriteScale';
import { STANDING_VIEWS } from './sprites/standingAntSprites';

interface FakeCanvas { width: number; height: number; getContext: () => unknown }

/** A 2D context that accepts every call (the atlas bakes props with PixelPainter). */
function anyContext(): unknown {
  const target = {
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  } as Record<string | symbol, unknown>;
  return new Proxy(target, {
    get: (t, key) => (key in t ? t[key] : () => undefined),
    set: (t, key, value) => { t[key] = value; return true; },
  });
}

beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: (): FakeCanvas => ({ width: 0, height: 0, getContext: () => anyContext() }),
  });
});
afterEach(() => vi.unstubAllGlobals());

function drawn(draw: (atlas: SpriteAtlas, ctx: CanvasRenderingContext2D) => void) {
  const calls: Array<{ sheet: FakeCanvas; sx: number; sy: number }> = [];
  const ctx = {
    imageSmoothingEnabled: true,
    drawImage: (sheet: FakeCanvas, sx: number, sy: number) => calls.push({ sheet, sx, sy }),
  } as unknown as CanvasRenderingContext2D;
  draw(new SpriteAtlas(), ctx);
  return calls;
}

const G = SPRITE_GRID.ant;
const TOP_DOWN_WIDTH = G * WALK_FRAMES * DIRECTIONS;
const STANDING_WIDTH = G * WALK_FRAMES * STANDING_VIEWS.length;
const phase = (frame: number) => ((frame + 0.5) * Math.PI * 2) / WALK_FRAMES;

describe('SpriteAtlas standing worker', () => {
  it('draws the top-down worker when not standing (flat camera, underground, UI)', () => {
    const calls = drawn((atlas, ctx) => atlas.drawAnt(ctx, 10, 10, Math.PI / 2, phase(0), AntRole.Worker, false));
    expect(calls).toHaveLength(1);
    expect(calls[0].sheet.width).toBe(TOP_DOWN_WIDTH);
  });

  it('draws the 3/4 worker view chosen by the screen heading while standing', () => {
    const cases: Array<[number, number]> = [[Math.PI / 2, STANDING_VIEWS.indexOf('front')], [-Math.PI / 2, STANDING_VIEWS.indexOf('back')],
      [0, STANDING_VIEWS.indexOf('right')], [Math.PI, STANDING_VIEWS.indexOf('left')]];
    for (const [heading, view] of cases) {
      const calls = drawn((atlas, ctx) => {
        atlas.drawAnt(ctx, 10, 10, heading, phase(2), AntRole.Worker, false, false, undefined, true);
        atlas.drawAnt(ctx, 10, 10, heading, phase(1), AntRole.Worker, true, false, undefined, true);
      });
      expect(calls.map(c => c.sheet.width)).toEqual([STANDING_WIDTH, STANDING_WIDTH]);
      expect(calls[0].sx).toBe((2 * STANDING_VIEWS.length + view) * G);
      expect(calls[0].sy).toBe(0);
      expect(calls[1].sx).toBe((1 * STANDING_VIEWS.length + view) * G);
      expect(calls[1].sy).toBe(G); // the carrying row
    }
  });

  it('gives every other caste its own standing sheet too', () => {
    for (const role of [AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender, AntRole.Bomber]) {
      const calls = drawn((atlas, ctx) => atlas.drawAnt(ctx, 10, 10, Math.PI / 2, phase(0), role, false, false, undefined, true));
      expect(calls[0].sheet.width, role).toBe(STANDING_WIDTH);
    }
  });

  it('bakes the standing sheet once', () => {
    const calls = drawn((atlas, ctx) => {
      for (let i = 0; i < 3; i++) atlas.drawAnt(ctx, 10, 10, 0, phase(i), AntRole.Worker, false, false, undefined, true);
    });
    expect(new Set(calls.map(c => c.sheet)).size).toBe(1);
  });
});
