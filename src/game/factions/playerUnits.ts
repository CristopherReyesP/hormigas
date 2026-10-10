// Which entities are the player's own units: what selection, control groups
// and orders may take. The Swarm's ants always are; a playable race's units
// (the Crystal Hive's drones and Sentinels) are when the player owns them.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import { COMPONENT, type AntComponent, type CrystalUnitComponent } from '../components/components';
import { FactionId, ownerOf } from './factions';

/** An own unit the player can select in a group and command: an ant, or a Crystal unit the player owns. */
export function isPlayerUnit(world: World, id: EntityId): boolean {
  if (world.getComponent(id, COMPONENT.ANT) !== undefined) return true;
  return world.getComponent(id, COMPONENT.CRYSTAL_UNIT) !== undefined && ownerOf(world, id) === FactionId.PLAYER;
}

/** Same key, same kind of unit (Ctrl+click picks every unit of that kind on screen); null when it is no own unit. */
export function unitKindKey(world: World, id: EntityId): string | null {
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
  if (ant) return ant.role;
  const crystal = world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT);
  if (crystal && ownerOf(world, id) === FactionId.PLAYER) return `crystal:${crystal.kind}`;
  return null;
}
