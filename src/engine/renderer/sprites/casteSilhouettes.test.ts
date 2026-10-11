// Castes inside the Swarm read by SILHOUETTE at normal zoom: the nurse is the
// slim, delicate caretaker, the defender the broad armored wall. These checks
// measure the baked frames (all 16 directions, all walk frames) so a recipe
// tweak cannot quietly bring the two back together.
import { describe, expect, it } from 'vitest';
import { AntRole } from '../../../game/components/components';
import type { ArtGrid } from '../pixelart/ArtGrid';
import { DIRECTIONS, directionAngle } from '../pixelart/directions';
import { PAL } from '../pixelart/palette';
import { WALK_FRAMES, rotationSafeRadius, spritePivot } from './spriteScale';
import { paintAnt } from './swarmSprites';

const ROLES = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender, AntRole.Bomber];

function forEachFrame(role: AntRole, visit: (grid: ArtGrid, direction: number) => void): void {
  for (let direction = 0; direction < DIRECTIONS; direction++) {
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      visit(paintAnt({ role, frame, direction, shadow: false }), direction);
    }
  }
}

/**
 * Thickest cross-section of the outlined body (gaster + waist + thorax +
 * head, legs and antennae excluded) measured across the turned body axis.
 */
function bodyThickness(grid: ArtGrid, direction: number): number {
  const pivot = spritePivot(grid.width);
  const a = directionAngle(direction);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const spans = new Map<number, [number, number]>();
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!grid.isSolid(x, y)) continue;
      const dx = x + 0.5 - pivot;
      const dy = y + 0.5 - pivot;
      const along = Math.round(dx * cos + dy * sin);
      const across = -dx * sin + dy * cos;
      const s = spans.get(along);
      spans.set(along, s ? [Math.min(s[0], across), Math.max(s[1], across)] : [across, across]);
    }
  }
  let thickest = 0;
  for (const [lo, hi] of spans.values()) thickest = Math.max(thickest, hi - lo + 1);
  return thickest;
}

function solidArea(grid: ArtGrid): number {
  let n = 0;
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) if (grid.isSolid(x, y)) n++;
  return n;
}

interface Silhouette { thickness: number; area: number; tone: number }

/** Mean body thickness, body area and flesh tone (ramp index) over every baked frame. */
function measure(role: AntRole): Silhouette {
  let thickness = 0;
  let area = 0;
  let toneSum = 0;
  let toneN = 0;
  let n = 0;
  forEachFrame(role, (grid, direction) => {
    thickness += bodyThickness(grid, direction);
    area += solidArea(grid);
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const i = (PAL.swarm.flesh as readonly string[]).indexOf(grid.get(x, y) ?? '');
        if (i >= 0 && grid.isBody(x, y)) { toneSum += i; toneN++; }
      }
    }
    n++;
  });
  return { thickness: thickness / n, area: area / n, tone: toneSum / Math.max(1, toneN) };
}

const SIL = new Map(ROLES.map(role => [role, measure(role)] as const));
const sil = (role: AntRole): Silhouette => SIL.get(role)!;
const others = (role: AntRole) => ROLES.filter(r => r !== role);

