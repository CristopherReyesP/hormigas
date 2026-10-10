import type { World } from '../engine/ecs/World';
import { COMPONENT, Layer, type AntComponent, type LayerComponent, type LayerValue, type PositionComponent } from '../game/components/components';
import type { EntityId } from '../shared/types';
import type { AudioEvent, AudioLayer } from './events';

/**
 * ECS → audio event adapters, so each game system needs one line to be
 * heard: `emitAudio(hitAudio(...))`. They only read components.
 */

const toLayer = (layer: LayerValue | undefined): AudioLayer => (layer === Layer.Underground ? 'underground' : 'surface');

function layerOf(world: World, id: EntityId): AudioLayer {
  return toLayer(world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer);
}

/** A strike lands on `at`: ants spit acid, anything else bites. */
export function hitAudio(world: World, attackerId: EntityId, at: { x: number; y: number }, layer: LayerValue | undefined): AudioEvent {
  const by = world.getComponent<AntComponent>(attackerId, COMPONENT.ANT) ? 'ant' : 'wildlife';
  return { type: 'hit', by, at: { x: at.x, y: at.y, layer: toLayer(layer) } };
}

/** A combatant dies where it stands (read before the entity is destroyed). */
export function deathAudio(world: World, id: EntityId): AudioEvent | null {
  const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
  if (!pos) return null;
  const kind = world.getComponent(id, COMPONENT.BEETLE) ? 'beetle' : world.getComponent(id, COMPONENT.CRICKET) ? 'cricket' : 'ant';
  return { type: 'death', kind, at: { x: pos.x, y: pos.y, layer: layerOf(world, id) } };
}

/** The first selected ant answers in its caste's chitter; no ants, no chitter. */
export function selectionAudio(world: World, ids: readonly EntityId[]): AudioEvent | null {
  for (const id of ids) {
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
    if (ant) return { type: 'select', caste: ant.role };
  }
  return null;
}

/** The queen lays an egg where she sits. */
export function eggLaidAudio(world: World, queenId: EntityId, at: { x: number; y: number }): AudioEvent {
  return { type: 'eggLaid', at: { x: at.x, y: at.y, layer: layerOf(world, queenId) } };
}
