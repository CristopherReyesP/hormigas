// Standing (3/4) views of every Swarm caste and the brood queen: the same
// sanity rules as the worker's views, plus checks that each caste keeps the
// silhouette features that tell it apart top-down.
import { describe, expect, it } from 'vitest';
import { AntRole } from '../../../game/components/components';
import type { ArtGrid } from '../pixelart/ArtGrid';
import { PAL } from '../pixelart/palette';
import type { AntMarkId } from './antMarks';
import { ART_PX, SPRITE_GRID, WALK_FRAMES, spritePivot } from './spriteScale';
import {
  STANDING_VIEWS, hasStandingView, paintStandingAnt, paintStandingQueen, standingAntGlowPoints, type StandingView,
} from './standingAntSprites';

const CASTES = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender, AntRole.Bomber] as const;
const F = PAL.swarm.flesh;
const V = PAL.swarm.vein;

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

const isIn = (ramp: readonly string[], color: string | null): boolean => color !== null && ramp.includes(color);
const pixels = (grid: ArtGrid): string => painted(grid).map(([x, y, c]) => `${x},${y},${c}`).join(';');

/** Columns spanned by the outlined body (legs and antennae are not solid). */
function solidWidth(grid: ArtGrid): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.isSolid(x, y)) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    }
  }
  return hi - lo + 1;
}

function solidArea(grid: ArtGrid): number {
  let n = 0;
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) if (grid.isSolid(x, y)) n++;
  return n;
}

/** Leftmost to rightmost painted column (legs included). */
function span(grid: ArtGrid): number {
  const xs = painted(grid).map(([x]) => x);
  return Math.max(...xs) - Math.min(...xs) + 1;
}

/** Every mirrored pair of the left and right views matches, and nothing falls off the grid. */
function expectMirrored(right: ArtGrid, left: ArtGrid, label: string): void {
  const axis = Math.floor(right.width / 2);
  for (let y = 0; y < right.height; y++) {
    expect(right.get(0, y), `${label} edge (0,${y})`).toBeNull();
    expect(left.get(right.width - 1, y), `${label} edge (${right.width - 1},${y})`).toBeNull();
    for (let x = 1; x < right.width; x++) {
      const m = 2 * axis - x;
      expect(left.get(m, y) !== null, `${label} (${x},${y})`).toBe(right.get(x, y) !== null);
      expect(left.isSolid(m, y), `${label} solid (${x},${y})`).toBe(right.isSolid(x, y));
    }
  }
}

describe('every Swarm caste stands in 3/4 view', () => {
  it('has standing views for all six castes', () => {
    for (const role of CASTES) expect(hasStandingView(role), role).toBe(true);
  });
});

