// The Crystal Hive's regenerating shell, pure rules: a shield soaks hits
// before the hull (HealthComponent), and refills once the unit has been out
// of combat for a while. CombatSystem calls absorbDamage on every landed hit;
// CrystalShieldSystem calls regenerateShield every tick.

/** Seconds without a hit before a shield starts to refill (StarCraft's Protoss wait). */
export const SHIELD_REGEN_DELAY = 4;

/** A regenerating shield on top of health. Stored under COMPONENT.SHIELD. */
export interface ShieldComponent {
  current: number;
  max: number;
  /** Points per second once regenerating */
  regenRate: number;
  /** Seconds without a hit before it refills */
  regenDelay: number;
  /** Seconds since the last hit (drives the delay and the hit flash) */
  sinceHit: number;
}

export function createShield(max: number, regenRate: number, regenDelay: number = SHIELD_REGEN_DELAY): ShieldComponent {
  return { current: max, max, regenRate, regenDelay, sinceHit: Number.POSITIVE_INFINITY };
}

export interface DamageSplit {
  /** Points the shield soaked */
  shield: number;
  /** Points left for the hull */
  hull: number;
}

/**
 * Land `damage` on a shielded entity: the shield takes all it can, and only
 * the overflow reaches the hull. Any real hit restarts the out-of-combat clock.
 */
export function absorbDamage(shield: ShieldComponent, damage: number): DamageSplit {
  if (!(damage > 0)) return { shield: 0, hull: 0 };
  shield.sinceHit = 0;
  const soaked = Math.min(Math.max(0, shield.current), damage);
  shield.current -= soaked;
  return { shield: soaked, hull: damage - soaked };
}

export interface RegenOptions {
  /** Multiplies the refill rate (the Crystal Queen's aura) */
  rateMult?: number;
  /** Refill even while in combat (the Crystal Queen's aura) */
  ignoreDelay?: boolean;
}

/** Advance the clock by `dt` and refill when allowed; returns the points regained. */
export function regenerateShield(shield: ShieldComponent, dt: number, options: RegenOptions = {}): number {
  if (!(dt > 0)) return 0;
  shield.sinceHit += dt;
  if (shield.current >= shield.max) return 0;
  // Only the part of this step past the delay refills
  const time = options.ignoreDelay ? dt : Math.min(dt, shield.sinceHit - shield.regenDelay);
  if (time <= 0) return 0;
  const gain = Math.min(shield.max - shield.current, shield.regenRate * (options.rateMult ?? 1) * time);
  shield.current += gain;
  return gain;
}
