// Components only the player's Crystal Hive uses: a structure still
// crystallizing, a spire's production queue and rally point, and the marker
// on night-wave beetles that march on the Hive across the surface.

import type { Vector2 } from '../../../shared/types';
import type { CrystalPlayerUnitKind } from './crystalPlayerRules';

export const CRYSTAL_PLAYER_COMPONENT = {
  /** A structure (or a spire's new floor) still crystallizing */
  CONSTRUCTION: 'crystal_construction',
  /** A spire's paid queue and rally point */
  PRODUCER: 'crystal_producer',
  /**
   * A night-wave beetle sent at the Crystal Hive over the surface. The surface
   * beetle AI leaves it alone; CrystalSurfaceWaveSystem drives it.
   */
  SURFACE_RAIDER: 'surface_raider',
} as const;

export interface ConstructionComponent {
  /** A new structure, or one more floor on a standing spire */
  kind: 'build' | 'floor';
  /** Seconds crystallized so far */
  elapsed: number;
  /** Seconds it takes in all */
  total: number;
}

export interface ProducerComponent {
  /** Paid units in order; the first is crystallizing */
  queue: CrystalPlayerUnitKind[];
  /** Seconds the first one has crystallized */
  progress: number;
  /** Where new units walk to (tile), or null to stand by the spire */
  rally: Vector2 | null;
  /** The first unit waits for supply */
  blocked: 'supply' | null;
}

/** Growth 0..1 of something under construction */
export function constructionProgress(c: ConstructionComponent): number {
  return c.total > 0 ? Math.max(0, Math.min(1, c.elapsed / c.total)) : 1;
}
