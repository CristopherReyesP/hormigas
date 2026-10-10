// Night-wave composition by wave number: pure rules, no World, no randomness.
// UndergroundInvasionSystem spawns what this returns; the HUD announces it.

/** A wave never sends more units than this (performance); past it, units get stronger instead */
export const WAVE_MAX_UNITS = 50;

/** Young beetles (the early-wave grunts) keep this share of a full beetle's stats */
export const YOUNG_BEETLE_SCALE = { health: 0.45, damage: 0.5 } as const;

/** An elite's affix (eliteAffixes.ts gives each one its name, icon and behaviour) */
export type EliteAffix = 'explosive' | 'healer' | 'armored' | 'swift' | 'furious';

/** The order elites take their affix in: Blindado first, the trickier ones later */
export const ELITE_AFFIX_ORDER: readonly EliteAffix[] = ['armored', 'swift', 'furious', 'healer', 'explosive'];

/** A rival's mini-boss (miniBoss.ts): the Acorazado Colosal, the Prisma Guardián, the Coronel en Tanque Pesado */
export type MiniBossKind = 'colossus' | 'prism' | 'colonel';

/** A mini-boss leads every this many waves (3, 6, 9, ...) */
export const MINI_BOSS_EVERY = 3;

/** The plain units a mini-boss replaces in its wave, so the wave stays about as hard */
const BOSS_UNIT_WEIGHT = 3;
/** Every third elite replaces one plain unit (an elite is roughly 1.3-1.5 plain units) */
const ELITE_TRIM_RATIO = 3;

/** Which kind of wave unit an elite is */
export type WaveUnitKind = 'young' | 'beetle' | 'drone';

export interface WaveElite {
  unit: WaveUnitKind;
  affix: EliteAffix;
}

export interface WaveComposition {
  wave: number;
  /** Every enemy the wave sends: youngBeetles + beetles + drones, plus the mini-boss */
  total: number;
  /** Weak beetles that break into the nest: the bulk of the first waves */
  youngBeetles: number;
  /** Full-strength beetles that break into the nest */
  beetles: number;
  /**
   * Raiders the rival base sends at the nest on the surface: Crystal drones
   * from wave 3, or Human troops from wave 1 (see WaveRival)
   */
  drones: number;
  /** Health and damage multiplier for every unit; above 1 only once the count is capped */
  statScale: number;
  /**
   * The units that come as elites. Per kind, the first `count(unit)` units the
   * wave sends of that kind take these affixes, in order. Never more than the
   * wave sends of that kind.
   */
  elites: WaveElite[];
  /** The rival's mini-boss leading the wave (every MINI_BOSS_EVERY waves), else null */
  boss: MiniBossKind | null;
}

const EMPTY: Omit<WaveComposition, 'wave'> = { total: 0, youngBeetles: 0, beetles: 0, drones: 0, statScale: 1, elites: [], boss: null };

/** The uncapped size: 3 on wave 1, then a linear plus quadratic rise (5, 8, 12, 17, 23, 30, ...) */
function rawSize(wave: number): number {
  const k = wave - 1;
  return Math.round(3 + 1.5 * k + 0.5 * k * k);
}

/**
 * The rival of the run. Crystal and Human bases send the surface share of
 * each wave; against the wildlife (Fauna salvaje) every unit is a beetle.
 */
export type WaveRival = 'wildlife' | 'crystal' | 'human';

const BOSS_OF: Record<WaveRival, MiniBossKind> = { wildlife: 'colossus', crystal: 'prism', human: 'colonel' };

/** The mini-boss of wave `wave` against `rival`: every third wave, themed by the rival */
export function miniBossFor(wave: number, rival: WaveRival): MiniBossKind | null {
  if (!Number.isFinite(wave) || wave < MINI_BOSS_EVERY) return null;
  return Math.floor(wave) % MINI_BOSS_EVERY === 0 ? BOSS_OF[rival] : null;
}

/** The share of wave `wave` that comes as elites: none before wave 3, then 10% rising 5 points a wave to 35% */
export function eliteShare(wave: number): number {
  if (!Number.isFinite(wave) || wave < 3) return 0;
  return Math.min(0.35, 0.1 + 0.05 * (Math.floor(wave) - 3));
}

