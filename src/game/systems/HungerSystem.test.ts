import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { createAnt } from '../entities/factories';
import { COMPONENT, type CarryingComponent, type HealthComponent, type HungerComponent } from '../components/components';
import { HEAL_HP_PER_FOOD, HUNGER_PER_FOOD } from '../../shared/constants';
import { HungerSystem } from './HungerSystem';

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
