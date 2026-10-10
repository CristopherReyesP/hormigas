import type { World } from '../../engine/ecs/World';
import type { TileGrid } from '../../simulation/world/TileGrid';

/**
 * What the tutorial may touch in a run (GameManager.getTutorialStage): the
 * world it stages its lessons on, and the calm it holds: no dusk, night,
 * wave or random event interrupts a lesson.
 */
export interface TutorialStage {
  world: World;
  grid: TileGrid;
  /** The colony's nest tile on the surface */
  nest: { x: number; y: number };
  /** Mark ground as explored around a tile, so the player can see what Hormi points at */
  reveal: (x: number, y: number, radius: number) => void;
  /** Stop (true) or restart (false) the day/night clock and the random events */
  holdCalm: (held: boolean) => void;
}
