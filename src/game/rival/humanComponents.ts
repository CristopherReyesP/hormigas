// Human entity components. Kept apart from the factories so low-level
// helpers (combat, orders) can name the stores without import cycles.

import type { EntityId, Vector2 } from '../../shared/types';
import type { HumanBuildingKind, HumanTroop, HumanUnitType } from './humanBase';

/** Component names of the Human entities (plain strings, like COMPONENT). */
export const HUMAN_COMPONENT = {
  UNIT: 'human_unit',
  BUILDING: 'human_building',
} as const;

export type HumanUnitState =
  /** At home: keeps near the command center and fights what comes close */
  | 'guarding'
  /** Sent with a night wave: attack-moves to `goal` (the enemy nest) */
  | 'assaulting'
  /** A day raid: hunts the player's miners and scouts around `goal` */
  | 'raiding'
  /** Heading home after a raid */
  | 'returning'
  /** The builder on its way to a building slot, or raising a building there */
  | 'building';

export interface HumanUnitComponent {
  type: HumanUnitType;
  state: HumanUnitState;
  /** The command center it belongs to (null once it is gone) */
  baseId: EntityId | null;
  /** Assaulting, raiding, building: where it is headed */
  goal: Vector2 | null;
  /** Seconds until the route may be recomputed */
  repathTimer: number;
  /** Raiding: seconds spent on the raid */
  raidTimer: number;
}

export interface HumanBuildingComponent {
  kind: HumanBuildingKind;
  /** Seconds of building work left; 0 once it stands finished */
  constructing: number;
  /** Barracks: seconds until the unit in training is ready */
  trainTimer: number;
  /** Barracks: the unit in training (null: idle) */
  training: HumanTroop | null;
}

