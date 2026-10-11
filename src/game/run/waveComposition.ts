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

/**
 * The size curve: `base` units on wave 1, then a linear plus quadratic rise.
 * Past WAVE_MAX_UNITS the overflow turns into health and damage: every unit
 * gets `overflowScale` times the overflow ratio on top (see waveComposition).
 * Balance pass (headless runs, src/balance): the quadratic term was 0.5 and
 * the overflow 0.5. The waves outgrew a sensible Human or Crystal base by
 * nights 7-9 while a sensible Swarm still stood untouched at night 25, so the
 * middle of the curve is gentler and the endless part past the cap steeper.
 */
// Difficulty pass: was { base: 3, linear: 1.5, quadratic: 0.4 }
export const WAVE_CURVE = { base: 3, linear: 1.8, quadratic: 0.5, overflowScale: 1 } as const;

/** The uncapped size: 3 on wave 1, then a linear plus quadratic rise (5, 8, 11, 15, 21, 26, 33, 41, 49, ...) */
function rawSize(wave: number): number {
  const k = wave - 1;
  return Math.round(WAVE_CURVE.base + WAVE_CURVE.linear * k + WAVE_CURVE.quadratic * k * k);
}

/**
 * The rival of the run. Crystal and Human bases send the surface share of
 * each wave; against the wildlife (Fauna salvaje) every unit is a beetle.
 */
/** 'legion': Phase 2's Legionary nest, which sends its army ants with every wave */
export type WaveRival = 'wildlife' | 'crystal' | 'human' | 'legion';

/** What the scouting card calls the rival's raiders */
export function raiderGroupLabel(rival: WaveRival): string {
  if (rival === 'human') return 'Tropas humanas';
  if (rival === 'legion') return 'Hormigas legionarias';
  return 'Drones de cristal';
}

const BOSS_OF: Record<WaveRival, MiniBossKind> = { wildlife: 'colossus', crystal: 'prism', human: 'colonel', legion: 'colossus' };

/** The mini-boss of wave `wave` against `rival`: every third wave, themed by the rival */
export function miniBossFor(wave: number, rival: WaveRival): MiniBossKind | null {
  if (!Number.isFinite(wave) || wave < MINI_BOSS_EVERY) return null;
  return Math.floor(wave) % MINI_BOSS_EVERY === 0 ? BOSS_OF[rival] : null;
}

/**
 * The elite share: none before wave `from`, then `start` rising `step` a wave
 * up to `max`. Balance pass: the step was 0.05 (35% by wave 8); elites piled
 * onto the fast middle of the curve and decided most Human and Crystal runs
 * by night 9-11. Now the share tops out around wave 11.
 */
// Difficulty pass: was 10% rising 3 points a wave to 35%
export const ELITE_SHARE = { from: 3, start: 0.15, step: 0.04, max: 0.45 } as const;

/** The share of wave `wave` that comes as elites (ELITE_SHARE): none before wave 3, then 10% rising 3 points a wave to 35% */
export function eliteShare(wave: number): number {
  if (!Number.isFinite(wave) || wave < ELITE_SHARE.from) return 0;
  return Math.min(ELITE_SHARE.max, ELITE_SHARE.start + ELITE_SHARE.step * (Math.floor(wave) - ELITE_SHARE.from));
}

/**
 * The Human base's share of a wave: `start` of it on wave 1, `step` more each
 * wave, up to `max`, and never fewer than `min` troops. Balance pass: it was
 * 25% rising 5 points a wave to 40%; troops with guns outrange the Crystal
 * Hive's drones and come in full (only beetles are halved against it), so the
 * Hive fell by night 6-7 to the raid alone.
 */
// Difficulty pass: was 20% rising to 30%
export const HUMAN_RAID_SHARE = { start: 0.25, step: 0.03, max: 0.35, min: 2 } as const;

/** Phase 2: the Legionary nest's share of each wave (its army ants), and the fewest it sends */
export const LEGION_RAID_SHARE = { share: 0.45, min: 4 } as const;

/** Human troops in wave `n` out of `total` (HUMAN_RAID_SHARE) */
function humanRaiders(n: number, total: number): number {
  const share = Math.min(HUMAN_RAID_SHARE.max, HUMAN_RAID_SHARE.start + HUMAN_RAID_SHARE.step * (n - 1));
  return Math.min(total, Math.max(HUMAN_RAID_SHARE.min, Math.floor(total * share)));
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
 * - Size: the curve 3, 5, 8, 11, 15, 21, 26, 33, 41, 49 (WAVE_CURVE), then capped at
 *   WAVE_MAX_UNITS, minus the plain units elites and the boss replace (every
 *   third elite stands for one, the mini-boss for three). So the totals, the
 *   boss counted in, are 3, 5, 6, 11, 15, 18, 25, 31, 36, 44.
 * - Past the cap, every unit gets the overflow ratio in health and damage
 *   (WAVE_CURVE.overflowScale; wave 11: x1.16, wave 15: x2.04, wave 20: x3.52),
 *   so the waves keep rising without more units.
 * - Mix: young beetles fade out by wave 6 (100%, 80%, 60%, ... of the wave);
 *   crystal drones join on wave 3 and grow to 30% of the wave; full beetles are the rest.
 * - Against the Humans (`rival` 'human') the base's troops join from wave 1
 *   (HUMAN_RAID_SHARE: at least 2, a fifth rising to 30%) and the young beetles make room for them.
 * - Against the wildlife there are no raiders: beetles fill the drones' share.
 * - Elites from wave 3 (eliteShare), a mini-boss every third wave (miniBossFor).
 */
export function waveComposition(wave: number, rival: WaveRival = 'crystal'): WaveComposition {
  if (!Number.isFinite(wave) || wave < 1) return { wave: 0, ...EMPTY };
  const n = Math.floor(wave);
  const raw = rawSize(n);
  const base = Math.min(raw, WAVE_MAX_UNITS);
  const statScale = raw > WAVE_MAX_UNITS ? Math.round((1 + (WAVE_CURVE.overflowScale * (raw - WAVE_MAX_UNITS)) / WAVE_MAX_UNITS) * 100) / 100 : 1;
  const boss = miniBossFor(n, rival);
  const eliteCount = n >= 3 ? Math.max(1, Math.floor(base * eliteShare(n))) : 0;
  const units = Math.max(1, base - Math.floor(eliteCount / ELITE_TRIM_RATIO) - (boss ? BOSS_UNIT_WEIGHT : 0));
  const total = units + (boss ? 1 : 0);
  // Young beetles fade out by wave 5 (difficulty pass: was by wave 6)
  const youngShare = Math.floor(units * Math.max(0, 1 - 0.25 * (n - 1)));
  let young: number;
  let drones: number;
  if (rival === 'human') {
    drones = humanRaiders(n, units);
    young = Math.min(youngShare, units - drones);
  } else if (rival === 'legion') {
    // The army ants come in numbers: LEGION_RAID_SHARE of the wave, never fewer than its min
    drones = Math.min(units, Math.max(LEGION_RAID_SHARE.min, Math.floor(units * LEGION_RAID_SHARE.share)));
    young = Math.min(youngShare, units - drones);
  } else {
    young = youngShare;
    drones = rival === 'crystal' && n >= 3
      ? Math.min(units - young, Math.max(1, Math.floor(units * Math.min(0.35, 0.1 * (n - 2)))))
      : 0;
  }
  const beetles = units - young - drones;
  const elites = pickElites(n, Math.min(eliteCount, units), { young, beetles, drones });
  return { wave: n, total, youngBeetles: young, beetles, drones, statScale, elites, boss };
}