/** Human troops in wave `n` out of `total`: at least 2, then a quarter rising to 40% of the wave */
function humanRaiders(n: number, total: number): number {
  return Math.min(total, Math.max(2, Math.floor(total * Math.min(0.4, 0.25 + 0.05 * (n - 1)))));
}

/**
 * Which units of the wave are elites: the raiders get their share, beetles
 * the rest (young ones only when there are not enough full ones). Affixes
 * rotate through ELITE_AFFIX_ORDER, starting one step further each wave.
 */
function pickElites(n: number, count: number, parts: { young: number; beetles: number; drones: number }): WaveElite[] {
  if (count <= 0) return [];
  const full = parts.beetles + parts.drones;
  let drones = full > 0 ? Math.min(parts.drones, Math.round((count * parts.drones) / full)) : 0;
  const beetles = Math.min(parts.beetles, count - drones);
  drones = Math.min(parts.drones, count - beetles);
  const young = Math.min(parts.young, count - beetles - drones);
  const units: WaveUnitKind[] = [];
  // Interleave the kinds so a small elite count still mixes affixes across them
  for (let i = 0; units.length < beetles + drones + young; i++) {
    if (i < beetles) units.push('beetle');
    if (i < drones) units.push('drone');
    if (i < young) units.push('young');
  }
  return units.map((unit, i) => ({ unit, affix: ELITE_AFFIX_ORDER[(n - 3 + i) % ELITE_AFFIX_ORDER.length] }));
}

/**
 * What wave `wave` (1-based) sends.
 * - Size: the old curve 3, 5, 8, 12, 17, 23, 30, 38, 47, then capped at
 *   WAVE_MAX_UNITS, minus the plain units elites and the boss replace (every
 *   third elite stands for one, the mini-boss for three). So the totals, the
 *   boss counted in, are 3, 5, 6, 12, 16, 20, 27, 34, 40, 45.
 * - Past the cap, every unit gets +50% of the overflow ratio in health and damage
 *   (wave 10: x1.07, wave 11: x1.18), so the waves keep rising without more units.
 * - Mix: young beetles fade out by wave 6 (100%, 80%, 60%, ... of the wave);
 *   crystal drones join on wave 3 and grow to 30% of the wave; full beetles are the rest.
 * - Against the Humans (`rival` 'human') the base's troops join from wave 1
 *   (at least 2, a quarter rising to 40%) and the young beetles make room for them.
 * - Against the wildlife there are no raiders: beetles fill the drones' share.
 * - Elites from wave 3 (eliteShare), a mini-boss every third wave (miniBossFor).
 */
export function waveComposition(wave: number, rival: WaveRival = 'crystal'): WaveComposition {
  if (!Number.isFinite(wave) || wave < 1) return { wave: 0, ...EMPTY };
  const n = Math.floor(wave);
  const raw = rawSize(n);
  const base = Math.min(raw, WAVE_MAX_UNITS);
  const statScale = raw > WAVE_MAX_UNITS ? Math.round((1 + (0.5 * (raw - WAVE_MAX_UNITS)) / WAVE_MAX_UNITS) * 100) / 100 : 1;
  const boss = miniBossFor(n, rival);
  const eliteCount = n >= 3 ? Math.max(1, Math.floor(base * eliteShare(n))) : 0;
  const units = Math.max(1, base - Math.floor(eliteCount / ELITE_TRIM_RATIO) - (boss ? BOSS_UNIT_WEIGHT : 0));
  const total = units + (boss ? 1 : 0);
  const youngShare = Math.floor(units * Math.max(0, 1 - 0.2 * (n - 1)));
  let young: number;
  let drones: number;
  if (rival === 'human') {
    drones = humanRaiders(n, units);
    young = Math.min(youngShare, units - drones);
  } else {
    young = youngShare;
    drones = rival === 'crystal' && n >= 3
      ? Math.min(units - young, Math.max(1, Math.floor(units * Math.min(0.3, 0.1 * (n - 2)))))
      : 0;
  }
  const beetles = units - young - drones;
  const elites = pickElites(n, Math.min(eliteCount, units), { young, beetles, drones });
  return { wave: n, total, youngBeetles: young, beetles, drones, statScale, elites, boss };
}
