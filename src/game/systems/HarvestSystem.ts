import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';

// HarvestSystem is currently handled inside AntAISystem for simplicity.
// This file exists as a placeholder for when we separate harvest logic
// (e.g., different harvest speeds per ant type, harvest animations, etc.)

export class HarvestSystem implements System {
  readonly name = 'HarvestSystem';
  readonly priority = 15;

  constructor(_world: World) {
    // Will be used when we implement harvest animations
  }

  update(_dt: number): void {
    // Will be implemented when we add harvest animations and varied harvest speeds
  }
}