describe.each(CASTES)('paintStandingAnt: %s', role => {
  const palette = paletteColors();

  it('paints every view, frame and load on the ant grid with palette colors only', () => {
    for (const view of STANDING_VIEWS) {
      for (let frame = 0; frame < WALK_FRAMES; frame++) {
        for (const carrying of [false, true, 'ore'] as const) {
          const grid = paintStandingAnt({ role, view, frame, carrying });
          const label = `${role} ${view} f${frame} ${String(carrying)}`;
          expect(grid.width, label).toBe(SPRITE_GRID.ant);
          expect(grid.height, label).toBe(SPRITE_GRID.ant);
          const px = painted(grid);
          expect(px.length, label).toBeGreaterThan(60);
          for (const [x, y, c] of px) expect(palette.has(c), `${label} (${x},${y}) ${c}`).toBe(true);
          expect(px.some(([, , c]) => c === PAL.swarm.outline), label).toBe(true);
          expect(px.some(([, , c]) => isIn(V, c)), label).toBe(true);
          expect(px.filter(([, , c]) => isIn(F, c)).length, label).toBeGreaterThan(25);
        }
      }
    }
  });

  it('shows four different views, front unlike back', () => {
    const seen = new Set(STANDING_VIEWS.map(view => pixels(paintStandingAnt({ role, view, frame: 0 }))));
    expect(seen.size).toBe(4);
  });

  it('paints the left view as the right one mirrored about the pivot', () => {
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      for (const carrying of [false, true, 'ore'] as const) {
        expectMirrored(paintStandingAnt({ role, view: 'right', frame, carrying }), paintStandingAnt({ role, view: 'left', frame, carrying }), `${role} f${frame}`);
      }
    }
  });

  it('walks through the same 4-frame cycle as its top-down sprite in every view', () => {
    for (const view of STANDING_VIEWS) {
      const frames = new Set(Array.from({ length: WALK_FRAMES }, (_, frame) => pixels(paintStandingAnt({ role, view, frame }))));
      expect(frames.size, view).toBeGreaterThanOrEqual(3);
      // The cycle loops: frame 4 is frame 0 again
      expect(pixels(paintStandingAnt({ role, view, frame: WALK_FRAMES }))).toBe(pixels(paintStandingAnt({ role, view, frame: 0 })));
    }
  });

  it('faces the viewer from the front: both eyes on the head flanks, jaws below them', () => {
    const front = painted(paintStandingAnt({ role, view: 'front', frame: 0 }));
    const back = painted(paintStandingAnt({ role, view: 'back', frame: 0 }));
    const centre = Math.floor(SPRITE_GRID.ant / 2);
    const frontEyes = front.filter(([x, y, c]) => c === V[1] && y >= 9 && y <= 14 && x !== centre);
    expect(frontEyes.some(([x]) => x < centre)).toBe(true);
    expect(frontEyes.some(([x]) => x > centre)).toBe(true);
    const lowestEye = Math.max(...frontEyes.map(([, y]) => y));
    const jaws = front.filter(([, y, c]) => c === F[4] && y > lowestEye);
    expect(jaws.some(([x]) => x < centre)).toBe(true);
    expect(jaws.some(([x]) => x > centre)).toBe(true);
    // From behind, no eyes glow: only the vein
    expect(standingAntGlowPoints('front', role).length - standingAntGlowPoints('back', role).length).toBe(1);
    expect(back.length).toBeGreaterThan(0);
  });

  it('splays its legs to both sides of the body in front and back views', () => {
    for (const view of ['front', 'back'] as const) {
      const grid = paintStandingAnt({ role, view, frame: 0 });
      // Legs reach well past the body on both sides
      expect(span(grid) - solidWidth(grid), view).toBeGreaterThanOrEqual(6);
    }
  });

  it('paints its legs in a flesh tone that reads on dark ground', () => {
    for (const view of STANDING_VIEWS) {
      const grid = paintStandingAnt({ role, view, frame: 0 });
      // Leg pixels: flesh outside the solid body, below the body's middle
      const legs = painted(grid).filter(([x, y, c]) => !grid.isSolid(x, y) && isIn(F, c) && y >= 13);
      expect(legs.length, view).toBeGreaterThan(4);
      expect(legs.filter(([, , c]) => c === F[0] || c === F[1]).length, view).toBeLessThan(legs.length / 2);
    }
  });

  it('holds a carried leaf in the jaws and shows ore as cyan crystal', () => {
    for (const view of STANDING_VIEWS) {
      expect(painted(paintStandingAnt({ role, view, frame: 0 })).some(([, , c]) => isIn(PAL.leaf, c)), view).toBe(false);
      expect(painted(paintStandingAnt({ role, view, frame: 0, carrying: true })).some(([, , c]) => isIn(PAL.leaf, c)), view).toBe(true);
      expect(painted(paintStandingAnt({ role, view, frame: 0, carrying: 'ore' })).some(([, , c]) => isIn(PAL.crystal.shell, c)), view).toBe(true);
    }
  });

  it('keeps the feet on the ground just below the pivot', () => {
    const pivot = spritePivot(SPRITE_GRID.ant);
    for (const view of STANDING_VIEWS) {
      const lowest = Math.max(...painted(paintStandingAnt({ role, view, frame: 1 })).map(([, y]) => y));
      const below = (lowest + 1 - pivot) * ART_PX;
      expect(below, view).toBeGreaterThanOrEqual(6);
      expect(below, view).toBeLessThanOrEqual(12);
    }
  });

  it('puts the night glow on the painted vein and eyes of each view', () => {
    const pivot = spritePivot(SPRITE_GRID.ant);
    for (const view of STANDING_VIEWS) {
      const grid = paintStandingAnt({ role, view, frame: 0 });
      const points = standingAntGlowPoints(view, role);
      expect(points.length, view).toBeGreaterThanOrEqual(2);
      for (const p of points) {
        const x = Math.floor(p.along / ART_PX + pivot);
        const y = Math.floor(p.across / ART_PX + pivot);
        expect(isIn(V, grid.get(x, y)), `${role} ${view} (${x},${y})`).toBe(true);
      }
    }
  });
});

