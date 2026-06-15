import type { System } from '../../engine/ecs/types';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { GlobalModifiers } from '../events/GlobalModifiers';
import { PHEROMONE_DECAY_RATE } from '../../shared/constants';

export class PheromoneSystem implements System {
  readonly name = 'PheromoneSystem';
  readonly priority = 20;

  private tickCounter = 0;
  private grid: TileGrid;
  private modifiers: GlobalModifiers;

  constructor(grid: TileGrid, modifiers: GlobalModifiers) {
    this.grid = grid;
    this.modifiers = modifiers;
  }

  update(_dt: number): void {
    this.tickCounter++;
    // Only process every 3 ticks for performance
    if (this.tickCounter % 3 !== 0) return;

    // Decay rate (affected by event modifiers) — constant across the grid, hoisted out of the loop
    const effectiveDecayRate = Math.pow(PHEROMONE_DECAY_RATE, this.modifiers.pheromoneDecayMultiplier);

    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const tile = this.grid.getTile(x, y)!;

        tile.foodPheromone *= effectiveDecayRate;
        tile.homePheromone *= effectiveDecayRate;
        tile.dangerPheromone *= effectiveDecayRate;

        // Clean up tiny values
        if (tile.foodPheromone < 0.5) tile.foodPheromone = 0;
        if (tile.homePheromone < 0.5) tile.homePheromone = 0;
        if (tile.dangerPheromone < 0.5) tile.dangerPheromone = 0;
      }
    }
  }
}
