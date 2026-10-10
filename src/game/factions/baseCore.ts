// Where a faction's enemies live: the base cores a rival's raids and night
// waves march on. A Swarm player's core is its nest; a playable race without
// a nest (the Crystal Hive) registers its core in the FactionRegistry.

import type { World } from '../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../shared/types';
import { COMPONENT, type PositionComponent } from '../components/components';
import { ownerOf, relation, type FactionId } from './factions';

/** Every base core an enemy of `owner` has: its nests and the registered cores. */
function enemyCores(world: World, owner: FactionId): EntityId[] {
  const out: EntityId[] = [];
  for (const id of world.query(COMPONENT.NEST, COMPONENT.POSITION)) {
    const nestOwner = ownerOf(world, id);
    if (nestOwner !== null && relation(owner, nestOwner) === 'enemy') out.push(id);
  }
  for (const faction of world.factions.list()) {
    const core = faction.coreId;
    if (core === undefined || out.includes(core) || !world.hasEntity(core)) continue;
    if (relation(owner, faction.id) === 'enemy') out.push(core);
  }
  return out;
}

/** The closest enemy base core of `owner` to `from`, as a tile; null when there is none. */
export function nearestEnemyCore(world: World, owner: FactionId, from: Vector2): Vector2 | null {
  let best: Vector2 | null = null;
  let bestDist = Infinity;
  for (const id of enemyCores(world, owner)) {
    const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
    if (!pos) continue;
    const dist = Math.hypot(pos.x - from.x, pos.y - from.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = { x: Math.round(pos.x), y: Math.round(pos.y) };
    }
  }
  return best;
}
