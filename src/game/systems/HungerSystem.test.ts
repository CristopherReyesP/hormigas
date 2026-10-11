import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { createAnt, createQueen } from '../entities/factories';
import { COMPONENT, type CarryingComponent, type HealthComponent, type HungerComponent, type QueenEntityComponent } from '../components/components';
import { HEAL_HP_PER_FOOD, HUNGER_PER_FOOD } from '../../shared/constants';
import { HungerSystem, QUEEN_HUNGRY_SHARE } from './HungerSystem';

describe('eating restores HP', () => {
  it('a starving, hurt ant eating from its own load turns what it eats beyond hunger into HP', () => {
    const world = new World();
    const system = new HungerSystem(world, createDefaultModifiers());
    const id = createAnt(world, 10, 10);
    const hunger = world.getComponent<HungerComponent>(id, COMPONENT.HUNGER)!;
    const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
    const load = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;
    hunger.current = hunger.max * 0.2;
    health.current = health.max / 2;
    load.amount = 15;
    load.resourceType = 'leaf';
    const hpBefore = health.current;

    system.update(1);

    expect(hunger.current).toBeCloseTo(hunger.max);
    expect(health.current).toBeGreaterThan(hpBefore);
    // Every unit is accounted for: hunger first, the rest became HP
    const eaten = 15 - load.amount;
    const hungerFood = (hunger.max * 0.8 + hunger.decayRate) / HUNGER_PER_FOOD;
    expect(health.current - hpBefore).toBeCloseTo((eaten - hungerFood) * HEAL_HP_PER_FOOD);
  });
});

describe('the queen warns before she starves', () => {
  it('says she is hungry when her hunger runs low, and raises a strong alert while she starves', () => {
    const world = new World();
    const system = new HungerSystem(world, createDefaultModifiers());
    const queenId = createQueen(world, 5, 5);
    const queen = world.getComponent<QueenEntityComponent>(queenId, COMPONENT.QUEEN_ENTITY)!;
    const messages = () => world.notifications.map((n) => `${n.severity}:${n.message}`);

    queen.hunger = queen.maxHunger * (QUEEN_HUNGRY_SHARE + 0.05);
    system.update(0.1);
    expect(messages().some((m) => m.includes('La reina tiene hambre'))).toBe(false);

    queen.hunger = queen.maxHunger * (QUEEN_HUNGRY_SHARE - 0.01);
    system.update(0.1);
    expect(messages()).toContainEqual(expect.stringMatching(/^warning:.*La reina tiene hambre/));
    // Once: it does not repeat every tick
    system.update(0.1);
    expect(messages().filter((m) => m.includes('La reina tiene hambre'))).toHaveLength(1);

    queen.hunger = 0;
    system.update(0.1);
    expect(messages()).toContainEqual(expect.stringMatching(/^danger:.*La reina se muere de hambre/));
  });
});
