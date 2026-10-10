import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { createAnt, createBeetle, createEgg, createQueen } from '../entities/factories';
import {
  AntRole,
  COMPONENT,
  type CarryingComponent,
  type EggComponent,
  type EggQueueComponent,
  type HealthComponent,
  type RoleStatsComponent,
} from '../components/components';
import { QUEEN_ARMOR, QUEEN_MAX_HEALTH, ROLE_STATS } from '../../shared/constants';
import { retrofitAntStats } from '../run/antStats';
import { applyQueenUpgrades, retimeQueuedEggs, syncWorldUpgrades, tallyDeath } from './applyUpgrades';
import { antStatLines } from './upgradeView';
import { ARMOR_COMPONENT, damageAfterArmor } from '../systems/helpers/combatHelpers';

const get = <T,>(world: World, id: number, component: string) => world.getComponent<T>(id, component)!;

describe('caste upgrades reach living ants and newborns', () => {
  it('raises health, damage, speed and carry on existing ants and on new ones', () => {
    const world = new World();
    const soldier = createAnt(world, 5, 5, AntRole.Soldier);
    const worker = createAnt(world, 5, 5, AntRole.Worker);
    const defender = createAnt(world, 5, 5, AntRole.Defender);
    world.addComponent(soldier, COMPONENT.COMBAT, { attackDamage: ROLE_STATS.soldier.damage });
    get<HealthComponent>(world, soldier, COMPONENT.HEALTH).current = 100;

    Object.assign(world.upgradeLevels, { damage: 1, carapace: 1, legs: 1, carry: 1, workerHp: 1, defenderDamage: 2 });
    retrofitAntStats(world);

    const soldierHealth = get<HealthComponent>(world, soldier, COMPONENT.HEALTH);
    expect(soldierHealth).toMatchObject({ max: 180, current: 130, damage: 10 });
    expect(get<{ attackDamage: number }>(world, soldier, COMPONENT.COMBAT).attackDamage).toBe(10);
    expect(get<RoleStatsComponent>(world, soldier, COMPONENT.ROLE_STATS).speedMultiplier).toBeCloseTo(ROLE_STATS.soldier.speedMultiplier * 1.1);
    expect(get<CarryingComponent>(world, worker, COMPONENT.CARRYING).maxCapacity).toBe(19); // round(15 × 1.25)
    expect(get<HealthComponent>(world, worker, COMPONENT.HEALTH).max).toBe(100);
    expect(get<HealthComponent>(world, defender, COMPONENT.HEALTH).damage).toBe(15);

    const newborn = createAnt(world, 5, 5, AntRole.Soldier);
    expect(get<HealthComponent>(world, newborn, COMPONENT.HEALTH)).toMatchObject({ max: 180, current: 180, damage: 10 });
    expect(get<RoleStatsComponent>(world, newborn, COMPONENT.ROLE_STATS).speedMultiplier).toBeCloseTo(ROLE_STATS.soldier.speedMultiplier * 1.1);
    expect(get<CarryingComponent>(world, createAnt(world, 5, 5), COMPONENT.CARRYING).maxCapacity).toBe(19);
  });

  it('lists the ant card stats with the bonus over the caste base', () => {
    const world = new World();
    const soldier = createAnt(world, 5, 5, AntRole.Soldier);
    world.upgradeLevels.damage = 1;
    retrofitAntStats(world);
    const lines = antStatLines(world, soldier);
    expect(lines.find((l) => l.label === 'Daño')).toEqual({ label: 'Daño', value: 10, bonus: 2 });
    expect(lines.find((l) => l.label === 'Vida máx.')).toEqual({ label: 'Vida máx.', value: 150, bonus: 0 });
  });
});

describe('queen upgrades on her entity', () => {
  it('sets queue size, max health (granting the raise), armor and regeneration', () => {
    const world = new World();
    const queen = createQueen(world, 10, 10);
    const health = get<HealthComponent>(world, queen, COMPONENT.HEALTH);
    health.current = 300;
    Object.assign(world.upgradeLevels, { queenQueue: 1, queenHp: 2, queenRegen: 2 });

    applyQueenUpgrades(world);
    expect(get<EggQueueComponent>(world, queen, COMPONENT.EGG_QUEUE).maxPerType).toBe(7);
    expect(health.max).toBe(QUEEN_MAX_HEALTH + 300);
    expect(health.current).toBe(600);
    // Her own chitin (QUEEN_ARMOR) plus 2 a level
    expect(world.getComponent(queen, ARMOR_COMPONENT)).toEqual({ armor: QUEEN_ARMOR + 4 });
    expect(damageAfterArmor(world, queen, 10)).toBe(10 - QUEEN_ARMOR - 4);

    applyQueenUpgrades(world, 2); // 3 HP/s for 2 s; idempotent otherwise
    expect(health.current).toBe(606);
    expect(health.max).toBe(QUEEN_MAX_HEALTH + 300);
  });

  it('re-times eggs already queued, keeping their progress', () => {
    const world = new World();
    const queen = createQueen(world, 10, 10);
    const queue = get<EggQueueComponent>(world, queen, COMPONENT.EGG_QUEUE);
    queue.queue.push({ role: AntRole.Worker, layTimer: 1.5, layTimerTotal: 3 });
    world.upgradeLevels.queenLay = 2; // 2.2 s
    retimeQueuedEggs(world);
    expect(queue.queue[0].layTimerTotal).toBe(2.2);
    expect(queue.queue[0].layTimer).toBeCloseTo(1.1);
  });
});

describe('colony multipliers and larvae', () => {
  it('copies dig, porter and heal levels into world.upgrades', () => {
    const world = new World();
    Object.assign(world.upgradeLevels, { dig: 2, porters: 1, heal: 1 });
    syncWorldUpgrades(world);
    expect(world.upgrades).toEqual({ digSpeedMult: 1.6, porterBonus: 1, healRateMult: 1.5 });
  });

  it('lays eggs whose larvae need less food after Nutrición', () => {
    const world = new World();
    world.upgradeLevels.nutrition = 1;
    const egg = createEgg(world, 1, 1, AntRole.Worker, 20);
    expect(get<EggComponent>(world, egg, COMPONENT.EGG).requiredFood).toBe(8);
  });
});

describe('run tally', () => {
  it('counts ants lost and enemies defeated', () => {
    const world = new World();
    tallyDeath(world, createAnt(world, 1, 1));
    tallyDeath(world, createBeetle(world, 3, 3));
    expect(world.runTally).toMatchObject({ antsLost: 1, enemiesDefeated: 1 });
  });
});
