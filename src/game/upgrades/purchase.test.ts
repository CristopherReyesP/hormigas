import { describe, expect, it } from 'vitest';
import { affordableCount, canAfford, purchase, shortfall, type UpgradeFunds, type UpgradePayer } from './purchase';
import { emptyUpgradeLevels } from './upgradeLevels';
import { UPGRADE_TABLE, type UpgradeCost } from './upgradeTable';

function wallet(funds: UpgradeFunds): UpgradePayer & { paid: UpgradeCost[]; state: UpgradeFunds } {
  const state = { ...funds };
  const paid: UpgradeCost[] = [];
  return {
    state,
    paid,
    funds: () => ({ ...state }),
    pay(cost) {
      paid.push(cost);
      state.mushrooms -= cost.mushrooms;
      state.food -= cost.food + cost.mushrooms;
      state.minerals -= cost.minerals;
    },
  };
}

describe('buying an upgrade', () => {
  it('spends exactly the listed food, minerals and mushrooms and raises the level', () => {
    const levels = emptyUpgradeLevels();
    const w = wallet({ food: 500, mushrooms: 50, minerals: 100 });
    expect(purchase(levels, 'queenLay', w)).toEqual({ ok: true, level: 1, cost: { food: 40, minerals: 0, mushrooms: 0 } });
    expect(w.state).toEqual({ food: 460, mushrooms: 50, minerals: 100 });
    expect(purchase(levels, 'queenLay', w).ok).toBe(true);
    expect(w.state).toEqual({ food: 380, mushrooms: 50, minerals: 85 });
    expect(purchase(levels, 'queenRegen', w)).toMatchObject({ ok: true, cost: { food: 60, minerals: 15, mushrooms: 10 } });
    expect(w.state).toEqual({ food: 310, mushrooms: 40, minerals: 70 });
    expect(levels.queenLay).toBe(2);
    expect(levels.queenRegen).toBe(1);
  });

  it('refuses when any resource is short, and changes nothing', () => {
    const levels = emptyUpgradeLevels();
    const poor = wallet({ food: 39, mushrooms: 0, minerals: 999 });
    expect(purchase(levels, 'queenLay', poor)).toEqual({ ok: false, reason: 'funds' });
    expect(poor.paid).toEqual([]);
    expect(levels.queenLay).toBe(0);

    const noOre = wallet({ food: 999, mushrooms: 0, minerals: 9 });
    expect(purchase(levels, 'queenHp', noOre)).toEqual({ ok: false, reason: 'funds' });
    const noShrooms = wallet({ food: 999, mushrooms: 9, minerals: 999 });
    expect(purchase(levels, 'queenRegen', noShrooms)).toEqual({ ok: false, reason: 'funds' });
    expect(noShrooms.paid).toEqual([]);
    expect(levels.queenHp + levels.queenRegen).toBe(0);
  });

  it('does not count the same mushroom as both food and mushrooms', () => {
    const cost = { food: 30, minerals: 0, mushrooms: 10 };
    expect(canAfford(cost, { food: 39, mushrooms: 10, minerals: 0 })).toBe(false);
    expect(canAfford(cost, { food: 40, mushrooms: 10, minerals: 0 })).toBe(true);
    expect(shortfall(cost, { food: 35, mushrooms: 4, minerals: 0 })).toEqual({ food: 5, minerals: 0, mushrooms: 6 });
  });

  it('stops at the max level', () => {
    const levels = emptyUpgradeLevels();
    levels.queenQueue = 3;
    const rich = wallet({ food: 1e6, mushrooms: 1e6, minerals: 1e6 });
    expect(purchase(levels, 'queenQueue', rich)).toEqual({ ok: false, reason: 'max' });
    expect(levels.queenQueue).toBe(3);
    expect(rich.paid).toEqual([]);
  });
});

describe('affordable badge', () => {
  it('counts the lines whose next level the colony can pay now', () => {
    const levels = emptyUpgradeLevels();
    expect(affordableCount(levels, { food: 0, mushrooms: 0, minerals: 0 })).toBe(0);
    // 35 food and no minerals: only the food-only first levels priced at 35 or less
    expect(affordableCount(levels, { food: 35, mushrooms: 0, minerals: 0 })).toBe(2); // storage, dig
    expect(affordableCount(levels, { food: 1e6, mushrooms: 1e6, minerals: 1e6 })).toBe(UPGRADE_TABLE.length);
    for (const def of UPGRADE_TABLE) levels[def.id] = def.costs.length;
    expect(affordableCount(levels, { food: 1e6, mushrooms: 1e6, minerals: 1e6 })).toBe(0);
  });
});
