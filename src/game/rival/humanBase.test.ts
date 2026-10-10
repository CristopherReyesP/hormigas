import { describe, expect, it } from 'vitest';
import {
  HUMAN_BUILD_ORDER,
  HUMAN_BUILDING_STATS,
  HUMAN_UNIT_STATS,
  armoredDamage,
  humanIncome,
  humanRaidSize,
  humanSupplyCap,
  humanWaveSquad,
  nextBuildStep,
  pickBuildSlot,
  pickTrainee,
  pickTurretTarget,
} from './humanBase';
import { pickHumanBaseSite } from './humanSite';
import { waveComposition } from '../run/waveComposition';
import { createSeededRng } from '../run/MutationOffers';

describe('armor', () => {
  it('takes the armor off every hit', () => {
    expect(armoredDamage(8, 1)).toBe(7);
    expect(armoredDamage(30, 3)).toBe(27);
  });

  it('never lets a hit drop below 1 damage', () => {
    expect(armoredDamage(1, 1)).toBe(1);
    expect(armoredDamage(2, 5)).toBe(1);
    expect(armoredDamage(0.5, 2)).toBe(1);
  });

  it('leaves unarmored targets and harmless hits alone', () => {
    expect(armoredDamage(8, 0)).toBe(8);
    expect(armoredDamage(0.5, 0)).toBe(0.5);
    expect(armoredDamage(0, 3)).toBe(0);
  });
});

describe('Human unit stats', () => {
  it('match the tier-1 table: the soldier costs 70, has 160 HP, armor 1, 6 per 0.8 s at range 5', () => {
    expect(HUMAN_UNIT_STATS.soldier).toMatchObject({ cost: 70, health: 160, armor: 1, damage: 6, attackCooldown: 0.8, attackRange: 5 });
  });

  it('the marksman outranges the soldier but is more fragile', () => {
    expect(HUMAN_UNIT_STATS.marksman.attackRange).toBeGreaterThan(HUMAN_UNIT_STATS.soldier.attackRange);
    expect(HUMAN_UNIT_STATS.marksman.health).toBeLessThan(HUMAN_UNIT_STATS.soldier.health);
  });

  it('the tank is heavy, slow, splashes and waits for night 5', () => {
    const { tank, soldier } = HUMAN_UNIT_STATS;
    expect(tank.health).toBeGreaterThan(soldier.health * 2);
    expect(tank.armor).toBeGreaterThan(soldier.armor);
    expect(tank.speed).toBeLessThan(soldier.speed);
    expect(tank.splashRadius).toBeGreaterThan(0);
    expect(tank.minNight).toBe(5);
  });

  it('every building has health and armor; only the bunker shoots', () => {
    for (const stats of Object.values(HUMAN_BUILDING_STATS)) {
      expect(stats.health).toBeGreaterThan(0);
      expect(stats.armor).toBeGreaterThanOrEqual(1);
    }
    expect(HUMAN_BUILDING_STATS.bunker.damage).toBeGreaterThan(0);
    expect(HUMAN_BUILDING_STATS.barracks.damage).toBe(0);
  });
});

describe('the build order', () => {
  it('is a fixed script: the same built count and night always give the same step', () => {
    for (let night = 1; night <= 8; night++) {
      for (let built = 0; built <= HUMAN_BUILD_ORDER.length; built++) {
        expect(nextBuildStep(built, night)).toEqual(nextBuildStep(built, night));
      }
    }
  });

  it('unlocks more of the script as the nights go by', () => {
    const unlocked = (night: number) => {
      let built = 0;
      while (nextBuildStep(built, night) !== null) built++;
      return built;
    };
    const counts = [1, 2, 3, 4, 5, 6, 7].map(unlocked);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[6]).toBe(HUMAN_BUILD_ORDER.length);
    expect(counts[6]).toBeGreaterThan(counts[0]);
  });

  it('stops at the end of the script', () => {
    expect(nextBuildStep(HUMAN_BUILD_ORDER.length, 99)).toBeNull();
  });

  it('places bunkers toward the enemy nest and the rest behind the command center', () => {
    const base = { x: 100, y: 45 };
    const nest = { x: 60, y: 45 };
    const open = () => true;
    const bunker = pickBuildSlot('bunker', base, nest, [], open)!;
    const depot = pickBuildSlot('supply_depot', base, nest, [], open)!;
    expect(bunker.x).toBeLessThan(base.x);
    expect(depot.x).toBeGreaterThanOrEqual(base.x);
    expect(pickBuildSlot('bunker', base, nest, [], open)).toEqual(bunker);
  });

  it('never reuses a taken slot and skips unwalkable ones', () => {
    const base = { x: 100, y: 45 };
    const nest = { x: 60, y: 45 };
    const first = pickBuildSlot('bunker', base, nest, [], () => true)!;
    const second = pickBuildSlot('bunker', base, nest, [first], () => true)!;
    expect(second).not.toEqual(first);
    const blocked = pickBuildSlot('bunker', base, nest, [], (x, y) => !(x === first.x && y === first.y))!;
    expect(blocked).not.toEqual(first);
  });
});

