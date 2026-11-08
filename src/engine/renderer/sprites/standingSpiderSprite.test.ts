// The weaver spider standing (3/4) for a tilted camera: the same 32×32 grid,
// palette, outline and light rules as its top-down sprite, four screen-facing
// views picked like the ants', the eye cluster and fangs from the front, the
// red hourglass from behind, high-kneed legs on both sides.
import { describe, expect, it } from 'vitest';
import type { ArtGrid } from '../pixelart/ArtGrid';
import { PAL } from '../pixelart/palette';
import { ART_PX, SPRITE_GRID, WALK_FRAMES, spritePivot } from './spriteScale';
import { STANDING_VIEWS, standingView } from './standingParts';
import { paintStandingSpider } from './standingSpiderSprite';
import { screenHeading } from '../uprightOverlay';

const S: readonly string[] = PAL.spider;
const MARK = PAL.spiderMark;
const SIZE = SPRITE_GRID.spider;
const CENTRE = Math.floor(SIZE / 2);
/** The spider's own colors: its ramp, the hourglass/eye red and the outline. */
const SPIDER_COLORS = new Set<string>([...S, MARK, PAL.outline]);

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

/** Topmost row of the outlined body (legs are not solid). */
function bodyTop(grid: ArtGrid): number {
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) if (grid.isSolid(x, y)) return y;
  return grid.height;
}

describe('weaver spider standing view selection', () => {
  it('picks the view from the screen heading like the ants, at every camera rotation', () => {
    // A spider walking down the map (map heading π/2) at each quarter turn of the camera
    const views = [0, 1, 2, 3].map(rotation => standingView(screenHeading(Math.PI / 2, rotation)));
    expect(views).toEqual(['front', 'left', 'back', 'right']);
    // And each map heading at rotation 1 (a quarter turn clockwise)
    expect([0, Math.PI / 2, Math.PI, -Math.PI / 2].map(h => standingView(screenHeading(h, 1)))).toEqual(['front', 'left', 'back', 'right']);
  });
});

describe('paintStandingSpider', () => {
  it('paints every view and frame on its 32×32 grid with its own palette only', () => {
    for (const view of STANDING_VIEWS) {
      for (let frame = 0; frame < WALK_FRAMES; frame++) {
        const grid = paintStandingSpider({ view, frame });
        const label = `${view} f${frame}`;
        expect(grid.width, label).toBe(SIZE);
        expect(grid.height, label).toBe(SIZE);
        const px = painted(grid);
        expect(px.length, label).toBeGreaterThan(120);
        for (const [x, y, c] of px) expect(SPIDER_COLORS.has(c), `${label} (${x},${y}) ${c}`).toBe(true);
        expect(px.some(([, , c]) => c === PAL.outline), label).toBe(true);
        expect(px.filter(([, , c]) => S.includes(c)).length, label).toBeGreaterThan(60);
      }
    }
  });

  it('shows four different views, front unlike back', () => {
    const seen = new Set(STANDING_VIEWS.map(view => pixels(paintStandingSpider({ view, frame: 0 }))));
    expect(seen.size).toBe(4);
    expect(pixels(paintStandingSpider({ view: 'front', frame: 0 }))).not.toBe(pixels(paintStandingSpider({ view: 'back', frame: 0 })));
  });

  it('paints the left view as the right one mirrored about the pivot column', () => {
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      const right = paintStandingSpider({ view: 'right', frame });
      const left = paintStandingSpider({ view: 'left', frame });
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
  });

  it('walks through the same 4-frame cycle as its top-down sprite in every view', () => {
    for (const view of STANDING_VIEWS) {
      const frames = new Set(Array.from({ length: WALK_FRAMES }, (_, frame) => pixels(paintStandingSpider({ view, frame }))));
      expect(frames.size, view).toBeGreaterThanOrEqual(3);
      expect(pixels(paintStandingSpider({ view, frame: WALK_FRAMES }))).toBe(pixels(paintStandingSpider({ view, frame: 0 })));
    }
  });

  it('faces the viewer from the front: the red eye cluster on both sides, fangs below it', () => {
    const front = painted(paintStandingSpider({ view: 'front', frame: 0 }));
    const eyes = front.filter(([, , c]) => c === MARK);
    expect(eyes.length).toBeGreaterThanOrEqual(4);
    expect(eyes.some(([x]) => x < CENTRE)).toBe(true);
    expect(eyes.some(([x]) => x > CENTRE)).toBe(true);
    // Fangs: the lit tone, under the eyes, on both sides of the centre
    const lowestEye = Math.max(...eyes.map(([, y]) => y));
    const fangs = front.filter(([x, y, c]) => c === S[3] && y > lowestEye + 1 && Math.abs(x - CENTRE) <= 3);
    expect(fangs.some(([x]) => x < CENTRE)).toBe(true);
    expect(fangs.some(([x]) => x > CENTRE)).toBe(true);
  });

  it('shows the red hourglass on the abdomen from behind, and no eyes', () => {
    const grid = paintStandingSpider({ view: 'back', frame: 0 });
    const mark = painted(grid).filter(([, , c]) => c === MARK);
    expect(mark.length).toBeGreaterThanOrEqual(6);
    // On the body, centred, both lobes of the hourglass (above and below its waist)
    for (const [x, y] of mark) expect(grid.isBody(x, y), `(${x},${y})`).toBe(true);
    const ys = mark.map(([, y]) => y);
    const waist = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(mark.filter(([, y]) => y < waist).length).toBeGreaterThanOrEqual(2);
    expect(mark.filter(([, y]) => y > waist).length).toBeGreaterThanOrEqual(2);
    expect(mark.some(([x]) => x < CENTRE) && mark.some(([x]) => x > CENTRE)).toBe(true);
  });

  it('arches its eight legs out to both sides with knees above the body in front and back views', () => {
    for (const view of ['front', 'back'] as const) {
      const grid = paintStandingSpider({ view, frame: 0 });
      const legs = painted(grid).filter(([x, y]) => !grid.isSolid(x, y));
      const xs = legs.map(([x]) => x);
      expect(Math.min(...xs), view).toBeLessThanOrEqual(5);
      expect(Math.max(...xs), view).toBeGreaterThanOrEqual(SIZE - 6);
      // The knees rise above the top of the head (front) or abdomen (back)
      expect(Math.min(...legs.map(([, y]) => y)), view).toBeLessThan(bodyTop(grid) + 3);
    }
  });

  it('carries its body low between high knees from the side', () => {
    const grid = paintStandingSpider({ view: 'right', frame: 0 });
    const legs = painted(grid).filter(([x, y]) => !grid.isSolid(x, y));
    // Knees peak above the cephalothorax, the body sits in the lower half of the leg span
    const kneeTop = Math.min(...legs.map(([, y]) => y));
    const feet = Math.max(...legs.map(([, y]) => y));
    expect(kneeTop).toBeLessThan(bodyTop(grid) + 2);
    expect(feet - kneeTop).toBeGreaterThanOrEqual(12);
    const xs = legs.map(([x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(22);
  });

  it('keeps the feet on the ground just below the pivot', () => {
    const pivot = spritePivot(SIZE);
    for (const view of STANDING_VIEWS) {
      for (let frame = 0; frame < WALK_FRAMES; frame++) {
        const lowest = Math.max(...painted(paintStandingSpider({ view, frame })).map(([, y]) => y));
        const below = (lowest + 1 - pivot) * ART_PX;
        expect(below, `${view} f${frame}`).toBeGreaterThanOrEqual(6);
        expect(below, `${view} f${frame}`).toBeLessThanOrEqual(12);
      }
    }
  });
});
