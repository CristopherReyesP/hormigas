// SpriteAtlas draws the alien tarantula's 3/4 standing sheet only when asked
// for a standing draw, its bite pose on a row of its own; every flat draw keeps
// the top-down sheet, and the weaver spider keeps its own standing sheet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpriteAtlas, hasStandingFrontierView, type FrontierSpriteKind } from './SpriteAtlas';
import { DIRECTIONS } from './pixelart/directions';
import { SPRITE_GRID, WALK_FRAMES } from './sprites/spriteScale';
import { STANDING_VIEWS, standingView } from './sprites/standingParts';
import { screenHeading } from './uprightOverlay';

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
  const calls: Array<{ sheet: FakeCanvas; sx: number; sy: number }> = [];
  const ctx = {
    imageSmoothingEnabled: true,
    drawImage: (sheet: FakeCanvas, sx: number, sy: number) => calls.push({ sheet, sx, sy }),
  } as unknown as CanvasRenderingContext2D;
  draw(atlas, ctx);
  return calls;
}

const G = SPRITE_GRID.tarantula;
const VIEWS = STANDING_VIEWS.length;
const phase = (frame: number) => ((frame + 0.5) * Math.PI * 2) / WALK_FRAMES;
const MAP_HEADINGS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const OTHERS: FrontierSpriteKind[] = ['legionary', 'legion_queen', 'mantis', 'centipede', 'spore_jelly', 'acid_spitter'];

describe('SpriteAtlas standing alien tarantula', () => {
  it('the tarantula has standing views, next to the spider; the other Phase 2 creatures still have none', () => {
    expect(hasStandingFrontierView('tarantula')).toBe(true);
    expect(hasStandingFrontierView('spider')).toBe(true);
    for (const kind of OTHERS) expect(hasStandingFrontierView(kind), kind).toBe(false);
  });

  it('draws the top-down sprite when not standing (flat camera, underground), bite row included', () => {
    const calls = drawn((atlas, ctx) => {
      atlas.drawFrontierCreature(ctx, 'tarantula', 10, 10, Math.PI / 2, phase(0));
      atlas.drawFrontierCreature(ctx, 'tarantula', 10, 10, Math.PI / 2, phase(0), 1);
      atlas.drawFrontierCreature(ctx, 'tarantula', 10, 10, Math.PI / 2, phase(0), null, false);
    });
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c.sheet.width).toBe(G * WALK_FRAMES * DIRECTIONS);
    expect(calls[1].sy).toBe(G); // the bite row
  });

  it('draws the 3/4 view the screen heading picks at every camera rotation, its bite on row 1', () => {
    for (const mapHeading of MAP_HEADINGS) {
      for (const rotation of [0, 1, 2, 3]) {
        const heading = screenHeading(mapHeading, rotation);
        const view = STANDING_VIEWS.indexOf(standingView(heading));
        const calls = drawn((atlas, ctx) => {
          atlas.drawFrontierCreature(ctx, 'tarantula', 10, 10, heading, phase(3), null, true);
          atlas.drawFrontierCreature(ctx, 'tarantula', 10, 10, heading, phase(0), 3, true);
          atlas.drawFrontierCreature(ctx, 'tarantula', 10, 10, heading, phase(2), 4, true);
        });
        const label = `${mapHeading} r${rotation}`;
        expect(calls.map(c => [c.sheet.width, c.sheet.height]), label).toEqual(Array(3).fill([G * WALK_FRAMES * VIEWS, G * 2]));
        expect(calls[0].sx, label).toBe((3 * VIEWS + view) * G);
        expect(calls[0].sy, label).toBe(0);
        // Biting: the snap frame (3 % 2 = 1) and the gape frame (4 % 2 = 0) of the bite row
        expect(calls[1].sx, label).toBe((1 * VIEWS + view) * G);
        expect(calls[1].sy, label).toBe(G);
        expect(calls[2].sx, label).toBe((0 * VIEWS + view) * G);
        expect(calls[2].sy, label).toBe(G);
      }
    }
  });

  it('bakes its standing sheet once, never per frame, apart from the spider one', () => {
    const atlas = new SpriteAtlas();
    const calls = drawn((a, ctx) => {
      for (let i = 0; i < 6; i++) a.drawFrontierCreature(ctx, 'tarantula', 10, 10, i, phase(i), i % 2 ? i : null, true);
    }, atlas);
    expect(new Set(calls.map(c => c.sheet)).size).toBe(1);
    const before = created.length;
    drawn((a, ctx) => a.drawFrontierCreature(ctx, 'tarantula', 10, 10, 0, phase(0), null, true), atlas);
    expect(created.length).toBe(before);
    const spider = drawn((a, ctx) => a.drawFrontierCreature(ctx, 'spider', 10, 10, 0, phase(0), 1, true), atlas);
    expect(spider[0].sheet).not.toBe(calls[0].sheet);
    // The spider has no standing bite row: biting replays its walk frames
    expect(spider[0].sheet.height).toBe(SPRITE_GRID.spider);
    expect(spider[0].sy).toBe(0);
  });
});
