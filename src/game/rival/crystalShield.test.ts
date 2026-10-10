import { describe, expect, it } from 'vitest';
import { absorbDamage, createShield, regenerateShield, SHIELD_REGEN_DELAY } from './crystalShield';

describe('crystal shield math', () => {
  it('takes the whole hit while it holds, and the hull takes nothing', () => {
    const shield = createShield(80, 8);
    expect(absorbDamage(shield, 18)).toEqual({ shield: 18, hull: 0 });
    expect(shield.current).toBe(62);
  });

  it('passes only the overflow to the hull when the hit breaks it', () => {
    const shield = createShield(80, 8);
    shield.current = 10;
    expect(absorbDamage(shield, 18)).toEqual({ shield: 10, hull: 8 });
    expect(shield.current).toBe(0);
  });

  it('sends every point to the hull once it is down', () => {
    const shield = createShield(80, 8);
    shield.current = 0;
    expect(absorbDamage(shield, 18)).toEqual({ shield: 0, hull: 18 });
  });

  it('ignores zero, negative and nonsense hits', () => {
    const shield = createShield(80, 8);
    expect(absorbDamage(shield, 0)).toEqual({ shield: 0, hull: 0 });
    expect(absorbDamage(shield, -5)).toEqual({ shield: 0, hull: 0 });
    expect(absorbDamage(shield, Number.NaN)).toEqual({ shield: 0, hull: 0 });
    expect(shield.current).toBe(80);
  });

  it('a hit restarts the out-of-combat clock, even on a broken shield', () => {
    const shield = createShield(80, 8);
    shield.current = 0;
    shield.sinceHit = 30;
    absorbDamage(shield, 5);
    expect(shield.sinceHit).toBe(0);
  });

  it('regenerates only after the out-of-combat delay', () => {
    const shield = createShield(80, 8);
    absorbDamage(shield, 40);
    expect(regenerateShield(shield, SHIELD_REGEN_DELAY - 0.5)).toBe(0);
    expect(shield.current).toBe(40);
    // 0.5 s more reaches the delay; the next second refills at the rate
    regenerateShield(shield, 0.5);
    expect(regenerateShield(shield, 1)).toBeCloseTo(8);
    expect(shield.current).toBeCloseTo(48);
  });

  it('never refills past its max', () => {
    const shield = createShield(80, 8);
    absorbDamage(shield, 4);
    regenerateShield(shield, SHIELD_REGEN_DELAY);
    regenerateShield(shield, 10);
    expect(shield.current).toBe(80);
  });

  it('an aura multiplies the rate and skips the delay', () => {
    const shield = createShield(80, 8);
    absorbDamage(shield, 40);
    expect(regenerateShield(shield, 1, { rateMult: 3, ignoreDelay: true })).toBeCloseTo(24);
    expect(shield.current).toBeCloseTo(64);
  });
});
