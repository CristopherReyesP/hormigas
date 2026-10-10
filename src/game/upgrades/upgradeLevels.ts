import { UPGRADE_IDS, isUpgradeId, maxLevel, type UpgradeId } from './upgradeTable';

/**
 * Bought levels per line. Plain data (numbers only, no closures) so a save
 * can write it as JSON and a load can hand it back to the GameManager.
 */
export type UpgradeLevels = Record<UpgradeId, number>;

export function emptyUpgradeLevels(): UpgradeLevels {
  return Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as UpgradeLevels;
}

/**
 * Levels read back from a save: unknown lines are dropped, missing ones start
 * at 0, and every level is clamped to its line's range.
 */
export function normalizeUpgradeLevels(raw: Partial<Record<string, unknown>> | null | undefined): UpgradeLevels {
  const levels = emptyUpgradeLevels();
  if (!raw) return levels;
  for (const [key, value] of Object.entries(raw)) {
    if (!isUpgradeId(key) || typeof value !== 'number' || !Number.isFinite(value)) continue;
    levels[key] = Math.max(0, Math.min(maxLevel(key), Math.floor(value)));
  }
  return levels;
}

/** Run tallies for the Estadísticas tab; plain data, saved with the run. */
export interface RunTally {
  enemiesDefeated: number;
  antsLost: number;
  foodGathered: number;
  mineralsGathered: number;
  /** Seconds of simulated play: the base of the per-minute rates */
  seconds: number;
}

export function emptyRunTally(): RunTally {
  return { enemiesDefeated: 0, antsLost: 0, foodGathered: 0, mineralsGathered: 0, seconds: 0 };
}
