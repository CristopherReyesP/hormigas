import { describe, expect, it } from 'vitest';
import { AntRole } from '../components/components';
import {
  EGG_FOOD_REQUIRED,
  EGG_INCUBATION_WORKER,
  MAX_EGGS_PER_INCUBATION_TILE,
  MAX_EGGS_PER_TYPE,
  QUEEN_EGG_LAY_TIME,
  QUEEN_MAX_HEALTH,
} from '../../shared/constants';
import {
  breedCost,
  casteMultipliers,
  eggQueuePerCaste,
  eggsPerIncubationTile,
  hatchTime,
  larvaFoodRequired,
  queenArmor,
  queenLayTime,
  queenMaxHealth,
  queenRegen,
  queenTier,
  upgradeEffectLines,
} from './upgradeEffects';
import { emptyUpgradeLevels, normalizeUpgradeLevels } from './upgradeLevels';

describe('queen upgrades', () => {
  it('lays faster each level', () => {
    const levels = emptyUpgradeLevels();
    expect(queenLayTime(levels)).toBe(QUEEN_EGG_LAY_TIME);
    const times = [1, 2, 3, 4].map((n) => queenLayTime({ ...levels, queenLay: n }));
    expect(times).toEqual([2.6, 2.2, 1.8, 1.4]);
  });

  it('grows the queue per caste, her health, armor and regeneration', () => {
    const levels = { ...emptyUpgradeLevels(), queenQueue: 2, queenHp: 1, queenRegen: 2 };
    expect(eggQueuePerCaste(emptyUpgradeLevels())).toBe(MAX_EGGS_PER_TYPE);
    expect(eggQueuePerCaste(levels)).toBe(MAX_EGGS_PER_TYPE + 4);
    expect(queenMaxHealth(levels)).toBe(QUEEN_MAX_HEALTH + 150);
    expect(queenArmor(levels)).toBe(2);
    expect(queenRegen(levels)).toBe(3);
  });

  it('shows a crown tier from the queen levels bought', () => {
    expect(queenTier(emptyUpgradeLevels())).toBe(0);
    expect(queenTier({ ...emptyUpgradeLevels(), queenLay: 1 })).toBe(1);
    expect(queenTier({ ...emptyUpgradeLevels(), queenLay: 2, queenHp: 2 })).toBe(2);
    expect(queenTier({ ...emptyUpgradeLevels(), queenLay: 4, queenHp: 4, queenQueue: 1 })).toBe(3);
  });
});

describe('incubation upgrades', () => {
  it('shortens hatch time and fits more eggs per incubation tile', () => {
    const levels = emptyUpgradeLevels();
    expect(hatchTime(levels, AntRole.Worker)).toBe(EGG_INCUBATION_WORKER);
    expect(eggsPerIncubationTile(levels)).toBe(MAX_EGGS_PER_INCUBATION_TILE);
    const upgraded = { ...levels, incubation: 1 };
    expect(hatchTime(upgraded, AntRole.Worker)).toBe(16);
    expect(eggsPerIncubationTile(upgraded)).toBe(MAX_EGGS_PER_INCUBATION_TILE + 1);
    expect(hatchTime({ ...levels, incubation: 4 }, AntRole.Worker)).toBe(10);
  });

  it('makes eggs cheaper and larvae need less food', () => {
    const levels = { ...emptyUpgradeLevels(), nutrition: 2 };
    expect(larvaFoodRequired(emptyUpgradeLevels())).toBe(EGG_FOOD_REQUIRED);
    expect(larvaFoodRequired(levels)).toBe(EGG_FOOD_REQUIRED - 4);
    expect(breedCost(emptyUpgradeLevels(), AntRole.Worker)).toBe(20);
    expect(breedCost(levels, AntRole.Worker)).toBe(16);
    expect(breedCost(levels, AntRole.Soldier, 5)).toBe(32); // (35 + 5) × 0.8
  });
});

describe('caste multipliers', () => {
  it('apply each line to its castes only', () => {
    const levels = { ...emptyUpgradeLevels(), damage: 1, carapace: 1, workerHp: 2, defenderDamage: 1, legs: 1, carry: 2 };
    expect(casteMultipliers(levels, AntRole.Soldier)).toEqual({ health: 1.2, damage: 1.25, carry: 1, speed: 1.1 });
    expect(casteMultipliers(levels, AntRole.Defender)).toEqual({ health: 1.2, damage: 1.25, carry: 1, speed: 1.1 });
    expect(casteMultipliers(levels, AntRole.Worker)).toEqual({ health: 1.5, damage: 1, carry: 1.5, speed: 1.1 });
    expect(casteMultipliers(levels, AntRole.Nurse).health).toBe(1.5);
    expect(casteMultipliers(levels, AntRole.Scout).damage).toBe(1);
  });
});

describe('effect lines', () => {
  it('print the current value and the next one in numbers', () => {
    const levels = emptyUpgradeLevels();
    expect(upgradeEffectLines(levels, 'queenLay', 4)).toEqual([{ label: 'Puesta', now: '3.0 s', next: '2.6 s' }]);
    expect(upgradeEffectLines(levels, 'incubation', 4)).toEqual([
      { label: 'Obrera nace en', now: '20.0 s', next: '16.0 s' },
      { label: 'Huevos por casilla', now: '4', next: '5' },
    ]);
    expect(upgradeEffectLines(levels, 'damage', 3)).toEqual([{ label: 'Daño de soldado', now: '8', next: '10' }]);
    expect(upgradeEffectLines({ ...levels, queenQueue: 3 }, 'queenQueue', 3)).toEqual([{ label: 'Huevos por casta', now: '11', next: null }]);
  });
});

describe('saved levels', () => {
  it('read back clamped, dropping unknown lines', () => {
    const levels = normalizeUpgradeLevels({ queenLay: 2, carry: 99, bogus: 3, dig: -1, heal: 'x' });
    expect(levels.queenLay).toBe(2);
    expect(levels.carry).toBe(3);
    expect(levels.dig).toBe(0);
    expect(levels.heal).toBe(0);
    expect('bogus' in levels).toBe(false);
    expect(JSON.parse(JSON.stringify(levels))).toEqual(levels);
  });
});
