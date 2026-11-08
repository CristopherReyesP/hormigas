// SpriteAtlas picks each caste's (and the queen's) 3/4 standing sheet only
// when asked for a standing draw; every flat draw keeps the top-down sheet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AntRole } from '../../game/components/components';
import { SpriteAtlas } from './SpriteAtlas';
import { DIRECTIONS } from './pixelart/directions';
import { SPRITE_GRID, WALK_FRAMES } from './sprites/spriteScale';
import { STANDING_VIEWS, standingView } from './sprites/standingAntSprites';
import { screenHeading } from './uprightOverlay';
import type { AntMarkId } from './sprites/antMarks';

interface FakeCanvas { width: number; height: number; getContext: () => unknown }

function anyContext(): unknown {
  const target = {
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  } as Record<string | symbol, unknown>;
  return new Proxy(target, {
    get: (t, key) => (key in t ? t[key] : () => undefined),
    set: (t, key, value) => { t[key] = value; return true; },
  });
}

let created: FakeCanvas[] = [];
beforeEach(() => {
  created = [];
  vi.stubGlobal('document', {
    createElement: (): FakeCanvas => {
      const canvas = { width: 0, height: 0, getContext: () => anyContext() };
      created.push(canvas);
      return canvas;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

function drawn(draw: (atlas: SpriteAtlas, ctx: CanvasRenderingContext2D) => void, atlas = new SpriteAtlas()) {
  const calls: Array<{ sheet: FakeCanvas; sx: number; sy: number; sw: number }> = [];
  const ctx = {
    imageSmoothingEnabled: true,
    drawImage: (sheet: FakeCanvas, sx: number, sy: number, sw: number) => calls.push({ sheet, sx, sy, sw }),
  } as unknown as CanvasRenderingContext2D;
  draw(atlas, ctx);
  return calls;
}

const CASTES = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender, AntRole.Bomber];
const G = SPRITE_GRID.ant;
const Q = SPRITE_GRID.queen;
const phase = (frame: number) => ((frame + 0.5) * Math.PI * 2) / WALK_FRAMES;
const MAP_HEADINGS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

describe.each(CASTES)('SpriteAtlas standing %s', role => {
  it('draws the top-down sprite when not standing (flat camera, underground, UI)', () => {
    const calls = drawn((atlas, ctx) => {
      atlas.drawAnt(ctx, 10, 10, Math.PI / 2, phase(0), role, false);
      atlas.drawAnt(ctx, 10, 10, Math.PI / 2, phase(0), role, true, true);
      atlas.drawAnt(ctx, 10, 10, Math.PI / 2, phase(0), role, false, false, undefined, false);
    });
    for (const c of calls) expect(c.sheet.width).toBe(G * WALK_FRAMES * DIRECTIONS);
  });

  it('draws the 3/4 view the screen heading picks, at every camera rotation', () => {
    for (const mapHeading of MAP_HEADINGS) {
      for (const rotation of [0, 1, 2, 3]) {
        const heading = screenHeading(mapHeading, rotation);
        const view = STANDING_VIEWS.indexOf(standingView(heading));
        const calls = drawn((atlas, ctx) => {
          atlas.drawAnt(ctx, 10, 10, heading, phase(3), role, false, false, undefined, true);
          atlas.drawAnt(ctx, 10, 10, heading, phase(0), role, 'ore', false, undefined, true);
        });
        const label = `${mapHeading} r${rotation}`;
        expect(calls.map(c => c.sheet.width), label).toEqual([G * WALK_FRAMES * STANDING_VIEWS.length, G * WALK_FRAMES * STANDING_VIEWS.length]);
        expect(calls[0].sx, label).toBe((3 * STANDING_VIEWS.length + view) * G);
        expect(calls[0].sy, label).toBe(0);
        expect(calls[1].sx, label).toBe(view * G);
        expect(calls[1].sy, label).toBe(2 * G); // the ore row
      }
    }
  });

  it('bakes its standing sheet once per mark set, never per frame', () => {
    const atlas = new SpriteAtlas();
    const marks = new Map<AntMarkId, number>([['venom_sac', 1]]);
    const calls = drawn((a, ctx) => {
      for (let i = 0; i < 6; i++) a.drawAnt(ctx, 10, 10, i, phase(i), role, i % 2 === 0, false, marks, true);
    }, atlas);
    expect(new Set(calls.map(c => c.sheet)).size).toBe(1);
    const before = created.length;
    drawn((a, ctx) => a.drawAnt(ctx, 10, 10, 0, phase(0), role, false, false, marks, true), atlas);
    expect(created.length).toBe(before);
  });
});

describe('SpriteAtlas standing queen', () => {
  it('draws the top-down queen unless asked for a standing draw', () => {
    const calls = drawn((atlas, ctx) => {
      atlas.drawQueenAnt(ctx, 10, 10, 0, phase(0));
      atlas.drawQueenAnt(ctx, 10, 10, 0, phase(0), true);
      atlas.drawQueenAnt(ctx, 10, 10, 0, phase(0), false, false);
    });
    for (const c of calls) expect(c.sheet.width).toBe(Q * WALK_FRAMES * DIRECTIONS);
  });

  it('draws her 3/4 view the screen heading picks, breathing row included', () => {
    for (const mapHeading of MAP_HEADINGS) {
      for (const rotation of [0, 1, 2, 3]) {
        const heading = screenHeading(mapHeading, rotation);
        const view = STANDING_VIEWS.indexOf(standingView(heading));
        const calls = drawn((atlas, ctx) => {
          atlas.drawQueenAnt(ctx, 10, 10, heading, phase(1), false, true);
          atlas.drawQueenAnt(ctx, 10, 10, heading, phase(2), true, true);
        });
        expect(calls.map(c => c.sheet.width)).toEqual([Q * WALK_FRAMES * STANDING_VIEWS.length, Q * WALK_FRAMES * STANDING_VIEWS.length]);
        expect(calls[0].sx).toBe((1 * STANDING_VIEWS.length + view) * Q);
        expect(calls[0].sy).toBe(0);
        expect(calls[1].sx).toBe((2 * STANDING_VIEWS.length + view) * Q);
        expect(calls[1].sy).toBe(Q);
        expect(calls[0].sheet).toBe(calls[1].sheet);
      }
    }
  });
});
