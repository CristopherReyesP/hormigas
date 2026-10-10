// Components only the player's Human entities carry: a builder's job (mining
// or building) and a building's production queue. The AI rival keeps its own
// fields on HumanBuildingComponent and never reads these.

import type { EntityId, Vector2 } from '../../../shared/types';
import type { HumanUnitType } from '../../rival/humanBase';

export const HUMAN_PLAYER_COMPONENT = {
  WORKER: 'human_worker',
  PRODUCER: 'human_producer',
  /** A night-wave beetle sent at a Human player's base: HumanWaveSystem steers it, not BeetleAI */
  WAVE_INVADER: 'human_wave_invader',
} as const;

/** What a player builder is busy with when it has no player order. */
export type HumanWorkerTask =
  /** Standing by */
  | 'idle'
  /** Walking to its mineral node, or chipping at it */
  | 'gather'
  /** Carrying a load back to the command center */
  | 'deliver'
  /** Walking to a frame, or raising it */
  | 'build';

export interface HumanWorkerComponent {
  task: HumanWorkerTask;
  /** The mineral node it mines (kept while it builds, so it can go back to it) */
  nodeId: EntityId | null;
  /** The frame it raises */
  buildingId: EntityId | null;
  /** Minerals in its hands */
  carrying: number;
  /** Seconds chipped at the node this trip */
  progress: number;
  /** Seconds until it may ask for another route */
  repath: number;
  /** Raising its frame right now (in reach) */
  working: boolean;
}

export interface HumanProducerComponent {
  /** Paid-for units, the first one in training */
  queue: HumanUnitType[];
  /** Seconds spent on the first unit */
  progress: number;
  /** Where new units walk to (null: they stay by the door) */
  rally: Vector2 | null;
}