describe('Swarm caste silhouettes', () => {
  it('makes the nurse at least 25% slimmer and smaller than the defender', () => {
    const nurse = sil(AntRole.Nurse);
    const defender = sil(AntRole.Defender);
    expect(nurse.thickness).toBeLessThanOrEqual(defender.thickness * 0.75);
    expect(nurse.area).toBeLessThanOrEqual(defender.area * 0.75);
  });

  it('makes the nurse the thinnest, smallest caste', () => {
    const nurse = sil(AntRole.Nurse);
    for (const role of others(AntRole.Nurse)) {
      expect(nurse.thickness, `nurse vs ${role} thickness`).toBeLessThan(sil(role).thickness);
      expect(nurse.area, `nurse vs ${role} area`).toBeLessThan(sil(role).area);
    }
  });

  it('makes the defender the widest, heaviest non-queen caste', () => {
    const defender = sil(AntRole.Defender);
    for (const role of others(AntRole.Defender)) {
      expect(defender.thickness, `defender vs ${role} thickness`).toBeGreaterThan(sil(role).thickness);
      expect(defender.area, `defender vs ${role} area`).toBeGreaterThan(sil(role).area);
    }
  });

  it('gives every pair of castes a clearly different body profile', () => {
    // Body thickness per column along the axis (facing right): where the bulk
    // sits (big head, long gaster, plated shield) is the silhouette.
    const profile = (role: AntRole): number[] => {
      const grid = paintAnt({ role, frame: 0, direction: 0, shadow: false });
      const cols: number[] = [];
      for (let x = 0; x < grid.width; x++) {
        let n = 0;
        for (let y = 0; y < grid.height; y++) if (grid.isSolid(x, y)) n++;
        cols.push(n);
      }
      return cols;
    };
    for (const a of ROLES) {
      for (const b of ROLES) {
        if (a >= b) continue;
        const pa = profile(a);
        const pb = profile(b);
        const diff = pa.reduce((sum, v, i) => sum + Math.abs(v - pb[i]), 0);
        expect(diff, `${a} vs ${b}`).toBeGreaterThanOrEqual(16);
      }
    }
  });

  it('keeps the nurse the palest caste and the armored defender the darkest', () => {
    for (const role of others(AntRole.Nurse)) expect(sil(AntRole.Nurse).tone, role).toBeGreaterThan(sil(role).tone);
    for (const role of others(AntRole.Defender)) expect(sil(AntRole.Defender).tone, role).toBeLessThan(sil(role).tone);
  });

  // Authored within the safe radius, a pixel centre lands at most half a pixel
  // diagonal (√2/2) further out once the pen re-rasterizes it in a turned frame,
  // which still stays on the grid: nothing is clipped.
  it('keeps every caste inside the rotation-safe circle in all 16 directions', () => {
    for (const role of ROLES) {
      for (const carrying of [false, true]) {
        for (let direction = 0; direction < DIRECTIONS; direction++) {
          for (let frame = 0; frame < WALK_FRAMES; frame++) {
            const grid = paintAnt({ role, frame, direction, carrying, shadow: false });
            const pivot = spritePivot(grid.width);
            const r = rotationSafeRadius(grid.width) + Math.SQRT1_2;
            let painted = 0;
            let farthest = 0;
            for (let y = 0; y < grid.height; y++) {
              for (let x = 0; x < grid.width; x++) {
                if (!grid.get(x, y)) continue;
                painted++;
                farthest = Math.max(farthest, Math.hypot(x + 0.5 - pivot, y + 0.5 - pivot));
              }
            }
            expect(painted, `${role} d${direction} f${frame}`).toBeGreaterThan(0);
            expect(farthest, `${role} d${direction} f${frame} carrying=${carrying}`).toBeLessThanOrEqual(r + 1e-9);
          }
        }
      }
    }
  });

  it('paints every caste only in the shared Swarm palette (plus the carried leaf)', () => {
    const allowed = new Set<string>([...PAL.swarm.flesh, ...PAL.swarm.vein, PAL.swarm.outline, ...PAL.leaf]);
    for (const role of ROLES) {
      for (const carrying of [false, true]) {
        for (let direction = 0; direction < DIRECTIONS; direction++) {
          const grid = paintAnt({ role, frame: 0, direction, carrying });
          const colors = new Set<string>();
          for (let y = 0; y < grid.height; y++) {
            for (let x = 0; x < grid.width; x++) {
              const c = grid.get(x, y);
              if (c) colors.add(c);
            }
          }
          for (const c of colors) expect(allowed.has(c), `${role} d${direction} ${c}`).toBe(true);
          if (!carrying) for (const c of PAL.leaf) expect(colors.has(c), `${role} d${direction} leaf`).toBe(false);
        }
      }
    }
  });
});
