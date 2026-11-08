// The alien tarantula standing (3/4) for a tilted camera: the same 88×88 grid,
// palette, outline and light rules as its top-down sprite, four screen-facing
// views picked like the spider's, the crown of green eyes and two heavy fangs
// from the front, the teal crystal spines on the furry abdomen from behind,
// thick hairy legs arched to both sides, and its bite pose in every view.
import { describe, expect, it } from 'vitest';
import type { ArtGrid } from '../pixelart/ArtGrid';
import { PAL } from '../pixelart/palette';
import { ART_PX, SPRITE_GRID, WALK_FRAMES, spritePivot } from './spriteScale';
import { STANDING_VIEWS, standingView } from './standingParts';
import { paintStandingTarantula } from './standingTarantulaSprite';
import { screenHeading } from '../uprightOverlay';

const T: readonly string[] = PAL.tarantula;
const EYE = PAL.tarantulaEye;
const SPINE = PAL.tarantulaBristle;
const SIZE = SPRITE_GRID.tarantula;
const CENTRE = Math.floor(SIZE / 2);
/** The tarantula's own colors: its fur ramp, the crystal teal, the eye green and the outline. */
const TARANTULA_COLORS = new Set<string>([...T, SPINE, EYE, PAL.outline]);

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

const pixels = (grid: ArtGrid): string => painted(grid).map(([x, y, c]) => `${x},${y},${c}`).join(';');

/** Topmost row of the outlined body (legs and hairs are not solid). */
function bodyTop(grid: ArtGrid): number {
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) if (grid.isSolid(x, y)) return y;
  return grid.height;
}

const POSES = [false, true] as const;

describe('alien tarantula standing view selection', () => {
  it('picks the view from the screen heading like the spider, at every camera rotation', () => {
    // A tarantula walking down the map (map heading π/2) at each quarter turn of the camera
    const views = [0, 1, 2, 3].map(rotation => standingView(screenHeading(Math.PI / 2, rotation)));
    expect(views).toEqual(['front', 'left', 'back', 'right']);
    // And each map heading at rotation 3 (three quarter turns)
    expect([0, Math.PI / 2, Math.PI, -Math.PI / 2].map(h => standingView(screenHeading(h, 3)))).toEqual(['back', 'right', 'front', 'left']);
  });
});

