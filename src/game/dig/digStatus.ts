// The dig tool's numbers and classifications, kept pure so the HUD, the
// renderer and the GameManager agree on them: how many marks the queue
// holds, how long it will take, and which tiles can be dug at all.

import { UndergroundTerrainType } from '../../simulation/world/types';
import type { UndergroundGrid, UndergroundTile } from '../../simulation/world/UndergroundGrid';
import { ENTRANCE_ROW, EXCAVATION_TIME, MAX_DIG_JOBS } from '../../shared/constants';

/** Extra pending marks per level of the queen's 'dig' upgrade (Excavación rápida) */
export const DIG_CAP_PER_UPGRADE_LEVEL = 5;

/** Share of the cap from which the counter turns amber */
const NEAR_LIMIT = 0.75;

/**
 * How many dig marks may wait at once. The single source of the cap: the
 * upgrades work extends it here.
 */
export function digJobCap(digUpgradeLevel = 0): number {
  return MAX_DIG_JOBS + DIG_CAP_PER_UPGRADE_LEVEL * Math.max(0, digUpgradeLevel);
}

/** What the player reads when a mark is refused because the queue is full */
export function digLimitMessage(cap: number): string {
  return `Límite de excavación alcanzado (${cap}). Espera a que terminen o cancela marcas.`;
}

export type DigLevel = 'ok' | 'near' | 'full';

export function digLevel(pending: number, cap: number): DigLevel {
  if (pending >= cap) return 'full';
  if (pending >= cap * NEAR_LIMIT) return 'near';
  return 'ok';
}

/** Seconds one ant spends opening one tile, as ExcavationSystem times it */
export function digSecondsPerTile(upgradeMult: number, modifierMult: number): number {
  return EXCAVATION_TIME / (upgradeMult * modifierMult);
}

/**
 * Time to clear the queue: the crew opens `diggers` tiles per round. Walking
 * between tiles is left out, hence the ≈. Null while no one digs yet.
 */
export function estimateDigSeconds(pending: number, diggers: number, secondsPerTile: number): number | null {
  if (pending <= 0) return 0;
  if (diggers <= 0) return null;
  return Math.ceil(Math.ceil(pending / diggers) * secondsPerTile - 1e-9);
}

export interface DigStatus {
  pending: number;
  cap: number;
  /** Workers walking to or opening a marked tile */
  diggers: number;
  secondsPerTile: number;
  etaSeconds: number | null;
  level: DigLevel;
  /** pending / cap, clamped to 0..1: the bar's fill */
  fraction: number;
}

export function digStatus(input: { pending: number; cap: number; diggers: number; secondsPerTile: number }): DigStatus {
  const { pending, cap, diggers, secondsPerTile } = input;
  return {
    pending,
    cap,
    diggers,
    secondsPerTile,
    etaSeconds: estimateDigSeconds(pending, diggers, secondsPerTile),
    level: digLevel(pending, cap),
    fraction: cap > 0 ? Math.min(1, Math.max(0, pending / cap)) : 1,
  };
}

export function formatDigCounter(status: DigStatus): string {
  return `Excavación: ${status.pending}/${status.cap}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec === 0 ? `${min} min` : `${min} min ${sec} s`;
}

export function formatDigEta(status: DigStatus): string {
  if (status.pending <= 0) return 'sin marcas';
  if (status.etaSeconds === null) return 'esperando obreras';
  return `≈ ${formatDuration(status.etaSeconds)} · ${status.diggers} cavando`;
}

// ── Diggable area ───────────────────────────────────────────────────

/** What a tile is to the dig tool (one byte per tile in the overlay map) */
export const DigTileClass = {
  /** Already open: a tunnel or a chamber, nothing to dig */
  Open: 0,
  /** Plain earth */
  Diggable: 1,
  /** Earth on the entrance row: digging it opens a new entrance */
  Entrance: 2,
  /** A rock pocket inside the map */
  Rock: 3,
  /** The reinforced map edge */
  Border: 4,
} as const;
export type DigTileClass = typeof DigTileClass[keyof typeof DigTileClass];

export function isDiggableClass(cls: DigTileClass): boolean {
  return cls === DigTileClass.Diggable || cls === DigTileClass.Entrance;
}

/** Mirrors UndergroundGrid.designate: only Earth takes a dig mark */
export function classifyDigTile(tile: UndergroundTile, x: number, y: number, width: number, height: number): DigTileClass {
  if (tile.terrain === UndergroundTerrainType.Earth) {
    return y === ENTRANCE_ROW ? DigTileClass.Entrance : DigTileClass.Diggable;
  }
  if (tile.terrain === UndergroundTerrainType.Reinforced) {
    const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    return edge ? DigTileClass.Border : DigTileClass.Rock;
  }
  return DigTileClass.Open;
}

/** The whole map in one pass; callers cache it by the grid's layout version */
export function buildDigClassMap(grid: UndergroundGrid): Uint8Array {
  const map = new Uint8Array(grid.width * grid.height);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const tile = grid.getTile(x, y);
      if (tile) map[y * grid.width + x] = classifyDigTile(tile, x, y, grid.width, grid.height);
    }
  }
  return map;
}

/** How a tile under the finger or the pointer would take a mark */
export type DigPreview = 'ok' | 'over' | 'invalid';

export function previewDigTile(cls: DigTileClass, marked: boolean, queued: number, cap: number): DigPreview {
  if (!isDiggableClass(cls) || marked) return 'invalid';
  return queued >= cap ? 'over' : 'ok';
}

/** A stroke in order: each accepted tile takes a slot, so it goes red from the first tile past the cap */
export function previewDigStroke(tiles: ReadonlyArray<{ cls: DigTileClass; marked: boolean }>, queued: number, cap: number): DigPreview[] {
  let q = queued;
  return tiles.map(({ cls, marked }) => {
    const state = previewDigTile(cls, marked, q, cap);
    if (state === 'ok') q++;
    return state;
  });
}
