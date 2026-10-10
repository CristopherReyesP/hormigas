import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import { applyQueenUpgrades } from './applyUpgrades';

/**
 * Keeps the queen's upgrades on her (queue size, health, armor, regeneration)
 * and the run clock and mineral intake for the Estadísticas tab.
 */
export class UpgradeSystem implements System {
  readonly name = 'UpgradeSystem';
  readonly priority = 32; // after HungerSystem (30) and RegenerationSystem (31)

  private readonly world: World;
  private lastMinerals: number;

  constructor(world: World) {
    this.world = world;
    this.lastMinerals = world.minerals.stored;
  }

  update(dt: number): void {
    applyQueenUpgrades(this.world, dt);
    const tally = this.world.runTally;
    tally.seconds += dt;
    // Deposits raise the bank, spending lowers it: only the rises are ore brought home
    const minerals = this.world.minerals.stored;
    if (minerals > this.lastMinerals) tally.mineralsGathered += minerals - this.lastMinerals;
    this.lastMinerals = minerals;
  }
}
