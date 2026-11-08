// SpriteAtlas draws the weaver spider's 3/4 standing sheet only when asked for
// a standing draw; every flat draw, and every other Phase 2 creature (the
// tarantula included), keeps its top-down sheet.
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

const G = SPRITE_GRID.spider;
const phase = (frame: number) => ((frame + 0.5) * Math.PI * 2) / WALK_FRAMES;
const MAP_HEADINGS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const OTHERS: Array<[FrontierSpriteKind, number]> = [
  ['legionary', SPRITE_GRID.legionary], ['legion_queen', SPRITE_GRID.legionQueen], ['mantis', SPRITE_GRID.mantis],
  ['tarantula', SPRITE_GRID.tarantula], ['centipede', SPRITE_GRID.centipede], ['spore_jelly', SPRITE_GRID.sporeJelly],
  ['acid_spitter', SPRITE_GRID.acidSpitter],
];

describe('SpriteAtlas standing weaver spider', () => {
  it('only the weaver spider has standing views among the Phase 2 creatures', () => {
    expect(hasStandingFrontierView('spider')).toBe(true);
    for (const [kind] of OTHERS) expect(hasStandingFrontierView(kind), kind).toBe(false);
  });

  it('draws the top-down sprite when not standing (flat camera, underground)', () => {
    const calls = drawn((atlas, ctx) => {
      atlas.drawFrontierCreature(ctx, 'spider', 10, 10, Math.PI / 2, phase(0));
      atlas.drawFrontierCreature(ctx, 'spider', 10, 10, Math.PI / 2, phase(0), 1);
      atlas.drawFrontierCreature(ctx, 'spider', 10, 10, Math.PI / 2, phase(0), null, false);
    });
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c.sheet.width).toBe(G * WALK_FRAMES * DIRECTIONS);
    expect(calls[1].sy).toBe(G); // the bite row
  });

  it('draws the 3/4 view the screen heading picks, at every camera rotation', () => {
    for (const mapHeading of MAP_HEADINGS) {
      for (const rotation of [0, 1, 2, 3]) {
        const heading = screenHeading(mapHeading, rotation);
        const view = STANDING_VIEWS.indexOf(standingView(heading));
        const calls = drawn((atlas, ctx) => {
          atlas.drawFrontierCreature(ctx, 'spider', 10, 10, heading, phase(3), null, true);
          // Biting falls back to the walk frames (the spider has no bite pose)
          atlas.drawFrontierCreature(ctx, 'spider', 10, 10, heading, phase(0), 3, true);
        });
        const label = `${mapHeading} r${rotation}`;
        expect(calls.map(c => c.sheet.width), label).toEqual([G * WALK_FRAMES * STANDING_VIEWS.length, G * WALK_FRAMES * STANDING_VIEWS.length]);
        expect(calls[0].sx, label).toBe((3 * STANDING_VIEWS.length + view) * G);
        expect(calls[0].sy, label).toBe(0);
        expect(calls[1].sx, label).toBe((1 * STANDING_VIEWS.length + view) * G);
        expect(calls[1].sy, label).toBe(0);
      }
    }
  });

  it('bakes its standing sheet once, never per frame', () => {
    const atlas = new SpriteAtlas();
    const calls = drawn((a, ctx) => {
      for (let i = 0; i < 6; i++) a.drawFrontierCreature(ctx, 'spider', 10, 10, i, phase(i), i % 2 ? i : null, true);
    }, atlas);
    expect(new Set(calls.map(c => c.sheet)).size).toBe(1);
    const before = created.length;
    drawn((a, ctx) => a.drawFrontierCreature(ctx, 'spider', 10, 10, 0, phase(0), null, true), atlas);
    expect(created.length).toBe(before);
  });

  it.each(OTHERS)('%s keeps its top-down sheet even when asked to stand', (kind, grid) => {
    const calls = drawn((atlas, ctx) => {
      atlas.drawFrontierCreature(ctx, kind, 10, 10, Math.PI / 2, phase(1), null, true);
      atlas.drawFrontierCreature(ctx, kind, 10, 10, Math.PI / 2, phase(1), null, false);
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].sheet).toBe(calls[1].sheet);
    expect(calls[0].sx).toBe(calls[1].sx);
    expect(calls[0].sheet.width).toBe(grid * WALK_FRAMES * DIRECTIONS);
  });
});
