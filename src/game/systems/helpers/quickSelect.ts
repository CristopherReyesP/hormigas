import type { World } from '../../../engine/ecs/World';
import type { EntityId } from '../../../shared/types';
import {
  AntRole,
  COMPONENT,
  Layer,
  type AntComponent,
  type LayerComponent,
  type LayerValue,
  type OwnerComponent,
} from '../../components/components';
import { FactionId } from '../../factions/factions';

/**
 * The phone's quick-select bar: one chip per fighting caste plus Todas. A tap
 * selects every own ant of that kind on the layer in view, across the whole
 * map (not only the screen: a phone shows a small window, and the long press
 * already covers "these on screen"). A second tap on the chip that is already
 * the selection centers the camera on them.
 */
export type QuickSelectKind = 'soldier' | 'worker' | 'scout' | 'all';

export const QUICK_SELECT_KINDS: readonly QuickSelectKind[] = ['soldier', 'worker', 'scout', 'all'];

const KIND_ROLE: Record<Exclude<QuickSelectKind, 'all'>, AntRole> = {
  soldier: AntRole.Soldier,
  worker: AntRole.Worker,
  scout: AntRole.Scout,
};

/** One chip of the bar: how many ants it would pick, and whether they are exactly the selection. */
export interface QuickSelectInfo {
  kind: QuickSelectKind;
  count: number;
  selected: boolean;
}

function isOwnAntOn(world: World, id: EntityId, layer: LayerValue): boolean {
  if (!world.getComponent(id, COMPONENT.SELECTABLE)) return false;
  const owner = world.getComponent<OwnerComponent>(id, COMPONENT.OWNER);
  if (owner && owner.faction !== FactionId.PLAYER) return false;
  return (world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface) === layer;
}

/** Own ants of `kind` on `layer`, anywhere on the map. */
export function quickSelectIds(world: World, kind: QuickSelectKind, layer: LayerValue): EntityId[] {
  const role = kind === 'all' ? null : KIND_ROLE[kind];
  const ids: EntityId[] = [];
  for (const id of world.query(COMPONENT.ANT, COMPONENT.POSITION)) {
    if (!isOwnAntOn(world, id, layer)) continue;
    if (role !== null && world.getComponent<AntComponent>(id, COMPONENT.ANT)!.role !== role) continue;
    ids.push(id);
  }
  return ids;
}

/** True when both lists hold the same ants (order aside); two empty lists are no match. */
export function sameMembers(a: readonly EntityId[], b: readonly EntityId[]): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Every chip of the bar for `layer`, lit when its ants are exactly `selection`. */
export function quickSelectInfo(world: World, layer: LayerValue, selection: readonly EntityId[]): QuickSelectInfo[] {
  return QUICK_SELECT_KINDS.map((kind) => {
    const ids = quickSelectIds(world, kind, layer);
    return { kind, count: ids.length, selected: sameMembers(ids, selection) };
  });
}
