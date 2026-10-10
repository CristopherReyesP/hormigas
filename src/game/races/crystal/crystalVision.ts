// What the player's Crystal Hive sees: its units by their vision, its Hive and
// spires around them. FogOfWarSystem reveals these next to the Swarm's ants.

import type { World } from '../../../engine/ecs/World';
import { COMPONENT, type PositionComponent, type RoleStatsComponent } from '../../components/components';
import { FactionId, ownerOf } from '../../factions/factions';
import { FOG_REVEAL_MULTIPLIER } from '../../../shared/constants';

export interface VisionSource {
  x: number;
  y: number;
  /** Reveal radius in tiles */
  radius: number;
}

/** Tiles the Hive and a spire reveal around themselves */
const HIVE_REVEAL = 10;
const SPIRE_REVEAL = 6;

/** The player's Crystal eyes on the surface; empty in a Swarm run */
export function playerCrystalVision(world: World): VisionSource[] {
  const out: VisionSource[] = [];
  const own = (id: number) => ownerOf(world, id) === FactionId.PLAYER;
  for (const id of world.query(COMPONENT.CRYSTAL_UNIT, COMPONENT.POSITION)) {
    if (!own(id)) continue;
    const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const vision = world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS)?.visionRange ?? 7;
    out.push({ x: pos.x, y: pos.y, radius: Math.ceil(vision * FOG_REVEAL_MULTIPLIER) });
  }
  for (const [store, radius] of [[COMPONENT.CRYSTAL_HIVE, HIVE_REVEAL], [COMPONENT.CRYSTAL_SPIRE, SPIRE_REVEAL]] as const) {
    for (const id of world.query(store, COMPONENT.POSITION)) {
      if (!own(id)) continue;
      const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      out.push({ x: pos.x, y: pos.y, radius });
    }
  }
  return out;
}
