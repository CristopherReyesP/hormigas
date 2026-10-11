// Phase 2, "La Frontera Salvaje": once the colony rules Phase 1's walled zone,
// the thorn wall falls and the outer ring of the map opens, with new ground
// and stronger enemies (src/game/phase/frontierContent.ts).
//
// It opens when BOTH hold:
// Then a meteor shower brings more rivals: new bases of every rival race
// (the picked one first, with more of them) and the Legionary nest.
// - the rival core is destroyed (a run against Fauna salvaje has none, so
//   only the second condition counts there);
// - the colony's dominion over the zone reaches DOMINION_TARGET.

import { inBounds, type TileBounds } from '../../simulation/world/frontier';

/** Dominion (0-1) the zone must reach */
export const DOMINION_TARGET = 0.75;
/** Weight of the explored ground in the dominion; the wildlife dens destroyed carry the rest */
export const DOMINION_TERRITORY_WEIGHT = 0.6;
/** Game seconds between two measurements (the territory scan walks the whole zone) */
export const DOMINION_MEASURE_SECONDS = 1;

/** Where the run stands on the way to Phase 2, as the HUD shows it */
export interface FrontierProgress {
  phase: 1 | 2;
  /** 0-1: explored ground and wildlife dens destroyed, weighted */
  dominion: number;
  target: number;
  /** Explored share of the zone's walkable ground (0-1) */
  territory: number;
  densDestroyed: number;
  densAlive: number;
  /** The run had a rival base whose core must fall first */
  coreNeeded: boolean;
  coreDestroyed: boolean;
}

/** Dominion from the explored share and the dens: no dens at all counts as all of them cleared */
export function dominionScore(territory: number, densDestroyed: number, densAlive: number): number {
  const dens = densDestroyed + densAlive > 0 ? densDestroyed / (densDestroyed + densAlive) : 1;
  const t = Math.max(0, Math.min(1, territory));
  return DOMINION_TERRITORY_WEIGHT * t + (1 - DOMINION_TERRITORY_WEIGHT) * dens;
}

/** Both conditions hold: the frontier opens */
export function frontierReady(p: FrontierProgress): boolean {
  if (p.phase !== 1) return false;
  if (p.coreNeeded && !p.coreDestroyed) return false;
  return p.dominion >= p.target;
}

interface TerritoryGrid {
  getTile(x: number, y: number): { walkable: boolean } | null;
}

/** Explored share of the walkable tiles inside `bounds` */
export function measureTerritory(grid: TerritoryGrid, bounds: TileBounds, isExplored: (x: number, y: number) => boolean): number {
  let walkable = 0;
  let explored = 0;
  for (let y = bounds.y0; y <= bounds.y1; y++) {
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      if (!grid.getTile(x, y)?.walkable) continue;
      walkable++;
      if (isExplored(x, y)) explored++;
    }
  }
  return walkable > 0 ? explored / walkable : 1;
}

/** Dens standing inside `bounds` among the given positions */
export function densInside(bounds: TileBounds, dens: ReadonlyArray<{ x: number; y: number }>): number {
  return dens.filter((d) => inBounds(bounds, Math.round(d.x), Math.round(d.y))).length;
}

/** The objective line under the tracker: what is still missing */
export function frontierHint(p: FrontierProgress): string {
  if (p.phase === 2) return 'La frontera está abierta: destruye las bases de los rivales que trajo la lluvia de meteoritos, el Hormiguero Legionario y a la Reina Legionaria.';
  const parts: string[] = [];
  if (p.coreNeeded && !p.coreDestroyed) parts.push('destruye el núcleo rival');
  if (p.dominion < p.target) parts.push(`domina el ${Math.round(p.target * 100)}% de la zona (explora y destruye guaridas)`);
  return parts.length > 0 ? `Para abrir la frontera: ${parts.join(' y ')}.` : 'La frontera está por caer…';
}
