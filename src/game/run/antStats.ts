import type { World } from '../../engine/ecs/World';
import { AntRole } from '../components/components';
import { ROLE_STATS } from '../../shared/constants';

export interface AntSpawnStats {
  carryCapacity: number;
  damage: number;
  maxHealth: number;
  maxHunger: number;
}

/**
 * Spawn-time ant stats from base role stats, queen upgrades and run mutations.
 * Each stat is rounded once, after every multiplier, so it stays an integer and
 * recomputing it (retrofit on purchase or pick) never compounds rounding.
 */
export function antSpawnStats(world: World, role: AntRole): AntSpawnStats {
  const base = ROLE_STATS[role];
  const run = world.runModifiers;
  const soldier = role === AntRole.Soldier;
  return {
    carryCapacity: Math.round(base.carryCapacity * (role === AntRole.Worker ? world.upgrades.workerCarryMult * run.workerCarryMult : 1)),
    damage: Math.round(base.damage * (soldier ? world.upgrades.soldierDamageMult * run.soldierDamageMult : 1)),
    maxHealth: Math.round(base.health * (soldier ? run.soldierMaxHealthMult : 1)),
    maxHunger: Math.round(base.hungerMax * run.maxHungerMult),
  };
}
