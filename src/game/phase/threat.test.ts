import { describe, expect, it } from 'vitest';
import { THREAT, threatLevel, threatMultipliers } from './threat';

describe('the enemies evolve with the run', () => {
  it('starts at 0 on the first days with a starting colony', () => {
    expect(threatLevel({ day: 1, ants: 13 })).toBe(0);
    expect(threatLevel({ day: 2, ants: 15 })).toBe(0);
  });

  it('rises a level every two days and with the colony\'s numbers', () => {
    const base = { day: 1, ants: 10 };
    expect(threatLevel({ ...base, day: 3 })).toBe(1);
    expect(threatLevel({ ...base, day: 4 })).toBe(1);
    expect(threatLevel({ ...base, day: 5 })).toBe(2);
    expect(threatLevel({ ...base, day: 21 })).toBe(10);
    expect(threatLevel({ ...base, ants: 65 })).toBe(2);
    expect(threatLevel({ day: 5, ants: 65 })).toBe(4);
  });

  it('makes new enemies tougher and harder hitting, up to a cap', () => {
    expect(threatMultipliers(0)).toEqual({ health: 1, damage: 1 });
    const mid = threatMultipliers(10);
    expect(mid.health).toBeCloseTo(1.5);
    expect(mid.damage).toBeCloseTo(1.3);
    expect(threatMultipliers(500)).toEqual({ health: THREAT.maxHealthMult, damage: THREAT.maxDamageMult });
  });
});
