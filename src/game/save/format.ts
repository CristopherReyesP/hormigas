// The save file's envelope: version, metadata for the slot list, and parsing
// that never throws (a corrupt or foreign save is a value, not an exception).

import type { RaceId, RivalId } from '../run/RunSetup';
import type { Encoded } from './codec';

/**
 * Bump when a save written by the old code can no longer be loaded as is,
 * and add a migration from the old version below if one is possible.
 */
export const SAVE_VERSION = 1;

/** Tag every save carries, so foreign JSON is told apart from an old save */
export const SAVE_FORMAT = 'hormigas-save';

/** What the slot list and the Continuar button show without loading the run */
export interface SaveMeta {
  playerRace: RaceId;
  rivalRace: RivalId;
  day: number;
  phase: 'day' | 'night';
  ants: number;
  wave: number;
  minerals: number;
  /** Simulation ticks played */
  ticks: number;
  /** Wall-clock ms when it was written */
  savedAt: number;
}

/** The run itself (see snapshot.ts): roots written by the generic codec */
export interface SaveState {
  setup: { playerRace: RaceId; rivalRace: RivalId };
  world: Encoded;
  grid: Encoded;
  underground: Encoded;
  visibility: Encoded;
  /** Every System, by name */
  systems: Record<string, Encoded>;
  manager: Encoded;
  loop: { tickCount: number; speed: number };
  offerRng: number;
}

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  meta: SaveMeta;
  state: SaveState;
}

export type ParseResult =
  | { ok: true; save: SaveFile }
  | { ok: false; reason: 'corrupt' }
  /** A real save, from a version this build cannot load; `meta` lets the UI name it */
  | { ok: false; reason: 'incompatible'; meta?: SaveMeta };

/**
 * Migrations from older versions, keyed by the version they upgrade FROM.
 * Each takes a parsed save of that version and returns one of the next.
 * Empty while there is only version 1.
 */
export const MIGRATIONS: Record<number, (save: Record<string, unknown>) => Record<string, unknown>> = {};

export function stringifySave(save: SaveFile): string {
  return JSON.stringify(save);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A metadata block good enough to show, or undefined */
export function readMeta(v: unknown): SaveMeta | undefined {
  if (!isRecord(v)) return undefined;
  if (typeof v.playerRace !== 'string' || typeof v.rivalRace !== 'string') return undefined;
  if (typeof v.day !== 'number' || typeof v.savedAt !== 'number') return undefined;
  return v as unknown as SaveMeta;
}

/** Parse, migrate and sanity-check a save; never throws */
export function parseSave(text: string, migrations = MIGRATIONS): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!isRecord(raw) || raw.format !== SAVE_FORMAT || typeof raw.version !== 'number') {
    return { ok: false, reason: 'corrupt' };
  }
  let save: Record<string, unknown> = raw;
  try {
    while (typeof save.version === 'number' && save.version < SAVE_VERSION && migrations[save.version]) {
      save = migrations[save.version](save);
    }
  } catch {
    return { ok: false, reason: 'incompatible', meta: readMeta(raw.meta) };
  }
  if (save.version !== SAVE_VERSION) {
    return { ok: false, reason: 'incompatible', meta: readMeta(raw.meta) };
  }
  const meta = readMeta(save.meta);
  const state = save.state;
  if (!meta || !isRecord(state) || !isRecord(state.setup) || !isRecord(state.systems) || !isRecord(state.loop)) {
    return { ok: false, reason: 'corrupt' };
  }
  return { ok: true, save: save as unknown as SaveFile };
}
