import type { World } from '../engine/ecs/World';
import type { EntityId } from '../shared/types';
import { AntRole, COMPONENT, type AntComponent } from './components/components';
import { HUMAN_COMPONENT, type HumanUnitComponent } from './rival/humanComponents';
import type { HumanUnitType } from './rival/humanBase';

/**
 * Feedback the GameManager reports for a player command, so the HUD can
 * confirm it on a phone (a toast, a buzz, a burst where the finger was):
 * an order the selected ants took, or a long press that took a caste.
 */
export type OrderFeedbackKind = 'move' | 'attack' | 'attack-move' | 'rally';

/** What an attack order names, for the toast ("atacar guarida") */
export type FeedbackTarget = 'den' | 'hive' | 'spire' | 'beetle' | 'cricket' | 'crystal-unit' | 'human-unit' | 'human-building' | 'enemy';

export interface OrderFeedback {
  type: 'order';
  order: OrderFeedbackKind;
  /** Ants that took the order */
  count: number;
  byRole: Partial<Record<AntRole, number>>;
  /** A Human player's units that took it, per type (empty for the Swarm) */
  byHuman?: Partial<Record<HumanUnitType, number>>;
  /** The enemy an attack names; null for a move, an attack-move or a rally */
  target: FeedbackTarget | null;
  /** Given with a finger tap (the phone HUD confirms it louder) */
  touch: boolean;
}

export interface CasteSelectFeedback {
  type: 'caste-select';
  /** Where the finger was, canvas px; divide by pixelRatio for CSS px */
  x: number;
  y: number;
  pixelRatio: number;
  count: number;
  role: AntRole;
  /** A Human player's unit type, when the long press took Human units */
  humanType?: HumanUnitType;
}

export type CommandFeedback = OrderFeedback | CasteSelectFeedback;

/** Ants per caste among `ids` */
export function countRoles(world: World, ids: readonly EntityId[]): Partial<Record<AntRole, number>> {
  const byRole: Partial<Record<AntRole, number>> = {};
  for (const id of ids) {
    const role = world.getComponent<AntComponent>(id, COMPONENT.ANT)?.role;
    if (role !== undefined) byRole[role] = (byRole[role] ?? 0) + 1;
  }
  return byRole;
}

/** A Human player's units per type among `ids` */
export function countHumanTypes(world: World, ids: readonly EntityId[]): Partial<Record<HumanUnitType, number>> {
  const byType: Partial<Record<HumanUnitType, number>> = {};
  for (const id of ids) {
    const type = world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)?.type;
    if (type !== undefined) byType[type] = (byType[type] ?? 0) + 1;
  }
  return byType;
}

/** What kind of enemy `id` is, for the toast. */
export function feedbackTargetOf(world: World, id: EntityId): FeedbackTarget {
  const has = (store: string) => world.getComponent(id, store) !== undefined;
  if (has(COMPONENT.BEETLE_DEN) || has(COMPONENT.CRICKET_DEN)) return 'den';
  if (has(COMPONENT.CRYSTAL_HIVE)) return 'hive';
  if (has(COMPONENT.CRYSTAL_SPIRE)) return 'spire';
  if (has(COMPONENT.BEETLE)) return 'beetle';
  if (has(COMPONENT.CRICKET)) return 'cricket';
  if (has(COMPONENT.CRYSTAL_UNIT)) return 'crystal-unit';
  if (has(HUMAN_COMPONENT.BUILDING)) return 'human-building';
  if (has(HUMAN_COMPONENT.UNIT)) return 'human-unit';
  return 'enemy';
}
