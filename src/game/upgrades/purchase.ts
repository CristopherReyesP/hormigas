import type { UpgradeLevels } from './upgradeLevels';
import { costAt, maxLevel, UPGRADE_TABLE, type UpgradeCost, type UpgradeId } from './upgradeTable';

/** What the colony can pay with right now */
export interface UpgradeFunds {
  /** All food in the pantry and farm piles (mushrooms included) */
  food: number;
  mushrooms: number;
  minerals: number;
}

/**
 * Mushrooms are paid first, then the food price from what is left, so a line
 * that asks for both never counts the same mushroom twice.
 */
export function canAfford(cost: UpgradeCost, funds: UpgradeFunds): boolean {
  return funds.mushrooms >= cost.mushrooms
    && funds.food - cost.mushrooms >= cost.food
    && funds.minerals >= cost.minerals;
}

/** What is missing to pay `cost` (all zero when it can be paid) */
export function shortfall(cost: UpgradeCost, funds: UpgradeFunds): UpgradeCost {
  const mushrooms = Math.max(0, cost.mushrooms - funds.mushrooms);
  return {
    food: Math.max(0, cost.food - Math.max(0, funds.food - cost.mushrooms)),
    minerals: Math.max(0, cost.minerals - funds.minerals),
    mushrooms,
  };
}

/** Takes the price out of the colony's stores; called only after canAfford */
export interface UpgradePayer {
  funds(): UpgradeFunds;
  pay(cost: UpgradeCost): void;
}

export type PurchaseResult =
  | { ok: true; level: number; cost: UpgradeCost }
  | { ok: false; reason: 'max' | 'funds' };

/** Buy the next level of `id`: checks the price, pays it and bumps the level. Refusals change nothing. */
export function purchase(levels: UpgradeLevels, id: UpgradeId, payer: UpgradePayer): PurchaseResult {
  const cost = costAt(id, levels[id]);
  if (!cost) return { ok: false, reason: 'max' };
  if (!canAfford(cost, payer.funds())) return { ok: false, reason: 'funds' };
  payer.pay(cost);
  levels[id] += 1;
  return { ok: true, level: levels[id], cost };
}

/** Lines whose next level the colony can pay now: the number on the Mejoras badge */
export function affordableCount(levels: UpgradeLevels, funds: UpgradeFunds): number {
  let count = 0;
  for (const def of UPGRADE_TABLE) {
    const level = levels[def.id];
    if (level >= maxLevel(def.id)) continue;
    if (canAfford(def.costs[level], funds)) count++;
  }
  return count;
}
