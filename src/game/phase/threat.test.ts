import { describe, expect, it } from 'vitest';
import { THREAT, threatLevel, threatMultipliers } from './threat';

describe('the enemies evolve with the run', () => {
  it('starts at 0 on the first days with a starting colony', () => {
    expect(threatLevel({ day: 1, ants: 13, evolutions: 0, upgrades: 0 })).toBe(0);
    expect(threatLevel({ day: 2, ants: 15, evolutions: 1, upgrades: 2 })).toBe(0);
  });

  it('rises with the days, the colony\'s numbers, its evolutions and its upgrades', () => {
    const base = { day: 1, ants: 10, evolutions: 0, upgrades: 0 };
    expect(threatLevel({ ...base, day: 5 })).toBe(3);
    expect(threatLevel({ ...base, ants: 65 })).toBe(2);
    expect(threatLevel({ ...base, evolutions: 4 })).toBe(2);
    expect(threatLevel({ ...base, upgrades: 6 })).toBe(2);
    expect(threatLevel({ day: 5, ants: 65, evolutions: 4, upgrades: 6 })).toBe(9);
  });

  it('makes new enemies tougher and harder hitting, up to a cap', () => {
    expect(threatMultipliers(0)).toEqual({ health: 1, damage: 1 });
    const mid = threatMultipliers(10);
    expect(mid.health).toBeCloseTo(1.5);
    expect(mid.damage).toBeCloseTo(1.3);
    expect(threatMultipliers(500)).toEqual({ health: THREAT.maxHealthMult, damage: THREAT.maxDamageMult });
  });
});
