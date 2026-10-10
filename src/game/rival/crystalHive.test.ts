import { describe, expect, it } from 'vitest';
import {
  CRYSTAL_DRONE_STATS,
  CRYSTAL_HIVE_STATS,
  crystalWaveSize,
  planCrystalWave,
  stepHiveProduction,
} from './crystalHive';

describe('crystal wave size by night', () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
    [6, 6],
    [7, 8],
  ])('night %i sends %i drones', (night, size) => {
    expect(crystalWaveSize(night)).toBe(size);
  });

  it('keeps the night-7 size after the last scripted night', () => {
    expect(crystalWaveSize(8)).toBe(8);
    expect(crystalWaveSize(12)).toBe(8);
  });

  it('sends nothing before the first night or for nonsense input', () => {
    expect(crystalWaveSize(0)).toBe(0);
    expect(crystalWaveSize(-3)).toBe(0);
    expect(crystalWaveSize(Number.NaN)).toBe(0);
  });
});

describe('hive production timing', () => {
  it('crystallizes one drone each interval while the garrison has room', () => {
    let timer: number = CRYSTAL_HIVE_STATS.productionInterval;
    let spawned = 0;
    // Three full intervals plus a little slack, ticked at 60 Hz
    const ticks = Math.round(CRYSTAL_HIVE_STATS.productionInterval * 3 * 60) + 5;
    for (let i = 0; i < ticks; i++) {
      const step = stepHiveProduction(timer, 1 / 60, 0, CRYSTAL_HIVE_STATS.garrisonCap);
      timer = step.timer;
      if (step.spawn) spawned++;
    }
    expect(spawned).toBe(3);
  });

  it('holds the timer at zero while the garrison is full, then spawns as soon as there is room', () => {
    const cap = CRYSTAL_HIVE_STATS.garrisonCap;
    const full = stepHiveProduction(0.5, 1, cap, cap);
    expect(full).toEqual({ timer: 0, spawn: false });
    const room = stepHiveProduction(full.timer, 1 / 60, cap - 1, cap);
    expect(room.spawn).toBe(true);
    expect(room.timer).toBe(CRYSTAL_HIVE_STATS.productionInterval);
  });

  it('is a pure function of its inputs', () => {
    expect(stepHiveProduction(10, 2, 1, 4)).toEqual(stepHiveProduction(10, 2, 1, 4));
    expect(stepHiveProduction(10, 2, 1, 4)).toEqual({ timer: 8, spawn: false });
  });
});

describe('planning a crystal wave', () => {
  it('sends the garrison drones first, in the order given, and crystallizes the rest', () => {
    expect(planCrystalWave(3, [7, 9])).toEqual({ sent: [7, 9], crystallize: 1 });
  });

  it('leaves surplus garrison drones home', () => {
    expect(planCrystalWave(1, [4, 5, 6])).toEqual({ sent: [4], crystallize: 0 });
  });

  it('sends nothing on a night with no wave', () => {
    expect(planCrystalWave(0, [1, 2])).toEqual({ sent: [], crystallize: 0 });
  });
});

describe('crystal drone stats (P4 tier-1 table)', () => {
  it('has 220 HP and hits for 18 every 1.5 s in melee', () => {
    expect(CRYSTAL_DRONE_STATS.health).toBe(220);
    expect(CRYSTAL_DRONE_STATS.damage).toBe(18);
    expect(CRYSTAL_DRONE_STATS.attackCooldown).toBe(1.5);
    expect(CRYSTAL_DRONE_STATS.attackRange).toBeLessThanOrEqual(1.5);
  });
});
