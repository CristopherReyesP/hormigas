// The skirmish setup chosen before a run: the player's race and the rival's.
// The Swarm and the Humans are playable. The rival is the wildlife alone, the
// Crystal Hive as an AI rival (P5) or the Humans as an AI base (P9), a mirror
// match for a Human player. There is no Swarm AI yet. The last choice is
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

const PLAYABLE_RACES: ReadonlySet<string> = new Set<RaceId>(['swarm', 'human']);
/** Rivals each playable race can face. No Swarm AI exists yet, so nobody fights a Swarm rival. */
const RIVALS_FOR: Readonly<Record<RaceId, ReadonlySet<string>>> = {
  swarm: new Set<RivalId>(['wildlife', 'crystal', 'human']),
  human: new Set<RivalId>(['wildlife', 'crystal', 'human']),
  crystal: new Set<RivalId>(),
};

export function isPlayableRace(race: string): race is RaceId {
  return PLAYABLE_RACES.has(race);
}

/** Whether `player` can be matched against `rival` (the Swarm player by default). */
export function isAvailableRival(rival: string, player: RaceId = 'swarm'): rival is RivalId {
  return RIVALS_FOR[player]?.has(rival) ?? false;
}

/**
 * Picks the player's race; a race that is not playable yet leaves the setup
 * unchanged. A rival the new race cannot face falls back to the wildlife.
 */
export function withPlayerRace(setup: RunSetup, race: RaceId): RunSetup {
  if (!isPlayableRace(race) || race === setup.playerRace) return setup;
  const rivalRace = isAvailableRival(setup.rivalRace, race) ? setup.rivalRace : DEFAULT_RUN_SETUP.rivalRace;
  return { playerRace: race, rivalRace };
}

/** Picks the rival; a rival the player's race cannot face yet leaves the setup unchanged. */
export function withRivalRace(setup: RunSetup, rival: RivalId): RunSetup {
  if (!isAvailableRival(rival, setup.playerRace) || rival === setup.rivalRace) return setup;
  return { ...setup, rivalRace: rival };
}

/** Coerces any value into a valid setup, falling back field by field. */
export function sanitizeRunSetup(value: unknown): RunSetup {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const player = record.playerRace;
  const rival = record.rivalRace;
  const playerRace = typeof player === 'string' && isPlayableRace(player) ? player : DEFAULT_RUN_SETUP.playerRace;
  return {
    playerRace,
    rivalRace: typeof rival === 'string' && isAvailableRival(rival, playerRace) ? rival : DEFAULT_RUN_SETUP.rivalRace,
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