describe('caste marks in every standing view', () => {
  /** Marks each caste shows (antMarks.ts), with the color they add. */
  const cases: Array<[AntRole, AntMarkId, readonly string[]]> = [
    [AntRole.Soldier, 'chartreuse_jaws', V],
    [AntRole.Soldier, 'venom_sac', PAL.acid],
    [AntRole.Scout, 'compound_eyes', PAL.acid],
    [AntRole.Nurse, 'royal_sigil', [PAL.queen]],
    [AntRole.Defender, 'royal_sigil', [PAL.queen]],
    [AntRole.Defender, 'venom_sac', PAL.acid],
  ];
  it.each(cases)('%s shows %s', (role, mark, colors) => {
    const marks = new Map<AntMarkId, number>([[mark, 3]]);
    for (const view of STANDING_VIEWS) {
      const plain = painted(paintStandingAnt({ role, view, frame: 0 })).filter(([, , c]) => isIn(colors, c)).length;
      const marked = painted(paintStandingAnt({ role, view, frame: 0, marks })).filter(([, , c]) => isIn(colors, c)).length;
      expect(marked, `${role} ${mark} ${view}`).toBeGreaterThan(plain);
    }
  });

  it.each([
    [AntRole.Soldier, 'thick_head_plate'], [AntRole.Scout, 'wing_stubs'], [AntRole.Nurse, 'brood_nodes'],
    [AntRole.Defender, 'dorsal_spines'], [AntRole.Worker, 'swollen_pale_gaster'], [AntRole.Soldier, 'leg_spurs'],
  ] as Array<[AntRole, AntMarkId]>)('%s changes with %s in every view', (role, mark) => {
    const marks = new Map<AntMarkId, number>([[mark, 2]]);
    for (const view of STANDING_VIEWS) {
      expect(pixels(paintStandingAnt({ role, view, frame: 0, marks })), `${role} ${mark} ${view}`)
        .not.toBe(pixels(paintStandingAnt({ role, view, frame: 0 })));
    }
  });

  it('ignores marks a caste never shows', () => {
    const marks = new Map<AntMarkId, number>([['wing_stubs', 3], ['brood_nodes', 3]]);
    for (const role of [AntRole.Soldier, AntRole.Defender, AntRole.Bomber]) {
      for (const view of STANDING_VIEWS) {
        expect(pixels(paintStandingAnt({ role, view, frame: 0, marks })), `${role} ${view}`).toBe(pixels(paintStandingAnt({ role, view, frame: 0 })));
      }
    }
  });
});

describe('each caste stays recognizable standing', () => {
  const grid = (role: AntRole, view: StandingView) => paintStandingAnt({ role, view, frame: 1 });
  /** Solid rows/cols of the head region in the front view: where the eyes are. */
  const frontHeadWidth = (role: AntRole): number => {
    const g = grid(role, 'front');
    const eyes = painted(g).filter(([, y, c]) => c === V[1] && y >= 9 && y <= 14);
    const row = Math.round(eyes.reduce((s, [, y]) => s + y, 0) / eyes.length);
    let n = 0;
    for (let x = 0; x < g.width; x++) if (g.isSolid(x, row)) n++;
    return n;
  };

  it('the soldier has the biggest head and the longest jaws', () => {
    for (const role of CASTES) if (role !== AntRole.Soldier && role !== AntRole.Defender) expect(frontHeadWidth(AntRole.Soldier), role).toBeGreaterThan(frontHeadWidth(role));
    const jawPx = (role: AntRole) => painted(grid(role, 'right')).filter(([x, , c]) => c === F[4] && x >= 18).length;
    for (const role of CASTES) if (role !== AntRole.Soldier) expect(jawPx(AntRole.Soldier), role).toBeGreaterThan(jawPx(role));
  });

  it('the bomber carries the biggest abdomen, glowing with toxic glands', () => {
    /** Solid pixels above the front view's eyes: the gaster dome rising behind the head. */
    const dome = (role: AntRole): number => {
      const g = grid(role, 'front');
      const top = Math.min(...painted(g).filter(([, y, c]) => c === V[1] && y >= 9 && y <= 14).map(([, y]) => y));
      let n = 0;
      for (let y = 0; y < top - 1; y++) for (let x = 0; x < g.width; x++) if (g.isSolid(x, y)) n++;
      return n;
    };
    for (const role of CASTES) if (role !== AntRole.Bomber) expect(dome(AntRole.Bomber), role).toBeGreaterThan(dome(role));
    for (const view of ['back', 'left', 'right'] as const) {
      // (the soldier's huge head and the defender's armor outweigh it)
      for (const role of [AntRole.Worker, AntRole.Scout, AntRole.Nurse]) expect(solidArea(grid(AntRole.Bomber, view)), `${role} ${view}`).toBeGreaterThan(solidArea(grid(role, view)));
    }
    for (const view of STANDING_VIEWS) {
      const glow = (role: AntRole) => painted(grid(role, view)).filter(([, , c]) => isIn(V, c)).length;
      expect(glow(AntRole.Bomber), view).toBeGreaterThan(glow(AntRole.Worker) + 3);
    }
  });

  it('the scout has the widest stance and the nurse the slimmest body', () => {
    for (const view of ['front', 'back'] as const) {
      for (const role of CASTES) if (role !== AntRole.Scout) expect(span(grid(AntRole.Scout, view)), `${role} ${view}`).toBeGreaterThanOrEqual(span(grid(role, view)));
      for (const role of CASTES) if (role !== AntRole.Nurse) expect(solidWidth(grid(AntRole.Nurse, view)), `${role} ${view}`).toBeLessThan(solidWidth(grid(role, view)));
    }
  });

  it('the nurse is pale and the defender dark-plated with a pale horn', () => {
    const tone = (role: AntRole, view: StandingView) => {
      const px = painted(grid(role, view)).filter(([x, y, c]) => grid(role, view).isBody(x, y) && isIn(F, c));
      return px.reduce((s, [, , c]) => s + F.indexOf(c as typeof F[number]), 0) / px.length;
    };
    for (const view of STANDING_VIEWS) {
      // (from the front her pale gaster hides behind the head)
      if (view !== 'front') expect(tone(AntRole.Nurse, view), view).toBeGreaterThan(tone(AntRole.Worker, view));
      expect(tone(AntRole.Defender, view), view).toBeLessThan(tone(AntRole.Worker, view));
    }
    // The horn juts forward from the shield in the side view, and points at the viewer from the front
    const right = grid(AntRole.Defender, 'right');
    expect(painted(right).some(([x, , c]) => c === F[4] && x >= 20)).toBe(true);
    expect(solidWidth(grid(AntRole.Defender, 'front'))).toBeGreaterThanOrEqual(solidWidth(grid(AntRole.Worker, 'front')));
  });
});

