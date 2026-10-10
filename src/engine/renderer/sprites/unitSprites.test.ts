import { describe, expect, it } from 'vitest';
import { AntRole } from '../../../game/components/components';
import { PAL } from '../pixelart/palette';
import type { ArtGrid } from '../pixelart/ArtGrid';
import { DIRECTIONS } from '../pixelart/directions';
import { ART_PX, SPRITE_GRID, nestPixelsPerArtPixel, rotationSafeRadius, spritePivot, walkFrame } from './spriteScale';
import { paintAnt, paintQueen } from './swarmSprites';
import { paintBeetle, paintCricket } from './wildlifeSprites';

const ROLES = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender];

function paintedPixels(grid: ArtGrid): Array<[number, number, string]> {
  const out: Array<[number, number, string]> = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const c = grid.get(x, y);
      if (c) out.push([x, y, c]);
    }
  }
  return out;
}

/** Mean ramp index of the body rim lit from the top-left minus the bottom-right rim. */
function lightBalance(grid: ArtGrid, ramp: readonly string[]): number {
  const lit: number[] = [];
  const shaded: number[] = [];
  for (const [x, y, c] of paintedPixels(grid)) {
    const i = ramp.indexOf(c);
    if (i < 0 || !grid.isBody(x, y)) continue;
    if (!grid.isBody(x - 1, y) || !grid.isBody(x, y - 1)) lit.push(i);
    if (!grid.isBody(x + 1, y) || !grid.isBody(x, y + 1)) shaded.push(i);
  }
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  return mean(lit) - mean(shaded);
}

/** Every painted pixel centre lies within the radius that survives any rotation (the cast shadow may clip). */
function expectRotationSafe(grid: ArtGrid, label: string): void {
  const pivot = spritePivot(grid.width);
  const r = rotationSafeRadius(grid.width);
  for (const [x, y] of paintedPixels(grid)) {
    expect(Math.hypot(x + 0.5 - pivot, y + 0.5 - pivot), `${label} (${x},${y})`).toBeLessThanOrEqual(r + 1e-9);
  }
}

describe('one art-pixel scale', () => {
  it('draws one art pixel as 2 world px (2 screen px at zoom 1) for every sprite', () => {
    expect(ART_PX).toBe(2);
    expect(Number.isInteger(ART_PX)).toBe(true);
  });

  it('gives bigger units bigger grids instead of a bigger scale', () => {
    expect(SPRITE_GRID.ant).toBe(24);
    expect(SPRITE_GRID.beetle).toBe(28);
    expect(SPRITE_GRID.cricket).toBe(48);
    expect(SPRITE_GRID.queen).toBeGreaterThan(SPRITE_GRID.cricket);
    expect(paintAnt({ role: AntRole.Worker, frame: 0, direction: 0 }).width).toBe(24);
    expect(paintBeetle({ frame: 0, direction: 0 }).width).toBe(28);
    expect(paintCricket({ frame: 0, direction: 0 }).width).toBe(48);
    expect(paintQueen({ frame: 0, direction: 0 }).width).toBe(SPRITE_GRID.queen);
  });

  it('keeps the colony mound at 2 world px per art pixel at its game radius', () => {
    expect(nestPixelsPerArtPixel(1.2)).toBe(2);
  });

  it('maps a walk phase onto the 4 walk frames', () => {
    expect(walkFrame(0)).toBe(0);
    expect(walkFrame(Math.PI / 2 + 0.01)).toBe(1);
    expect(walkFrame(Math.PI * 2 - 0.01)).toBe(3);
    expect(walkFrame(-0.01)).toBe(3);
  });
});

describe('Swarm ants on the 24×24 grid', () => {
  it('stays inside the rotation-safe circle so no direction clips a leg or jaw', () => {
    for (const role of ROLES) {
      for (let frame = 0; frame < 4; frame++) {
        for (const carrying of [false, true]) {
          expectRotationSafe(paintAnt({ role, frame, carrying, direction: 0, shadow: false }), `${role} f${frame} c${carrying}`);
        }
      }
    }
  });

  it('keeps every caste a distinct silhouette', () => {
    const shapes = ROLES.map(role => paintedPixels(paintAnt({ role, frame: 0, direction: 0 }))
      .map(([x, y]) => `${x},${y}`).join(' '));
    expect(new Set(shapes).size).toBe(ROLES.length);
  });

  it('keeps the light on the top-left in all 16 directions (the highlight never rotates)', () => {
    for (const role of ROLES) {
      for (let d = 0; d < DIRECTIONS; d++) {
        const grid = paintAnt({ role, frame: 1, direction: d });
        expect(lightBalance(grid, PAL.swarm.flesh), `${role} dir ${d}`).toBeGreaterThan(0.3);
      }
    }
  });

  it('shows the glowing vein in every direction', () => {
    for (let d = 0; d < DIRECTIONS; d++) {
      const vein = paintedPixels(paintAnt({ role: AntRole.Worker, frame: 0, direction: d }))
        .filter(([, , c]) => c === PAL.swarm.vein[1]);
      expect(vein.length, `dir ${d}`).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('queen and wildlife grids', () => {
  it('fits every walk frame inside the rotation-safe circle', () => {
    for (let frame = 0; frame < 4; frame++) {
      expectRotationSafe(paintBeetle({ frame, direction: 0, shadow: false }), `beetle f${frame}`);
      expectRotationSafe(paintCricket({ frame, direction: 0, shadow: false }), `cricket f${frame}`);
      expectRotationSafe(paintQueen({ frame, direction: 0, swollen: true, shadow: false }), `queen f${frame}`);
    }
  });

  it('lights beetle and cricket shells from the top-left in all 16 directions', () => {
    for (let d = 0; d < DIRECTIONS; d++) {
      expect(lightBalance(paintBeetle({ frame: 0, direction: d }), PAL.beetle), `beetle dir ${d}`).toBeGreaterThan(0.3);
      expect(lightBalance(paintCricket({ frame: 0, direction: d }), PAL.cricket), `cricket dir ${d}`).toBeGreaterThan(0.3);
      expect(lightBalance(paintQueen({ frame: 0, direction: d }), PAL.swarm.flesh), `queen dir ${d}`).toBeGreaterThan(0.3);
    }
  });

  it('swells the queen sac on the breathing step', () => {
    const rest = paintedPixels(paintQueen({ frame: 0, direction: 0 })).length;
    const swollen = paintedPixels(paintQueen({ frame: 0, direction: 0, swollen: true })).length;
    expect(swollen).toBeGreaterThan(rest);
  });
});
