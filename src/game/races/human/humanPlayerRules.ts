// The Humans as the player's race (P10), pure rules: what the builder can
// raise and where, what each building trains, what it all costs and how the
// expedition starts. No World, no randomness. The AI rival keeps its own
// tables in rival/humanBase.ts; unit and building stats are shared.

import type { HumanBuildingKind, HumanUnitType } from '../../rival/humanBase';
import { HUMAN_BUILDING_STATS } from '../../rival/humanBase';

/** Buildings the player's builders can raise ("Construir" submenu), in card order. */
export type PlayerBuildable = Exclude<HumanBuildingKind, 'command_center'>;
export const PLAYER_BUILDABLE: readonly PlayerBuildable[] = ['barracks', 'bunker', 'supply_depot', 'factory'];

/** A price in the two Human resources. */
export interface HumanCost {
  readonly rations: number;
  readonly minerals: number;
}

/** What the player has in the bank. */
export type HumanStock = HumanCost;

/** Buildings cost metal (minerals from the fields); the plan's "metal to build". */
export const PLAYER_BUILD_COST: Readonly<Record<PlayerBuildable, HumanCost>> = {
  barracks: { rations: 0, minerals: 150 },
  bunker: { rations: 0, minerals: 100 },
  supply_depot: { rations: 0, minerals: 100 },
  factory: { rations: 0, minerals: 200 },
};

/** Units cost rations (the plan's "rations to train"); the heavier ones also take metal. */
export const PLAYER_TRAIN_COST: Readonly<Record<HumanUnitType, HumanCost>> = {
  builder: { rations: 50, minerals: 0 },
  soldier: { rations: 70, minerals: 0 },
  marksman: { rations: 90, minerals: 25 },
  tank: { rations: 200, minerals: 150 },
};

/** The building that trains each unit. */
export const PRODUCER_OF: Readonly<Record<HumanUnitType, HumanBuildingKind>> = {
  builder: 'command_center',
  soldier: 'barracks',
  marksman: 'barracks',
  tank: 'factory',
};

const TRAIN_ORDER: readonly HumanUnitType[] = ['builder', 'soldier', 'marksman', 'tank'];

/** Units a finished `kind` building trains, in card order (none for bunkers and depots). */
export function trainableAt(kind: HumanBuildingKind): HumanUnitType[] {
  return TRAIN_ORDER.filter((type) => PRODUCER_OF[type] === kind);
}

/** The expedition's landing: the command center at the map center plus this. */
export const PLAYER_HUMAN_START = {
  builders: 2,
  soldiers: 2,
  rations: 150,
  minerals: 150,
} as const;

/** Builders mining the mineral fields for the command center. */
export const HUMAN_GATHER = {
  /** Minerals one trip brings back */
  tripAmount: 8,
  /** Seconds of chipping at a node per trip */
  mineSeconds: 2,
  /** The builder works a node from this close */
  nodeReach: 1.3,
  /** The builder drops its load this close to the command center's footprint edge */
  dropReach: 1.2,
  /** A node that runs dry sends its builder to the nearest node within this many tiles */
  retarget: 12,
} as const;

/** Units queued per building, StarCraft's five. */
export const PRODUCTION_QUEUE_MAX = 5;

/** A builder works on a frame from this close to its footprint edge. */
export const BUILD_REACH = 1.2;

export function canAfford(stock: HumanStock, cost: HumanCost): boolean {
  return stock.rations >= cost.rations && stock.minerals >= cost.minerals;
}

/** Builder-seconds of work per second with `builders` on one frame: each extra helper adds 60%. */
export function buildRate(builders: number): number {
  if (builders <= 0) return 0;
  return 1 + 0.6 * (builders - 1);
}

/** What placement needs to know about the map, in tiles. */
export interface PlacementWorld {
  width: number;
  height: number;
  isWalkable(x: number, y: number): boolean;
  /** Standing buildings and frames, any faction */
  buildings: ReadonlyArray<{ x: number; y: number; halfWidth: number }>;
  /** Mineral nodes */
  minerals: ReadonlyArray<{ x: number; y: number }>;
}

/** Tiles a building's footprint covers on each side of its center tile. */
export function footprintRadius(kind: HumanBuildingKind): number {
  return Math.max(0, Math.round(HUMAN_BUILDING_STATS[kind].halfWidth));
}

/** Gap kept between two footprints, so units can walk between buildings. */
const BUILDING_GAP = 0.5;
/** Tiles kept between a footprint and the map edge. */
const EDGE_MARGIN = 2;

/**
 * Why a `kind` building cannot stand on `tile` (a short Spanish reason), or
 * null when the spot is valid: on the map, on walkable ground under the whole
 * footprint, clear of other buildings and of mineral nodes.
 */
export function placementProblem(kind: HumanBuildingKind, tile: { x: number; y: number }, map: PlacementWorld): string | null {
  const r = footprintRadius(kind);
  const half = HUMAN_BUILDING_STATS[kind].halfWidth;
  if (tile.x - r < EDGE_MARGIN || tile.y - r < EDGE_MARGIN || tile.x + r >= map.width - EDGE_MARGIN || tile.y + r >= map.height - EDGE_MARGIN) {
    return 'Demasiado cerca del borde del mapa.';
  }
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (!map.isWalkable(tile.x + dx, tile.y + dy)) return 'El terreno no sirve: agua o roca bajo el edificio.';
    }
  }
  for (const b of map.buildings) {
    const reach = half + b.halfWidth + BUILDING_GAP;
    if (Math.abs(b.x - tile.x) < reach && Math.abs(b.y - tile.y) < reach) return 'Hay otro edificio en ese lugar.';
  }
  for (const m of map.minerals) {
    if (Math.abs(m.x - tile.x) < half + 1 && Math.abs(m.y - tile.y) < half + 1) return 'No se puede construir sobre un yacimiento de minerales.';
  }
  return null;
}