describe('paintStandingQueen (the brood queen standing)', () => {
  const palette = paletteColors();

  it('paints every view and frame on her own grid with palette colors only', () => {
    for (const view of STANDING_VIEWS) {
      for (let frame = 0; frame < WALK_FRAMES; frame++) {
        for (const swollen of [false, true]) {
          const grid = paintStandingQueen({ view, frame, swollen });
          const label = `${view} f${frame} ${swollen}`;
          expect(grid.width, label).toBe(SPRITE_GRID.queen);
          expect(grid.height, label).toBe(SPRITE_GRID.queen);
          const px = painted(grid);
          expect(px.length, label).toBeGreaterThan(400);
          for (const [x, y, c] of px) expect(palette.has(c), `${label} (${x},${y}) ${c}`).toBe(true);
          expect(px.filter(([, , c]) => isIn(V, c)).length, label).toBeGreaterThan(20);
        }
      }
    }
  });

  it('shows four different views, the egg sac breathing in each', () => {
    const seen = new Set(STANDING_VIEWS.map(view => pixels(paintStandingQueen({ view, frame: 0 }))));
    expect(seen.size).toBe(4);
    for (const view of STANDING_VIEWS) {
      expect(solidArea(paintStandingQueen({ view, frame: 0, swollen: true })), view).toBeGreaterThan(solidArea(paintStandingQueen({ view, frame: 0 })));
    }
  });

  it('paints the left view as the right one mirrored about the pivot', () => {
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      expectMirrored(paintStandingQueen({ view: 'right', frame }), paintStandingQueen({ view: 'left', frame }), `queen f${frame}`);
    }
  });

  it('walks through the 4-frame cycle in every view', () => {
    for (const view of STANDING_VIEWS) {
      const frames = new Set(Array.from({ length: WALK_FRAMES }, (_, frame) => pixels(paintStandingQueen({ view, frame }))));
      expect(frames.size, view).toBeGreaterThanOrEqual(3);
    }
  });

  it('is far bigger than any caste and faces the viewer with both eyes from the front', () => {
    const queen = solidArea(paintStandingQueen({ view: 'front', frame: 0 }));
    for (const role of CASTES) expect(queen, role).toBeGreaterThan(3 * solidArea(paintStandingAnt({ role, view: 'front', frame: 0 })));
    const centre = Math.floor(SPRITE_GRID.queen / 2);
    const front = painted(paintStandingQueen({ view: 'front', frame: 0 }));
    const eyes = front.filter(([x, y, c]) => c === V[1] && y > centre && Math.abs(x - centre) >= 2 && Math.abs(x - centre) <= 6);
    expect(eyes.some(([x]) => x < centre)).toBe(true);
    expect(eyes.some(([x]) => x > centre)).toBe(true);
  });
});
