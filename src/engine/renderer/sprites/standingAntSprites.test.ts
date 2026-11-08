// The worker's standing (3/4) views: which of the four screen-facing views a
// tilted camera shows, and sanity checks on the painted frames themselves.
import { describe, expect, it } from 'vitest';
import { AntRole } from '../../../game/components/components';
import type { ArtGrid } from '../pixelart/ArtGrid';
import { PAL } from '../pixelart/palette';
import { screenHeading } from '../uprightOverlay';
import type { AntMarkId } from './antMarks';
import { ART_PX, SPRITE_GRID, WALK_FRAMES, spritePivot } from './spriteScale';
import {
  STANDING_VIEWS, hasStandingView, paintStandingAnt, standingAntGlowPoints, standingView,
} from './standingAntSprites';

const EAST = 0;
const SOUTH = Math.PI / 2;
const WEST = Math.PI;
const NORTH = -Math.PI / 2;
const DEG = Math.PI / 180;

/** Every hex color the palette defines, at any depth. */
function paletteColors(): Set<string> {
  const out = new Set<string>();
  const visit = (v: unknown): void => {
    if (typeof v === 'string' && v.startsWith('#')) out.add(v);
    else if (v && typeof v === 'object') for (const child of Object.values(v)) visit(child);
  };
  visit(PAL);
  return out;
}

function painted(grid: ArtGrid): Array<[number, number, string]> {
  const out: Array<[number, number, string]> = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const c = grid.get(x, y);
      if (c) out.push([x, y, c]);
    }
  }
  return out;
}

/** `color` is one of `ramp` (palette ramps are typed as their literal colors). */
const isIn = (ramp: readonly string[], color: string | null): boolean => color !== null && ramp.includes(color);

const pixels = (grid: ArtGrid): string => painted(grid).map(([x, y, c]) => `${x},${y},${c}`).join(';');

describe('standingView (screen heading → the view a tilted camera shows)', () => {
  it('faces front walking toward the viewer, back walking away, and sideways otherwise', () => {
    expect(standingView(SOUTH)).toBe('front');
    expect(standingView(NORTH)).toBe('back');
    expect(standingView(EAST)).toBe('right');
    expect(standingView(WEST)).toBe('left');
  });

  it('turns with the camera: one map heading shows a different view at each rotation', () => {
    const views = (heading: number) => [0, 1, 2, 3].map(r => standingView(screenHeading(heading, r)));
    // A quarter turn swings map east to the screen's bottom: map north lands on the right
    expect(views(NORTH)).toEqual(['back', 'right', 'front', 'left']);
    expect(views(EAST)).toEqual(['right', 'front', 'left', 'back']);
    expect(views(SOUTH)).toEqual(['front', 'left', 'back', 'right']);
    expect(views(WEST)).toEqual(['left', 'back', 'right', 'front']);
  });

  it('gives exact diagonals to the side views and anything steeper to front or back', () => {
    expect(standingView(45 * DEG)).toBe('right');
    expect(standingView(135 * DEG)).toBe('left');
    expect(standingView(225 * DEG)).toBe('left');
    expect(standingView(315 * DEG)).toBe('right');
    expect(standingView(-45 * DEG)).toBe('right');
    expect(standingView(46 * DEG)).toBe('front');
    expect(standingView(134 * DEG)).toBe('front');
    expect(standingView(226 * DEG)).toBe('back');
    expect(standingView(314 * DEG)).toBe('back');
  });

  it('normalizes any number of turns', () => {
    expect(standingView(SOUTH + 4 * Math.PI)).toBe('front');
    expect(standingView(NORTH - 6 * Math.PI)).toBe('back');
    expect(standingView(WEST + 2 * Math.PI)).toBe('left');
  });
});

describe('screenHeading', () => {
  it('adds a quarter turn per camera rotation', () => {
    for (const r of [0, 1, 2, 3]) expect(screenHeading(0.3, r)).toBeCloseTo(0.3 + (r * Math.PI) / 2);
  });
});

describe('which castes stand in 3/4 view', () => {
  it('is every caste of the colony', () => {
    for (const role of [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender, AntRole.Bomber]) {
      expect(hasStandingView(role)).toBe(true);
    }
  });
});