describe('paintStandingTarantula', () => {
  it('paints every view, frame and pose on its 88×88 grid with its own palette only', () => {
    for (const bite of POSES) {
      for (const view of STANDING_VIEWS) {
        for (let frame = 0; frame < WALK_FRAMES; frame++) {
          const grid = paintStandingTarantula({ view, frame, bite });
          const label = `${view} f${frame}${bite ? ' bite' : ''}`;
          expect(grid.width, label).toBe(SIZE);
          expect(grid.height, label).toBe(SIZE);
          const px = painted(grid);
          expect(px.length, label).toBeGreaterThan(1200);
          for (const [x, y, c] of px) expect(TARANTULA_COLORS.has(c), `${label} (${x},${y}) ${c}`).toBe(true);
          expect(px.some(([, , c]) => c === PAL.outline), label).toBe(true);
          expect(px.filter(([, , c]) => T.includes(c)).length, label).toBeGreaterThan(800);
        }
      }
    }
  });

  it('shows four different views, front unlike back', () => {
    const seen = new Set(STANDING_VIEWS.map(view => pixels(paintStandingTarantula({ view, frame: 0 }))));
    expect(seen.size).toBe(4);
    expect(pixels(paintStandingTarantula({ view: 'front', frame: 0 }))).not.toBe(pixels(paintStandingTarantula({ view: 'back', frame: 0 })));
  });

  it('paints the left view as the right one mirrored about the pivot column, biting too', () => {
    for (const bite of POSES) {
      for (let frame = 0; frame < WALK_FRAMES; frame++) {
        const right = paintStandingTarantula({ view: 'right', frame, bite });
        const left = paintStandingTarantula({ view: 'left', frame, bite });
        for (let y = 0; y < SIZE; y++) {
          expect(right.get(0, y), `edge (0,${y})`).toBeNull();
          expect(left.get(SIZE - 1, y), `edge (${SIZE - 1},${y})`).toBeNull();
          for (let x = 1; x < SIZE; x++) {
            const m = 2 * CENTRE - x;
            expect(left.get(m, y) !== null, `f${frame} (${x},${y})`).toBe(right.get(x, y) !== null);
            expect(left.isSolid(m, y), `f${frame} solid (${x},${y})`).toBe(right.isSolid(x, y));
          }
        }
      }
    }
  });

  it('walks through the same 4-frame cycle as its top-down sprite in every view', () => {
    for (const view of STANDING_VIEWS) {
      const frames = new Set(Array.from({ length: WALK_FRAMES }, (_, frame) => pixels(paintStandingTarantula({ view, frame }))));
      expect(frames.size, view).toBeGreaterThanOrEqual(3);
      expect(pixels(paintStandingTarantula({ view, frame: WALK_FRAMES }))).toBe(pixels(paintStandingTarantula({ view, frame: 0 })));
    }
  });

  it('bites in every view: a pose unlike the walk, fangs gaping (frame 0) then snapping shut (frame 1)', () => {
    for (const view of STANDING_VIEWS) {
      const gape = pixels(paintStandingTarantula({ view, frame: 0, bite: true }));
      const snap = pixels(paintStandingTarantula({ view, frame: 1, bite: true }));
      for (let frame = 0; frame < WALK_FRAMES; frame++) {
        const walk = pixels(paintStandingTarantula({ view, frame }));
        expect(gape, `${view} f${frame}`).not.toBe(walk);
        expect(snap, `${view} f${frame}`).not.toBe(walk);
      }
      // The back hides the fangs: from there the two bite frames may match
      if (view !== 'back') expect(snap, view).not.toBe(gape);
      // Like the top-down bite row, it repeats every two frames
      expect(pixels(paintStandingTarantula({ view, frame: 2, bite: true })), view).toBe(gape);
    }
  });

  it('rears its front legs above its head in the front-view threat pose', () => {
    // The topmost leg pixel over the body's width
    const top = (bite: boolean) => {
      const grid = paintStandingTarantula({ view: 'front', frame: 0, bite });
      return Math.min(...painted(grid).filter(([x, y]) => !grid.isSolid(x, y) && Math.abs(x - CENTRE) <= 20).map(([, y]) => y));
    };
    expect(top(true)).toBeLessThan(top(false) - 6);
  });

  it('faces the viewer from the front: a crown of eight green eyes on both sides, heavy fangs below it', () => {
    const grid = paintStandingTarantula({ view: 'front', frame: 0 });
    const front = painted(grid);
    const eyes = front.filter(([, , c]) => c === EYE);
    // Eight eyes, two big ones: at least 2×2 px each
    expect(eyes.length).toBeGreaterThanOrEqual(8 * 4);
    expect(eyes.filter(([x]) => x < CENTRE).length).toBeGreaterThanOrEqual(16);
    expect(eyes.filter(([x]) => x > CENTRE).length).toBeGreaterThanOrEqual(16);
    for (const [x, y] of eyes) expect(grid.isBody(x, y), `eye (${x},${y})`).toBe(true);
    // The fangs: solid silhouette below the eyes, on both sides of the centre
    const lowestEye = Math.max(...eyes.map(([, y]) => y));
    const fangs = front.filter(([x, y]) => grid.isBody(x, y) && y > lowestEye + 8 && Math.abs(x - CENTRE) <= 10);
    expect(fangs.filter(([x]) => x < CENTRE).length).toBeGreaterThanOrEqual(10);
    expect(fangs.filter(([x]) => x > CENTRE).length).toBeGreaterThanOrEqual(10);
  });

  it('shows the teal crystal spines on the furry abdomen from behind, and no eyes', () => {
    const grid = paintStandingTarantula({ view: 'back', frame: 0 });
    const px = painted(grid);
    expect(px.some(([, , c]) => c === EYE)).toBe(false);
    const spines = px.filter(([, , c]) => c === SPINE);
    expect(spines.length).toBeGreaterThanOrEqual(30);
    // Mostly growing out of the body, on both sides of the spine ridge
    expect(spines.filter(([x, y]) => grid.isBody(x, y)).length).toBeGreaterThan(spines.length * 0.6);
    expect(spines.some(([x]) => x < CENTRE - 6) && spines.some(([x]) => x > CENTRE + 6)).toBe(true);
  });

  it('crowns the abdomen with crystal spines in the front and side views too', () => {
    for (const view of ['front', 'right'] as const) {
      const spines = painted(paintStandingTarantula({ view, frame: 0 })).filter(([, , c]) => c === SPINE);
      expect(spines.length, view).toBeGreaterThanOrEqual(12);
    }
  });

  it('spreads eight thick legs out to both sides in front and back views', () => {
    for (const view of ['front', 'back'] as const) {
      const grid = paintStandingTarantula({ view, frame: 0 });
      const legs = painted(grid).filter(([x, y]) => !grid.isSolid(x, y));
      const xs = legs.map(([x]) => x);
      expect(Math.min(...xs), view).toBeLessThanOrEqual(10);
      expect(Math.max(...xs), view).toBeGreaterThanOrEqual(SIZE - 11);
      // Thick: far more leg pixels than eight 1-px strokes would paint
      expect(legs.length, view).toBeGreaterThan(900);
    }
  });

  it('carries its heavy body low between high knees from the side, near legs lit over far ones', () => {
    const grid = paintStandingTarantula({ view: 'right', frame: 0 });
    const legs = painted(grid).filter(([x, y]) => !grid.isSolid(x, y));
    const kneeTop = Math.min(...legs.map(([, y]) => y));
    const feet = Math.max(...legs.map(([, y]) => y));
    expect(kneeTop).toBeLessThan(bodyTop(grid));
    expect(feet - kneeTop).toBeGreaterThanOrEqual(28);
    const xs = legs.map(([x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(60);
    // The near flank's legs reach the ground lower and carry the lit tone
    const lowest = legs.filter(([, y]) => y >= feet - 3);
    expect(lowest.some(([, , c]) => c === T[3])).toBe(true);
  });

  it('keeps the feet on the ground just below the pivot', () => {
    const pivot = spritePivot(SIZE);
    for (const bite of POSES) {
      for (const view of STANDING_VIEWS) {
        for (let frame = 0; frame < WALK_FRAMES; frame++) {
          const lowest = Math.max(...painted(paintStandingTarantula({ view, frame, bite })).map(([, y]) => y));
          const below = (lowest + 1 - pivot) * ART_PX;
          expect(below, `${view} f${frame}`).toBeGreaterThanOrEqual(16);
          expect(below, `${view} f${frame}`).toBeLessThanOrEqual(28);
        }
      }
    }
  });
});
