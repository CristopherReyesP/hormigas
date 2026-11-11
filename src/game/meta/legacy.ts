// The colony's legacy: what carries over between runs on this browser.
// - ADN: earned by every run (nights survived, boss relics, named veterans, a
//   victory, achievements) and banked as the run goes, so quitting loses nothing.
// - Herencias (perks): bought with ADN on the title screen; every new Swarm
//   run starts with them.
// - Logros (achievements): one-time goals, each worth some ADN.
// Storage can be missing, blocked or full; the game never fails because of it.

export const LEGACY_KEY = 'hormigas.legacy';

export type LegacyStorage = Pick<Storage, 'getItem' | 'setItem'>;

// ── Perks ──

export const PERK_IDS = ['brood', 'guard', 'pantry', 'ore', 'chitin'] as const;
export type PerkId = (typeof PERK_IDS)[number];

export interface PerkDef {
  name: string;
  /** What one level gives */
  blurb: string;
  /** costs[level] buys level + 1 */
  costs: readonly number[];
}

export const PERKS: Readonly<Record<PerkId, PerkDef>> = {
  brood: { name: 'Nidada inicial', blurb: '+2 obreras al empezar', costs: [20, 40, 70] },
  guard: { name: 'Guardia de la reina', blurb: '+1 soldado al empezar', costs: [30, 60] },
  pantry: { name: 'Despensa heredada', blurb: '+40 de comida al empezar', costs: [15, 30, 50] },
  ore: { name: 'Veta heredada', blurb: '+25 minerales al empezar', costs: [15, 30, 50] },
  chitin: { name: 'Quitina ancestral', blurb: '+5% de vida para toda la colonia', costs: [40, 70, 110] },
};

/** What each perk level is worth at the start of a run */
export const PERK_VALUE = { brood: 2, guard: 1, pantry: 40, ore: 25, chitin: 0.05 } as const;

// ── Achievements ──

export const ACHIEVEMENT_IDS = [
  'firstNight', 'night5', 'night10', 'tarantula', 'collector', 'captain', 'redMoon', 'victory', 'army',
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export interface AchievementDef {
  name: string;
  description: string;
}

export const ACHIEVEMENTS: Readonly<Record<AchievementId, AchievementDef>> = {
  firstNight: { name: 'Primer amanecer', description: 'Sobrevive tu primera noche' },
  night5: { name: 'Colonia asentada', description: 'Sobrevive 5 noches' },
  night10: { name: 'Imperio subterráneo', description: 'Sobrevive 10 noches' },
  tarantula: { name: 'Matatarántulas', description: 'Abate una tarántula alienígena' },
  collector: { name: 'Coleccionista', description: 'Reúne los tres trofeos de jefe en una partida' },
  captain: { name: 'Leyenda viva', description: 'Asciende una hormiga a Capitana' },
  redMoon: { name: 'Bajo la luna roja', description: 'Supera una oleada de Luna roja' },
  victory: { name: 'La colmena prevalece', description: 'Destruye la base rival' },
  army: { name: 'Marabunta', description: 'Reúne 60 hormigas a la vez' },
};

/** ADN each achievement pays, once */
export const ACHIEVEMENT_DNA = 10;

// ── A run's worth ──

/** What a run has done so far, as the legacy counts it */
export interface RunFeats {
  nights: number;
  /** Boss relics taken, by kind (trophies.ts) */
  trophies: number;
  trophyKinds: number;
  tarantulas: number;
  captains: number;
  redMoons: number;
  victory: boolean;
  /** Most ants alive at once */
  peakAnts: number;
}

export const DNA = { perNight: 5, perTrophy: 10, perCaptain: 5, victory: 30 } as const;

/** ADN a run with these feats is worth, achievements aside */
export function runDna(feats: RunFeats): number {
  return Math.max(0, feats.nights) * DNA.perNight
    + feats.trophies * DNA.perTrophy
    + feats.captains * DNA.perCaptain
    + (feats.victory ? DNA.victory : 0);
}

/** The achievements these feats earn */
export function earnedAchievements(feats: RunFeats): AchievementId[] {
  const out: AchievementId[] = [];
  if (feats.nights >= 1) out.push('firstNight');
  if (feats.nights >= 5) out.push('night5');
  if (feats.nights >= 10) out.push('night10');
  if (feats.tarantulas >= 1) out.push('tarantula');
  if (feats.trophyKinds >= 3) out.push('collector');
  if (feats.captains >= 1) out.push('captain');
  if (feats.redMoons >= 1) out.push('redMoon');
  if (feats.victory) out.push('victory');
  if (feats.peakAnts >= 60) out.push('army');
  return out;
}

// ── The stored legacy ──

export interface Legacy {
  dna: number;
  /** ADN earned over every run, spent or not */
  dnaEarned: number;
  perks: Record<PerkId, number>;
  achievements: AchievementId[];
}

export function emptyLegacy(): Legacy {
  return { dna: 0, dnaEarned: 0, perks: { brood: 0, guard: 0, pantry: 0, ore: 0, chitin: 0 }, achievements: [] };
}

function defaultStorage(): LegacyStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // the getter itself throws when site data is blocked
  }
}

