// Where the player's Crystal structures may grow, pure rules: open explored
// ground, apart from other structures, spires within reach of the Hive or a
// finished spire, extractors beside a mineral field (one per field).

import type { Vector2 } from '../../../shared/types';
import { CRYSTAL_POWER_RADIUS, type CrystalBuildKind } from './crystalPlayerRules';

export interface PlacedStructure {
  x: number;
  y: number;
  kind: CrystalBuildKind | 'hive' | 'other';
  /** The player's own */
  own: boolean;
  /** Finished crystallizing */
  complete: boolean;
}

/** What placement reads from the world (GameManager builds it from the live map) */
export interface PlacementWorld {
  isWalkable(x: number, y: number): boolean;
  isExplored(x: number, y: number): boolean;
  /** Every structure on the surface, any faction's: hives, spires, dens, buildings */
  structures: readonly PlacedStructure[];
  /** Mineral nodes that still hold ore */
  minerals: readonly Vector2[];
}

export type PlacementResult = { ok: true } | { ok: false; reason: string };

/** No structure grows closer than this to another */
const STRUCTURE_GAP = 2.5;
/** ...nor this close to a hive (its sprite is big) */
const HIVE_GAP = 3;
/** An extractor needs a node this close */
export const EXTRACTOR_NODE_REACH = 2.5;
/** Two extractors (any faction's) never share a field */
export const EXTRACTOR_SPACING = 6;
/** No structure sits on a node */
const NODE_GAP = 1;

function dist(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Whether a `kind` structure may start crystallizing on `tile`, and why not. */
export function checkPlacement(kind: CrystalBuildKind, tile: Vector2, world: PlacementWorld): PlacementResult {
  const at = { x: Math.round(tile.x), y: Math.round(tile.y) };
  if (!world.isWalkable(at.x, at.y)) return { ok: false, reason: 'Terreno bloqueado: elige suelo abierto.' };
  if (!world.isExplored(at.x, at.y)) return { ok: false, reason: 'Terreno inexplorado: envía unidades a verlo primero.' };
  for (const s of world.structures) {
    const gap = s.kind === 'hive' ? HIVE_GAP : STRUCTURE_GAP;
    if (dist(s, at) < gap) return { ok: false, reason: 'Demasiado cerca de otra estructura.' };
  }
  if (world.minerals.some((m) => dist(m, at) < NODE_GAP)) return { ok: false, reason: 'No se puede construir encima de un yacimiento.' };

  if (kind === 'extractor') {
    if (!world.minerals.some((m) => dist(m, at) <= EXTRACTOR_NODE_REACH)) {
      return { ok: false, reason: 'El extractor va junto a un yacimiento de minerales.' };
    }
    if (world.structures.some((s) => s.kind === 'extractor' && dist(s, at) < EXTRACTOR_SPACING)) {
      return { ok: false, reason: 'Ese yacimiento ya tiene un extractor.' };
    }
    return { ok: true };
  }

  const powered = world.structures.some(
    (s) => s.own && s.complete && (s.kind === 'hive' || s.kind === 'forge' || s.kind === 'prism') && dist(s, at) <= CRYSTAL_POWER_RADIUS,
  );
  if (!powered) return { ok: false, reason: 'Fuera del alcance de la colmena: las agujas crecen cerca de la colmena o de otra aguja.' };
  return { ok: true };
}
