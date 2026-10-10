// The skirmish setup chosen before a run: the player's race and the rival's.
// Only the Swarm is playable. The rival is the wildlife alone, or the Crystal
// Hive as an AI rival (P5); the Humans come in P9. The last choice is
// remembered per browser, best effort.

export type RaceId = 'swarm' | 'crystal' | 'human';

/** Who the player fights: a race (mirror matches allowed later) or today's wildlife. */
export type RivalId = RaceId | 'wildlife';

export interface RunSetup {
  readonly playerRace: RaceId;
  readonly rivalRace: RivalId;
}

/** The Swarm against the beetles and crickets alone: no Crystal Hive at the crater. */
export const DEFAULT_RUN_SETUP: RunSetup = { playerRace: 'swarm', rivalRace: 'wildlife' };

const PLAYABLE_RACES: ReadonlySet<string> = new Set<RaceId>(['swarm']);
const AVAILABLE_RIVALS: ReadonlySet<string> = new Set<RivalId>(['wildlife', 'crystal']);

export function isPlayableRace(race: string): race is RaceId {
  return PLAYABLE_RACES.has(race);
}

export function isAvailableRival(rival: string): rival is RivalId {
  return AVAILABLE_RIVALS.has(rival);
}

/** Picks the player's race; a race that is not playable yet leaves the setup unchanged. */
export function withPlayerRace(setup: RunSetup, race: RaceId): RunSetup {
  if (!isPlayableRace(race) || race === setup.playerRace) return setup;
  return { ...setup, playerRace: race };
}

/** Picks the rival; a rival that is not available yet leaves the setup unchanged. */
export function withRivalRace(setup: RunSetup, rival: RivalId): RunSetup {
  if (!isAvailableRival(rival) || rival === setup.rivalRace) return setup;
  return { ...setup, rivalRace: rival };
}

/** Coerces any value into a valid setup, falling back field by field. */
export function sanitizeRunSetup(value: unknown): RunSetup {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const player = record.playerRace;
  const rival = record.rivalRace;
  return {
    playerRace: typeof player === 'string' && isPlayableRace(player) ? player : DEFAULT_RUN_SETUP.playerRace,
    rivalRace: typeof rival === 'string' && isAvailableRival(rival) ? rival : DEFAULT_RUN_SETUP.rivalRace,
  };
}

// ── Persistence (best effort: private windows and sandboxes block storage) ──

export const RUN_SETUP_STORAGE_KEY = 'hormigas.runSetup.v1';

type SetupStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The browser's localStorage, or null where reading it is impossible or blocked. */
function browserStorage(): SetupStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The last stored choice, or the default when nothing valid is stored. */
export function loadRunSetup(storage: SetupStorage | null = browserStorage()): RunSetup {
  try {
    const raw = storage?.getItem(RUN_SETUP_STORAGE_KEY);
    if (!raw) return DEFAULT_RUN_SETUP;
    return sanitizeRunSetup(JSON.parse(raw));
  } catch {
    return DEFAULT_RUN_SETUP;
  }
}

/** Remembers the choice for the next visit; silently skipped when storage is unavailable. */
export function saveRunSetup(setup: RunSetup, storage: SetupStorage | null = browserStorage()): void {
  try {
    storage?.setItem(RUN_SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Storage is a convenience: a blocked or full storage just forgets the pick
  }
}