const whole = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

/** Any stored value coerced into a valid legacy, field by field */
export function sanitizeLegacy(raw: unknown): Legacy {
  const legacy = emptyLegacy();
  if (typeof raw !== 'object' || raw === null) return legacy;
  const record = raw as Record<string, unknown>;
  legacy.dna = whole(record.dna);
  legacy.dnaEarned = Math.max(legacy.dna, whole(record.dnaEarned));
  const perks = typeof record.perks === 'object' && record.perks !== null ? (record.perks as Record<string, unknown>) : {};
  for (const id of PERK_IDS) legacy.perks[id] = Math.min(PERKS[id].costs.length, whole(perks[id]));
  const known = new Set<string>(ACHIEVEMENT_IDS);
  if (Array.isArray(record.achievements)) {
    legacy.achievements = [...new Set(record.achievements.filter((a): a is AchievementId => typeof a === 'string' && known.has(a)))];
  }
  return legacy;
}

export function loadLegacy(storage: LegacyStorage | null = defaultStorage()): Legacy {
  try {
    const text = storage?.getItem(LEGACY_KEY);
    return text ? sanitizeLegacy(JSON.parse(text)) : emptyLegacy();
  } catch {
    return emptyLegacy();
  }
}

export function saveLegacy(legacy: Legacy, storage: LegacyStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(LEGACY_KEY, JSON.stringify(legacy));
  } catch {
    // Full or blocked storage: the run goes on without banking
  }
}

/** The price of a perk's next level, or null once it is maxed */
export function perkCost(legacy: Legacy, id: PerkId): number | null {
  return PERKS[id].costs[legacy.perks[id]] ?? null;
}

/** Buy the next level of a perk; false (nothing changes) when it is maxed or too dear */
export function buyPerk(id: PerkId, storage: LegacyStorage | null = defaultStorage()): boolean {
  const legacy = loadLegacy(storage);
  const cost = perkCost(legacy, id);
  if (cost === null || legacy.dna < cost) return false;
  legacy.dna -= cost;
  legacy.perks[id]++;
  saveLegacy(legacy, storage);
  return true;
}

export interface BankResult {
  /** ADN added by this call */
  gained: number;
  /** Achievements unlocked by this call */
  unlocked: AchievementId[];
  legacy: Legacy;
}

/**
 * Bank a run's progress: `alreadyBanked` is the ADN this run has put in so
 * far, so calling it again (each dawn, then at the end) only adds the rest.
 * New achievements pay on top, once ever; `seen` are the ones this run already
 * unlocked, so a browser that cannot store the legacy does not repeat them.
 */
export function bankRun(
  feats: RunFeats,
  alreadyBanked: number,
  storage: LegacyStorage | null = defaultStorage(),
  seen: readonly AchievementId[] = [],
): BankResult {
  const legacy = loadLegacy(storage);
  const unlocked = earnedAchievements(feats).filter((id) => !legacy.achievements.includes(id) && !seen.includes(id));
  const gained = Math.max(0, runDna(feats) - alreadyBanked) + unlocked.length * ACHIEVEMENT_DNA;
  if (gained > 0 || unlocked.length > 0) {
    legacy.dna += gained;
    legacy.dnaEarned += gained;
    legacy.achievements.push(...unlocked);
    saveLegacy(legacy, storage);
  }
  return { gained, unlocked, legacy };
}
