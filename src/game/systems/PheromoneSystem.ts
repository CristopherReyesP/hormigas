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

    // Only the area the run plays on holds scent (Phase 1: inside the thorn wall)
    const area = this.grid.bounds;
    for (let y = area.y0; y <= area.y1; y++) {
      for (let x = area.x0; x <= area.x1; x++) {
        const tile = this.grid.getTile(x, y)!;
        // Most of the map holds no scent at all: nothing to decay
        if (tile.foodPheromone === 0 && tile.homePheromone === 0 && tile.dangerPheromone === 0) continue;

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
