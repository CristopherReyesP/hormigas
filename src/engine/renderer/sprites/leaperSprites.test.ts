import { describe, expect, it } from 'vitest';
import type { ArtGrid } from '../pixelart/ArtGrid';
import { DIRECTIONS } from '../pixelart/directions';
import { PAL } from '../pixelart/palette';
import { SPRITE_GRID, WALK_FRAMES, rotationSafeRadius, spritePivot } from './spriteScale';
import { LEAPER_FRAMES, type LeaperPose, leaperFrameIndex, paintCricket } from './wildlifeSprites';

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

/** 4-connected clusters of one color. */
function clusters(grid: ArtGrid, color: string): number {
  const seen = new Set<string>();
  let count = 0;
  for (const [x, y, c] of painted(grid)) {
    if (c !== color || seen.has(`${x},${y}`)) continue;
    count++;
    const stack: Array<[number, number]> = [[x, y]];
    seen.add(`${x},${y}`);
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        const k = `${nx},${ny}`;
        if (!seen.has(k) && grid.get(nx, ny) === color) {
          seen.add(k);
          stack.push([nx, ny]);
        }
      }
    }
  }
  return count;
}

/** Body extent along (x) and across (y) the facing-right axis, shadow excluded. */
function extent(grid: ArtGrid): { along: number; across: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of painted(grid)) {
    if (!grid.isBody(x, y)) continue;
    xs.push(x);
    ys.push(y);
  }
  return { along: Math.max(...xs) - Math.min(...xs) + 1, across: Math.max(...ys) - Math.min(...ys) + 1 };
}

const POSES: LeaperPose[] = ['walk', 'crouch', 'leap'];

describe('alien leaper sprite (the neutral cricket)', () => {
  it('bakes every frame and pose in all 16 directions on the 48×48 grid', () => {
    expect(LEAPER_FRAMES.length).toBe(WALK_FRAMES + 2);
    const pivot = spritePivot(SPRITE_GRID.cricket);
    const safe = rotationSafeRadius(SPRITE_GRID.cricket);
    for (const { frame, pose } of LEAPER_FRAMES) {
      for (let d = 0; d < DIRECTIONS; d++) {
        const grid = paintCricket({ frame, pose, direction: d });
        expect(grid.width, `${pose} f${frame} d${d}`).toBe(48);
        expect(grid.height).toBe(48);
        expect(painted(grid).length, `${pose} f${frame} d${d}`).toBeGreaterThan(300);
      }
      for (const [x, y] of painted(paintCricket({ frame, pose, direction: 0, shadow: false }))) {
        expect(Math.hypot(x + 0.5 - pivot, y + 0.5 - pivot), `${pose} f${frame} (${x},${y})`).toBeLessThanOrEqual(safe + 1e-9);
      }
    }
  });

  it('maps poses and the walk phase onto the baked frames', () => {
    expect(leaperFrameIndex('walk', 0)).toBe(0);
    expect(leaperFrameIndex('walk', Math.PI * 2 - 0.01)).toBe(3);
    expect(LEAPER_FRAMES[leaperFrameIndex('crouch', 1)].pose).toBe('crouch');
    expect(LEAPER_FRAMES[leaperFrameIndex('leap', 1)].pose).toBe('leap');
    expect(new Set(POSES.map(p => leaperFrameIndex(p, 0))).size).toBe(3);
  });

  it('keeps to the neutral cricket family with no glow', () => {
    const allowed = new Set<string>([...PAL.cricket, PAL.outline, PAL.black]);
    for (const pose of POSES) {
      for (const d of [0, 3, 8, 13]) {
        for (const [x, y, c] of painted(paintCricket({ frame: 0, pose, direction: d }))) {
          expect(allowed.has(c), `${pose} d${d} (${x},${y}) ${c}`).toBe(true);
        }
      }
    }
  });

  it('has alien traits: three eyes a side, segmented chitin plates and barbed antennae', () => {
    const grid = paintCricket({ frame: 0, direction: 0, shadow: false });
    const A = Math.floor(SPRITE_GRID.cricket / 2);
    // Eyes are the only black pixels: three separate ones on each side of the axis
    let top = 0;
    let bottom = 0;
    const eyeGrid = grid;
    const blacks = painted(eyeGrid).filter(([, , c]) => c === PAL.black);
    expect(clusters(grid, PAL.black)).toBeGreaterThanOrEqual(6);
    for (const [, y] of blacks) {
      if (y < A) top++;
      if (y > A) bottom++;
    }
    expect(top).toBeGreaterThan(0);
    expect(top).toBe(bottom);
    // Chitin plates: several dark seams cross the abdomen behind the saddle
    let seams = 0;
    for (let x = 6; x < 22; x++) {
      if (grid.get(x, A) === PAL.cricket[0] && grid.get(x, A - 1) === PAL.cricket[0]) seams++;
    }
    expect(seams).toBeGreaterThanOrEqual(3);
    // Barbed antennae reach well ahead of the head
    const ahead = painted(grid).filter(([x]) => x >= 40).length;
    expect(ahead).toBeGreaterThanOrEqual(8);
  });

  it('squashes in the crouch and stretches in the leap (Z-legs folded vs. kicked back)', () => {
    const walk = extent(paintCricket({ frame: 0, direction: 0, shadow: false }));
    const crouch = extent(paintCricket({ frame: 0, pose: 'crouch', direction: 0, shadow: false }));
    const leap = extent(paintCricket({ frame: 0, pose: 'leap', direction: 0, shadow: false }));
    expect(crouch.along).toBeLessThan(walk.along);
    expect(leap.along).toBeGreaterThan(walk.along);
    expect(leap.across).toBeLessThan(crouch.across);
  });
});