describe('paintStandingAnt (the worker seen from above and in front)', () => {
  const palette = paletteColors();
  const F = PAL.swarm.flesh;
  const V = PAL.swarm.vein;

  it('paints every view, frame and load on the ant grid with palette colors only', () => {
    for (const view of STANDING_VIEWS) {
      for (let frame = 0; frame < WALK_FRAMES; frame++) {
        for (const carrying of [false, true, 'ore'] as const) {
          const grid = paintStandingAnt({ view, frame, carrying });
          const label = `${view} f${frame} ${String(carrying)}`;
          expect(grid.width, label).toBe(SPRITE_GRID.ant);
          expect(grid.height, label).toBe(SPRITE_GRID.ant);
          const px = painted(grid);
          expect(px.length, label).toBeGreaterThan(80);
          for (const [x, y, c] of px) expect(palette.has(c), `${label} (${x},${y}) ${c}`).toBe(true);
          // The same flesh, the same glowing vein and the faction outline as the top-down worker
          expect(px.some(([, , c]) => c === PAL.swarm.outline), label).toBe(true);
          expect(px.some(([, , c]) => c === V[1]), label).toBe(true);
          expect(px.filter(([, , c]) => isIn(F, c)).length, label).toBeGreaterThan(40);
        }
      }
    }
  });

  it('shows four different views', () => {
    const seen = new Set(STANDING_VIEWS.map(view => pixels(paintStandingAnt({ view, frame: 0 }))));
    expect(seen.size).toBe(4);
  });

  it('paints the left view as the right one mirrored about the pivot (light still from the top-left)', () => {
    const axis = Math.floor(SPRITE_GRID.ant / 2); // the pivot pixel's column
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      for (const carrying of [false, true, 'ore'] as const) {
        const right = paintStandingAnt({ view: 'right', frame, carrying });
        const left = paintStandingAnt({ view: 'left', frame, carrying });
        for (let y = 0; y < right.height; y++) {
          // Nothing the mirror would push off the grid
          expect(right.get(0, y), `f${frame} edge (0,${y})`).toBeNull();
          expect(left.get(right.width - 1, y), `f${frame} edge (${right.width - 1},${y})`).toBeNull();
          for (let x = 1; x < right.width; x++) {
            const m = 2 * axis - x;
            expect(left.get(m, y) !== null, `f${frame} (${x},${y})`).toBe(right.get(x, y) !== null);
            expect(left.isSolid(m, y), `f${frame} solid (${x},${y})`).toBe(right.isSolid(x, y));
          }
        }
      }
    }
  });

  it('walks: the legs move through the 4-frame cycle in every view', () => {
    for (const view of STANDING_VIEWS) {
      const frames = new Set(Array.from({ length: WALK_FRAMES }, (_, frame) => pixels(paintStandingAnt({ view, frame }))));
      expect(frames.size, view).toBeGreaterThanOrEqual(3);
    }
  });

  it('shows the mandibles and both eyes from the front, no eyes from behind', () => {
    const front = painted(paintStandingAnt({ view: 'front', frame: 0 }));
    const back = painted(paintStandingAnt({ view: 'back', frame: 0 }));
    const centre = Math.floor(SPRITE_GRID.ant / 2);
    // (the vein runs down the centre column; the eyes sit on the head's flanks)
    const eyes = (px: typeof front) => px.filter(([x, y, c]) => c === V[1] && y >= centre && x !== centre);
    const frontEyes = eyes(front);
    expect(frontEyes.some(([x]) => x < centre)).toBe(true);
    expect(frontEyes.some(([x]) => x > centre)).toBe(true);
    // Pale bone jaws below the head, on both sides of the centre line
    const jaws = front.filter(([, y, c]) => c === F[4] && y >= centre + 3);
    expect(jaws.some(([x]) => x < centre)).toBe(true);
    expect(jaws.some(([x]) => x > centre)).toBe(true);
    expect(eyes(back)).toEqual([]);
  });

  it('holds a carried leaf in front of the face, peeking over the head from behind', () => {
    const leaf = (view: (typeof STANDING_VIEWS)[number]) =>
      painted(paintStandingAnt({ view, frame: 0, carrying: true })).filter(([, , c]) => isIn(PAL.leaf, c)).length;
    const empty = (view: (typeof STANDING_VIEWS)[number]) =>
      painted(paintStandingAnt({ view, frame: 0 })).filter(([, , c]) => isIn(PAL.leaf, c)).length;
    for (const view of STANDING_VIEWS) expect(empty(view), view).toBe(0);
    expect(leaf('front')).toBeGreaterThan(4);
    expect(leaf('right')).toBeGreaterThan(4);
    expect(leaf('back')).toBeGreaterThan(0);
    expect(leaf('back')).toBeLessThan(leaf('front'));
    const ore = painted(paintStandingAnt({ view: 'front', frame: 0, carrying: 'ore' }));
    expect(ore.some(([, , c]) => isIn(PAL.crystal.shell, c))).toBe(true);
  });

  it('keeps the feet on the ground just below the pivot, where the ground shadow lies', () => {
    const pivot = spritePivot(SPRITE_GRID.ant);
    for (const view of STANDING_VIEWS) {
      const lowest = Math.max(...painted(paintStandingAnt({ view, frame: 1 })).map(([, y]) => y));
      const below = (lowest + 1 - pivot) * ART_PX;
      expect(below, view).toBeGreaterThanOrEqual(6);
      expect(below, view).toBeLessThanOrEqual(12);
    }
  });

  it('draws the colony marks the worker shows', () => {
    const marks = new Map<AntMarkId, number>([['venom_sac', 1], ['compound_eyes', 1]]);
    for (const view of STANDING_VIEWS) {
      const px = painted(paintStandingAnt({ view, frame: 0, marks }));
      expect(px.some(([, , c]) => isIn(PAL.acid, c)), view).toBe(true);
    }
    // A mark the worker never shows changes nothing
    const plain = pixels(paintStandingAnt({ view: 'front', frame: 0 }));
    expect(pixels(paintStandingAnt({ view: 'front', frame: 0, marks: new Map<AntMarkId, number>([['wing_stubs', 3]]) }))).toBe(plain);
  });

  it('puts the night glow on the painted vein and eyes of each view', () => {
    const pivot = spritePivot(SPRITE_GRID.ant);
    for (const view of STANDING_VIEWS) {
      const grid = paintStandingAnt({ view, frame: 0 });
      const points = standingAntGlowPoints(view);
      expect(points.length, view).toBeGreaterThanOrEqual(2);
      for (const p of points) {
        const x = Math.floor(p.along / ART_PX + pivot);
        const y = Math.floor(p.across / ART_PX + pivot);
        expect(isIn(V, grid.get(x, y)), `${view} (${x},${y})`).toBe(true);
      }
    }
    expect(standingAntGlowPoints('front').length).toBeGreaterThan(standingAntGlowPoints('back').length);
  });
});
