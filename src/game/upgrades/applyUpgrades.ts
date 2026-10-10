import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  type EggQueueComponent,
  type HealthComponent,
} from '../components/components';
import { FactionId, isHostileTo } from '../factions/factions';
import { ARMOR_COMPONENT, type ArmorComponent } from '../systems/helpers/combatHelpers';
import {
  digSpeedMultiplier,
  eggQueuePerCaste,
  healRateMultiplier,
  porterBonus,
  queenArmor,
  queenLayTime,
  queenMaxHealth,
  queenRegen,
} from './upgradeEffects';

/** Copy the level-derived colony multipliers into world.upgrades, which the dig, porter and healing systems read. */
export function syncWorldUpgrades(world: World): void {
  const levels = world.upgradeLevels;
  world.upgrades.digSpeedMult = digSpeedMultiplier(levels);
  world.upgrades.porterBonus = porterBonus(levels);
  world.upgrades.healRateMult = healRateMultiplier(levels);
}

/**
 * The queen's upgrades on her entity: egg queue per caste, max health (a
 * raise arrives as health), armor and regeneration over `dt` seconds.
 * Idempotent, so the UpgradeSystem runs it every tick and a new or loaded
 * queen picks the levels up too.
 */
export function applyQueenUpgrades(world: World, dt = 0): void {
  const levels = world.upgradeLevels;
  for (const id of world.query(COMPONENT.QUEEN_ENTITY)) {
    const queue = world.getComponent<EggQueueComponent>(id, COMPONENT.EGG_QUEUE);
    if (queue) queue.maxPerType = eggQueuePerCaste(levels);

    const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (health) {
      const max = queenMaxHealth(levels);
      if (max !== health.max) {
        if (health.current > 0) health.current = Math.min(max, health.current + Math.max(0, max - health.max));
        health.max = max;
      }
      const regen = queenRegen(levels);
      if (regen > 0 && dt > 0 && health.current > 0 && health.current < health.max) {
        health.current = Math.min(health.max, health.current + regen * dt);
      }
    }

    const armor = queenArmor(levels);
    const current = world.getComponent<ArmorComponent>(id, ARMOR_COMPONENT);
    if (armor > 0 && !current) world.addComponent<ArmorComponent>(id, ARMOR_COMPONENT, { armor });
    else if (current) current.armor = armor;
  }
}

/** A faster lay time reaches the eggs already ordered: each keeps its progress, on the new clock. */
export function retimeQueuedEggs(world: World): void {
  const total = queenLayTime(world.upgradeLevels);
  for (const id of world.query(COMPONENT.EGG_QUEUE)) {
    const queue = world.getComponent<EggQueueComponent>(id, COMPONENT.EGG_QUEUE)!;
    for (const egg of queue.queue) {
      const progress = egg.layTimerTotal > 0 ? 1 - egg.layTimer / egg.layTimerTotal : 0;
      egg.layTimerTotal = total;
      egg.layTimer = total * (1 - progress);
    }
  }
}

/** Count a death for the Estadísticas tab: an ant lost, or an enemy defeated */
export function tallyDeath(world: World, id: EntityId): void {
  if (world.getComponent(id, COMPONENT.ANT)) {
    world.runTally.antsLost++;
    return;
  }
  if (!world.getComponent(id, COMPONENT.HEALTH)) return;
  if (isHostileTo(world, FactionId.PLAYER, id)) world.runTally.enemiesDefeated++;
}
