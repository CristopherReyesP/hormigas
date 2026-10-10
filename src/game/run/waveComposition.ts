// Night-wave composition by wave number: pure rules, no World, no randomness.
// UndergroundInvasionSystem spawns what this returns; the HUD announces its total.

/** A wave never sends more units than this (performance); past it, units get stronger instead */
export const WAVE_MAX_UNITS = 50;

/** Young beetles (the early-wave grunts) keep this share of a full beetle's stats */
export const YOUNG_BEETLE_SCALE = { health: 0.45, damage: 0.5 } as const;

export interface WaveComposition {
  wave: number;
  /** Every unit the wave sends: youngBeetles + beetles + drones */
  total: number;
  /** Weak beetles that break into the nest: the bulk of the first waves */
  youngBeetles: number;
  /** Full-strength beetles that break into the nest */
  beetles: number;
  /** Crystal drones the Crystal Hive sends at the nest on the surface (from wave 3) */
  drones: number;
  /** Health and damage multiplier for every unit; above 1 only once the count is capped */
  statScale: number;
}

const EMPTY: Omit<WaveComposition, 'wave'> = { total: 0, youngBeetles: 0, beetles: 0, drones: 0, statScale: 1 };

/** The uncapped size: 3 on wave 1, then a linear plus quadratic rise (5, 8, 12, 17, 23, 30, ...) */
function rawSize(wave: number): number {
  const k = wave - 1;
  return Math.round(3 + 1.5 * k + 0.5 * k * k);
}

/**
 * What wave `wave` (1-based) sends.
 * - Size: 3, 5, 8, 12, 17, 23, 30, 38, 47, then capped at WAVE_MAX_UNITS.
 * - Past the cap, every unit gets +50% of the overflow ratio in health and damage
 *   (wave 10: x1.07, wave 11: x1.18), so the waves keep rising without more units.
 * - Mix: young beetles fade out by wave 6 (100%, 80%, 60%, ... of the wave);
 *   crystal drones join on wave 3 and grow to 30% of the wave; full beetles are the rest.
 */
export function waveComposition(wave: number): WaveComposition {
  if (!Number.isFinite(wave) || wave < 1) return { wave: 0, ...EMPTY };
  const n = Math.floor(wave);
  const raw = rawSize(n);
  const total = Math.min(raw, WAVE_MAX_UNITS);
  const statScale = raw > WAVE_MAX_UNITS ? Math.round((1 + (0.5 * (raw - WAVE_MAX_UNITS)) / WAVE_MAX_UNITS) * 100) / 100 : 1;
  const youngBeetles = Math.floor(total * Math.max(0, 1 - 0.2 * (n - 1)));
  const drones = n >= 3 ? Math.min(total - youngBeetles, Math.max(1, Math.floor(total * Math.min(0.3, 0.1 * (n - 2))))) : 0;
  return { wave: n, total, youngBeetles, beetles: total - youngBeetles - drones, drones, statScale };
}
