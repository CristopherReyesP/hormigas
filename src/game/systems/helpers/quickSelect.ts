import type { World } from '../../../engine/ecs/World';
import type { EntityId } from '../../../shared/types';
import {
  AntRole,
  COMPONENT,
  Layer,
  type AntComponent,
  type CrystalUnitComponent,
  type LayerComponent,
  type LayerValue,
  type OwnerComponent,
} from '../../components/components';
import { FactionId } from '../../factions/factions';
import { HUMAN_COMPONENT, type HumanUnitComponent } from '../../rival/humanComponents';
import type { HumanUnitType } from '../../rival/humanBase';
import { isPlayerUnit } from './playerOrders';

/**
 * The phone's quick-select bar: one chip per unit kind the player's race
 * fields, plus Todas. A tap selects every own unit of that kind on the layer
 * in view, across the whole map (not only the screen: a phone shows a small
 * window, and the long press already covers "these on screen"). A second tap
 * on the chip that is already the selection centers the camera on them.
 *
 * Kinds are keyed by the unit's own kind: an ant's caste for the Swarm
 * ('soldier', 'worker', 'scout'), `human-<type>` for a Human player,
 * `crystal-<kind>` for a Crystal player. A new
 * playable race adds its kinds to unitKindOf and a kind list here.
 */
export type QuickSelectKind = 'soldier' | 'worker' | 'scout' | `human-${HumanUnitType}` | 'crystal-drone' | 'crystal-sentinel' | 'all';

/** The Swarm's bar: Soldados, Obreras, Exploradoras, Todas */
export const QUICK_SELECT_KINDS: readonly QuickSelectKind[] = ['soldier', 'worker', 'scout', 'all'];

/** A Human player's bar: Soldados, Tiradores, Tanques, Constructores, Todas */
export const HUMAN_QUICK_SELECT_KINDS: readonly QuickSelectKind[] = [
  'human-soldier', 'human-marksman', 'human-tank', 'human-builder', 'all',
];

/** A Crystal player's bar: Drones, Centinelas, Todas */
export const CRYSTAL_QUICK_SELECT_KINDS: readonly QuickSelectKind[] = ['crystal-drone', 'crystal-sentinel', 'all'];

/** One chip of the bar: how many units it would pick, and whether they are exactly the selection. */
export interface QuickSelectInfo {
  kind: QuickSelectKind;
  count: number;
  selected: boolean;
}

/** The quick-select key of an own unit: its caste, its Human type or its Crystal kind; null for anything else. */
export function unitKindOf(world: World, id: EntityId): string | null {
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
  if (ant) return ant.role === AntRole.Soldier ? 'soldier' : ant.role === AntRole.Worker ? 'worker' : ant.role === AntRole.Scout ? 'scout' : ant.role;
  const human = world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT);
  if (human) return `human-${human.type}`;
  const crystal = world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT);
  return crystal ? `crystal-${crystal.kind}` : null;
}

/** Every own selectable unit on `layer`: ants, a Human player's units, a Crystal player's units */
function ownUnitsOn(world: World, layer: LayerValue): EntityId[] {
  const ids: EntityId[] = [];
  for (const store of [COMPONENT.ANT, HUMAN_COMPONENT.UNIT, COMPONENT.CRYSTAL_UNIT]) {
    for (const id of world.query(store, COMPONENT.SELECTABLE, COMPONENT.POSITION)) {
      if (!isPlayerUnit(world, id)) continue;
      const owner = world.getComponent<OwnerComponent>(id, COMPONENT.OWNER);
      if (owner && owner.faction !== FactionId.PLAYER) continue;
      if ((world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface) !== layer) continue;
      ids.push(id);
    }
  }
  return ids;
}

/** Own units of `kind` on `layer`, anywhere on the map. */
export function quickSelectIds(world: World, kind: QuickSelectKind, layer: LayerValue): EntityId[] {
  const units = ownUnitsOn(world, layer);
  return kind === 'all' ? units : units.filter((id) => unitKindOf(world, id) === kind);
}

/** True when both lists hold the same units (order aside); two empty lists are no match. */
export function sameMembers(a: readonly EntityId[], b: readonly EntityId[]): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Every chip of the bar (`kinds`, the race's list) for `layer`, lit when its units are exactly `selection`. */
export function quickSelectInfo(
  world: World,
  layer: LayerValue,
  selection: readonly EntityId[],
  kinds: readonly QuickSelectKind[] = QUICK_SELECT_KINDS,
): QuickSelectInfo[] {
  return kinds.map((kind) => {
    const ids = quickSelectIds(world, kind, layer);
    return { kind, count: ids.length, selected: sameMembers(ids, selection) };
  });
}
