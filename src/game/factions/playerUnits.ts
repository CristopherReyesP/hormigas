// Which entities are the player's own units: what selection, control groups
// and orders may take. The Swarm's ants always are; a playable race's units
// (a Human player's troops and builders, a Crystal player's drones and
// Sentinels) are when the player owns them.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import { COMPONENT } from '../components/components';
import { HUMAN_COMPONENT } from '../rival/humanComponents';
import { FactionId, ownerOf } from './factions';

/** Unit stores of the playable races besides the Swarm's ants */
const RACE_UNIT_STORES = [HUMAN_COMPONENT.UNIT, COMPONENT.CRYSTAL_UNIT] as const;

/** A unit the player commands: an own ant, or a Human or Crystal unit the player owns. */
export function isPlayerUnit(world: World, id: EntityId): boolean {
  if (world.getComponent(id, COMPONENT.ANT) !== undefined) return true;
  return RACE_UNIT_STORES.some((store) => world.getComponent(id, store) !== undefined) && ownerOf(world, id) === FactionId.PLAYER;
}
