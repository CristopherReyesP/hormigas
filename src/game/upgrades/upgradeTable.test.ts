import { describe, expect, it } from 'vitest';
import { UPGRADE_GROUPS, UPGRADE_IDS, UPGRADE_TABLE, costAt, maxLevel, upgradeDef } from './upgradeTable';

const total = (c: { food: number; minerals: number; mushrooms: number }) => c.food + c.minerals + c.mushrooms;

describe('upgrade cost table', () => {
  it('has one row per line, every group filled, and keeps the original six lines', () => {
    expect(UPGRADE_TABLE.map((d) => d.id)).toEqual([...UPGRADE_IDS]);
    for (const group of UPGRADE_GROUPS) expect(UPGRADE_TABLE.some((d) => d.group === group)).toBe(true);
    for (const id of ['carry', 'damage', 'storage', 'dig', 'porters', 'heal'] as const) expect(upgradeDef(id)).toBeDefined();
    expect(upgradeDef('carry').group).toBe('castes');
    expect(upgradeDef('storage').group).toBe('colony');
    expect(upgradeDef('queenLay').group).toBe('queen');
    expect(upgradeDef('incubation').group).toBe('brood');
  });

  it('prices every level in food, and some first levels need food alone', () => {
    for (const def of UPGRADE_TABLE) {
      expect(def.costs.length).toBeGreaterThanOrEqual(3);
      for (const cost of def.costs) expect(cost.food).toBeGreaterThan(0);
    }
    const starters = UPGRADE_TABLE.filter((d) => d.costs[0].minerals === 0 && d.costs[0].mushrooms === 0).map((d) => d.id);
    expect(starters).toEqual(expect.arrayContaining(['queenLay', 'incubation']));
    // Mushrooms stay optional: only a few lines ask for them
    expect(UPGRADE_TABLE.filter((d) => d.costs.some((c) => c.mushrooms > 0)).length).toBeLessThanOrEqual(3);
    // Every later level asks for minerals too
    for (const def of UPGRADE_TABLE) expect(def.costs[1].minerals).toBeGreaterThan(0);
  });

  it('escalates: every level costs more than the last, and no resource gets cheaper', () => {
    for (const def of UPGRADE_TABLE) {
      for (let i = 1; i < def.costs.length; i++) {
        const [prev, next] = [def.costs[i - 1], def.costs[i]];
        expect(total(next), `${def.id} level ${i + 1}`).toBeGreaterThan(total(prev));
        expect(next.food).toBeGreaterThan(prev.food);
        expect(next.minerals).toBeGreaterThanOrEqual(prev.minerals);
        expect(next.mushrooms).toBeGreaterThanOrEqual(prev.mushrooms);
      }
    }
  });

  it('reads the next price by level and has none past the max', () => {
    expect(costAt('queenLay', 0)).toEqual({ food: 40, minerals: 0, mushrooms: 0 });
    expect(costAt('queenLay', 1)).toEqual({ food: 80, minerals: 15, mushrooms: 0 });
    expect(maxLevel('queenLay')).toBe(4);
    expect(costAt('queenLay', 4)).toBeNull();
  });
});
