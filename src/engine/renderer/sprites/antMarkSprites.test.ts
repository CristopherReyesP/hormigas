import { describe, expect, it } from 'vitest';
import { AntRole } from '../../../game/components/components';
import type { ArtGrid } from '../pixelart/ArtGrid';
import { PAL } from '../pixelart/palette';
import { ANT_MARK_IDS, type AntMarkId } from './antMarks';
import { rotationSafeRadius, spritePivot } from './spriteScale';
import { paintAnt } from './swarmSprites';

const F = PAL.swarm.flesh;
const V = PAL.swarm.vein;
const ROLES = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender];

const marks = (entries: Array<[AntMarkId, number]>) => new Map<AntMarkId, number>(entries);
const ant = (role: AntRole, m: Array<[AntMarkId, number]> = [], direction = 0) =>
  paintAnt({ role, frame: 0, direction, marks: marks(m), shadow: false });

function pixels(grid: ArtGrid): Array<[number, number, string]> {
  const out: Array<[number, number, string]> = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const c = grid.get(x, y);
      if (c) out.push([x, y, c]);
    }
  }
  return out;
}
const count = (grid: ArtGrid, keep: (x: number, y: number, c: string) => boolean) =>
  pixels(grid).filter(([x, y, c]) => keep(x, y, c)).length;
const same = (a: ArtGrid, b: ArtGrid) => JSON.stringify(pixels(a)) === JSON.stringify(pixels(b));

