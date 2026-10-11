import type { World } from '../../engine/ecs/World';
import {
  AntRole,
  COMPONENT,
  type AntComponent,
  type CarryingComponent,
  type CombatComponent,
  type HealthComponent,
  type HungerComponent,
  type RoleStatsComponent,
} from '../components/components';
import { ROLE_STATS } from '../../shared/constants';
import { casteMultipliers } from '../upgrades/upgradeEffects';

export interface AntSpawnStats {
  carryCapacity: number;
  damage: number;
  maxHealth: number;
  maxHunger: number;
  /** Walk speed factor of the caste after the Patas ágiles upgrade (mutations apply in MovementSystem) */
  speedMultiplier: number;
}

/**
 * Spawn-time ant stats from base role stats, Swarm upgrades (Mejoras) and run
 * mutations. Each stat is rounded once, after every multiplier, so it stays an
 * integer and recomputing it (retrofit on purchase or pick) never compounds rounding.
 */
export function antSpawnStats(world: World, role: AntRole): AntSpawnStats {
  const base = ROLE_STATS[role];
  const run = world.runModifiers;
  const caste = casteMultipliers(world.upgradeLevels, role);
  const soldier = role === AntRole.Soldier;
  const defender = role === AntRole.Defender;
  return {
    carryCapacity: Math.round(base.carryCapacity * caste.carry * (role === AntRole.Worker ? run.workerCarryMult : 1)),
    damage: Math.round(base.damage * caste.damage * run.antDamageMult * (soldier ? run.soldierDamageMult : 1) * (defender ? run.defenderDamageMult : 1)),
    maxHealth: Math.round(base.health * caste.health * run.antMaxHealthMult * (soldier ? run.soldierMaxHealthMult : 1) * (defender ? run.defenderMaxHealthMult : 1)),
    maxHunger: Math.round(base.hungerMax * run.maxHungerMult),
    speedMultiplier: base.speedMultiplier * caste.speed,
  };
}

/**
 * Bring every living ant to the stats a newborn of its caste would get now:
 * a purchase or a mutation pick reaches the whole colony, not only the next eggs.
 * Extra max HP arrives as health, like a newborn's full bar.
 */
export function retrofitAntStats(world: World): void {
  for (const antId of world.query(COMPONENT.ANT)) {
    const ant = world.getComponent<AntComponent>(antId, COMPONENT.ANT)!;
    const stats = antSpawnStats(world, ant.role);
    const hunger = world.getComponent<HungerComponent>(antId, COMPONENT.HUNGER);
    if (hunger) {
      hunger.max = stats.maxHunger;
      hunger.current = Math.min(hunger.current, stats.maxHunger);
    }
    const carrying = world.getComponent<CarryingComponent>(antId, COMPONENT.CARRYING);
    if (carrying) carrying.maxCapacity = stats.carryCapacity;
    const health = world.getComponent<HealthComponent>(antId, COMPONENT.HEALTH);
    if (health) {
      health.current = Math.min(stats.maxHealth, health.current + Math.max(0, stats.maxHealth - health.max));
      health.max = stats.maxHealth;
      health.damage = stats.damage;
    }
    const combat = world.getComponent<CombatComponent>(antId, COMPONENT.COMBAT);
    if (combat) combat.attackDamage = stats.damage;
    const roleStats = world.getComponent<RoleStatsComponent>(antId, COMPONENT.ROLE_STATS);
    if (roleStats) roleStats.speedMultiplier = stats.speedMultiplier;
  }
}