describe('economy and production', () => {
  it('passive rations grow with every supply depot, and so does the supply cap', () => {
    expect(humanIncome(1)).toBeGreaterThan(humanIncome(0));
    expect(humanSupplyCap(2)).toBeGreaterThan(humanSupplyCap(1));
  });

  it('trains soldiers first, marksmen from night 2 and tanks from night 5', () => {
    const batch = (night: number) => Array.from({ length: 12 }, (_, i) => pickTrainee(night, i));
    expect(new Set(batch(1))).toEqual(new Set(['soldier']));
    expect(batch(2)).toContain('marksman');
    expect(batch(4)).not.toContain('tank');
    expect(batch(5)).toContain('tank');
  });
});

describe('night waves from the human base', () => {
  it('humans join from the first wave and grow with the night', () => {
    const sizes = [1, 2, 3, 4, 5, 6, 7].map((n) => waveComposition(n, 'human').drones);
    expect(sizes[0]).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
    expect(sizes[6]).toBeGreaterThan(sizes[0]);
  });

  it('keeps every wave total intact', () => {
    for (let n = 1; n <= 12; n++) {
      const w = waveComposition(n, 'human');
      expect(w.youngBeetles + w.beetles + w.drones + (w.boss ? 1 : 0)).toBe(w.total);
      expect(w.total).toBe(waveComposition(n).total);
    }
  });

  it('leaves the Crystal mix unchanged by default', () => {
    for (let n = 1; n <= 10; n++) expect(waveComposition(n, 'crystal')).toEqual(waveComposition(n));
  });

  it('a squad mixes in marksmen from night 2 and tanks from night 5', () => {
    expect(humanWaveSquad(1, 3)).toEqual(['soldier', 'soldier', 'soldier']);
    expect(humanWaveSquad(3, 6)).toContain('marksman');
    expect(humanWaveSquad(4, 12)).not.toContain('tank');
    const late = humanWaveSquad(6, 12);
    expect(late).toContain('tank');
    expect(late).toHaveLength(12);
  });

  it('day raids are small and start on day 2', () => {
    expect(humanRaidSize(1)).toBe(0);
    expect(humanRaidSize(2)).toBeGreaterThan(0);
    expect(humanRaidSize(6)).toBeGreaterThanOrEqual(humanRaidSize(2));
  });
});

describe('turret targeting', () => {
  const turret = { x: 10, y: 10 };

  it('shoots the nearest enemy in range', () => {
    const target = pickTurretTarget(turret, 6, [
      { id: 1, x: 15, y: 10 },
      { id: 2, x: 13, y: 10 },
    ], null);
    expect(target).toBe(2);
  });

  it('ignores enemies out of range', () => {
    expect(pickTurretTarget(turret, 6, [{ id: 3, x: 17, y: 10 }], null)).toBeNull();
  });

  it('keeps its current target while it stays in range', () => {
    const candidates = [{ id: 1, x: 15, y: 10 }, { id: 2, x: 12, y: 10 }];
    expect(pickTurretTarget(turret, 6, candidates, 1)).toBe(1);
    expect(pickTurretTarget(turret, 4, candidates, 1)).toBe(2);
  });
});

describe('the human base site', () => {
  const W = 120;
  const H = 90;
  const nest = { x: 60, y: 45 };
  const crater = { x: 110, y: 80 };
  const input = (seed: number) => ({
    width: W,
    height: H,
    nest,
    isWalkable: (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H,
    rng: createSeededRng(seed),
    clearRadius: 4,
    edgeMargin: 6,
    farFraction: 0.7,
    avoid: crater,
    avoidDistance: 30,
  });

  it('is the same for the same seed', () => {
    expect(pickHumanBaseSite(input(7))).toEqual(pickHumanBaseSite(input(7)));
  });

  it('sits on the far side, away from the nest and the crater', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const site = pickHumanBaseSite(input(seed));
      expect(Math.hypot(site.x - nest.x, site.y - nest.y)).toBeGreaterThan(30);
      expect(Math.hypot(site.x - crater.x, site.y - crater.y)).toBeGreaterThanOrEqual(30);
    }
  });
});
