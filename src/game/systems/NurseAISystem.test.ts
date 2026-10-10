import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { createAnt } from '../entities/factories';
import {
  AntRole,
  AntState,
  COMPONENT,
  Layer,
  type AntComponent,
  type HealthComponent,
  type HungerComponent,
  type LayerComponent,
} from '../components/components';
import { HEAL_HP_PER_FOOD, HUNGER_EAT_RATE } from '../../shared/constants';
import { NurseAISystem } from './NurseAISystem';

function setup(pantryFood: number) {
  const world = new World();
  const grid = new UndergroundGrid();
  const system = new NurseAISystem(world, grid);
  const pile = grid.getPantryTiles()[0];
  if (pantryFood > 0) grid.depositFood(pile.x, pile.y, 'leaf', pantryFood);

  /** A fed nurse at half health, standing on the pantry pile */
  const id = createAnt(world, pile.x + 0.5, pile.y + 0.5, AntRole.Nurse);
  world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
  const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
  const hunger = world.getComponent<HungerComponent>(id, COMPONENT.HUNGER)!;
  health.current = health.max / 2;
  return { grid, system, ant, health, hunger };
}

describe('a hurt nurse heals by eating', () => {
  it('goes to the pantry even when fed, and turns the meal into HP', () => {
    const { grid, system, ant, health } = setup(40);
    const before = health.current;

    system.update(0.1); // decides to eat
    expect(ant.state).toBe(AntState.Eating);
    system.update(0.5);

    const eaten = HUNGER_EAT_RATE * 0.5;
    expect(grid.getPantryStored().total).toBeCloseTo(40 - eaten);
    expect(health.current).toBeCloseTo(before + eaten * HEAL_HP_PER_FOOD);
  });

  it('a hungry, hurt nurse fills hunger first and heals with the rest', () => {
    const { system, health, hunger } = setup(200);
    hunger.current = hunger.max * 0.2;
    const before = health.current;

    system.update(0.1);
    for (let i = 0; i < 20; i++) system.update(0.5);

    expect(hunger.current).toBeGreaterThanOrEqual(hunger.max * 0.95);
    expect(health.current).toBeGreaterThan(before);
  });

  it('goes back to her duties once healed', () => {
    const { system, ant, health } = setup(200);
    system.update(0.1);
    for (let i = 0; i < 20; i++) system.update(0.5);
    expect(health.current).toBe(health.max);
    expect(ant.state).not.toBe(AntState.Eating);
  });

  it('with an empty pantry she never starts an eating trip', () => {
    const { system, ant, health } = setup(0);
    const before = health.current;
    for (let i = 0; i < 40; i++) {
      system.update(0.25);
      expect(ant.state).not.toBe(AntState.Eating);
    }
    expect(health.current).toBe(before);
  });
});