describe('mutation marks on the Swarm sprites (pixel probes, facing right)', () => {
  it('acid mandibles turn the soldier scythes acid green', () => {
    expect(ant(AntRole.Soldier).get(20, 9)).toBe(F[4]);
    expect(ant(AntRole.Soldier, [['chartreuse_jaws', 1]]).get(20, 9)).toBe(V[1]);
    expect(ant(AntRole.Soldier, [['chartreuse_jaws', 1]]).get(20, 15)).toBe(V[1]); // the mirrored scythe
  });

  it('hive mind lights the antenna tips', () => {
    expect(ant(AntRole.Worker).get(21, 6)).toBe(F[2]);
    expect(ant(AntRole.Worker, [['glowing_antenna_tips', 1]]).get(21, 6)).toBe(V[1]);
    expect(ant(AntRole.Worker, [['glowing_antenna_tips', 1]]).get(21, 18)).toBe(V[1]);
  });

  it('hyper metabolism runs the glowing vein through the waist, thorax and head', () => {
    const plain = ant(AntRole.Worker);
    const marked = ant(AntRole.Worker, [['pulsing_vein', 1]]);
    for (const x of [10, 15, 17]) {
      expect(plain.get(x, 12)).not.toBe(V[1]);
      expect(marked.get(x, 12), `axis x ${x}`).toBe(V[1]);
    }
    const glow = (g: ArtGrid) => count(g, (_x, _y, c) => c === V[0] || c === V[1]);
    expect(glow(ant(AntRole.Worker, [['pulsing_vein', 3]]))).toBeGreaterThan(glow(marked));
  });

  it('bone spurs grow a pale spike on every leg', () => {
    const bone = (g: ArtGrid) => count(g, (x, y, c) => c === F[4] && !g.isSolid(x, y));
    for (const role of ROLES) {
      expect(bone(ant(role, [['leg_spurs', 1]])) - bone(ant(role)), role).toBeGreaterThanOrEqual(6);
    }
  });

  it('cargo sacs swell and pale the worker gaster only', () => {
    const plain = ant(AntRole.Worker);
    const marked = ant(AntRole.Worker, [['swollen_pale_gaster', 1]]);
    expect(count(marked, (x, y) => marked.isSolid(x, y))).toBeGreaterThan(count(plain, (x, y) => plain.isSolid(x, y)));
    expect(count(marked, (_x, _y, c) => c === F[4])).toBeGreaterThan(count(plain, (_x, _y, c) => c === F[4]) + 6);
    expect(same(ant(AntRole.Soldier), ant(AntRole.Soldier, [['swollen_pale_gaster', 1]]))).toBe(true);
  });

  it('wing stubs sprout on scouts only', () => {
    const plain = ant(AntRole.Scout);
    const marked = ant(AntRole.Scout, [['wing_stubs', 1]]);
    expect(count(marked, (x, y) => marked.isSolid(x, y))).toBeGreaterThan(count(plain, (x, y) => plain.isSolid(x, y)) + 4);
    expect(same(ant(AntRole.Worker), ant(AntRole.Worker, [['wing_stubs', 1]]))).toBe(true);
  });

  it('carrion gut rings, regenerative stitches, spore pustules and the titan plate each change the body', () => {
    const darkest = (g: ArtGrid) => count(g, (x, y, c) => c === F[0] && g.isBody(x, y));
    expect(darkest(ant(AntRole.Worker, [['dark_gaster_rings', 1]]))).toBeGreaterThan(darkest(ant(AntRole.Worker)) + 3);
    expect(same(ant(AntRole.Nurse), ant(AntRole.Nurse, [['pink_stitches', 1]]))).toBe(false);
    expect(same(ant(AntRole.Defender), ant(AntRole.Defender, [['thorax_pustules', 1]]))).toBe(false);
    const plate = (g: ArtGrid) => count(g, (x, y, c) => c === F[1] && g.isBody(x, y));
    expect(plate(ant(AntRole.Soldier, [['thick_head_plate', 1]]))).toBeGreaterThan(plate(ant(AntRole.Soldier)) + 4);
  });

  it('stacks several marks without erasing each other', () => {
    const marked = ant(AntRole.Worker, [['pulsing_vein', 1], ['leg_spurs', 1], ['glowing_antenna_tips', 1]]);
    expect(marked.get(17, 12)).toBe(V[1]);
    expect(marked.get(21, 6)).toBe(V[1]);
    const bone = (g: ArtGrid) => count(g, (x, y, c) => c === F[4] && !g.isSolid(x, y));
    expect(bone(marked) - bone(ant(AntRole.Worker, [['pulsing_vein', 1], ['glowing_antenna_tips', 1]]))).toBeGreaterThanOrEqual(6);
  });

  it('draws more of a mark at higher stacks', () => {
    for (const id of ANT_MARK_IDS) {
      const role = id === 'chartreuse_jaws' || id === 'thick_head_plate' ? AntRole.Soldier
        : id === 'wing_stubs' ? AntRole.Scout : AntRole.Worker;
      expect(same(ant(role, [[id, 1]]), ant(role, [[id, 3]])), id).toBe(false);
    }
  });

  it('keeps every fully mutated caste inside the rotation-safe circle and lit from the top-left', () => {
    const all = ANT_MARK_IDS.map(id => [id, 3] as [AntMarkId, number]);
    const pivot = spritePivot(24);
    for (const role of ROLES) {
      for (let frame = 0; frame < 4; frame++) {
        const grid = paintAnt({ role, frame, direction: 0, marks: marks(all), shadow: false });
        for (const [x, y] of pixels(grid)) {
          expect(Math.hypot(x + 0.5 - pivot, y + 0.5 - pivot), `${role} f${frame} (${x},${y})`).toBeLessThanOrEqual(rotationSafeRadius(24) + 1e-9);
        }
      }
      for (const d of [0, 5, 8, 13]) {
        const grid = ant(role, all, d);
        let lit = 0, shaded = 0, nl = 0, ns = 0;
        for (const [x, y, c] of pixels(grid)) {
          const i = F.indexOf(c as typeof F[number]);
          if (i < 0 || !grid.isBody(x, y)) continue;
          if (!grid.isBody(x - 1, y) || !grid.isBody(x, y - 1)) { lit += i; nl++; }
          if (!grid.isBody(x + 1, y) || !grid.isBody(x, y + 1)) { shaded += i; ns++; }
        }
        // mark pixels sit on the rims too, so the margin is smaller than on a plain ant
        expect(lit / nl - shaded / ns, `${role} dir ${d}`).toBeGreaterThan(0.1);
      }
    }
  });
});
