import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { createAnt, createBeetle } from '../entities/factories';
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
import { DefenderAISystem } from './DefenderAISystem';

function setup(pantryFood: number) {
  const world = new World();
  const grid = new UndergroundGrid();
  const system = new DefenderAISystem(world, grid);
  const pile = grid.getPantryTiles()[0];
  if (pantryFood > 0) grid.depositFood(pile.x, pile.y, 'leaf', pantryFood);

  /** A fed defender at half health, standing on the pantry pile (no queen, no area: it holds where it stands) */
  const id = createAnt(world, pile.x + 0.5, pile.y + 0.5, AntRole.Defender);
  world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
  const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
  const hunger = world.getComponent<HungerComponent>(id, COMPONENT.HUNGER)!;
  health.current = health.max / 2;

  const invaderAt = (x: number, y: number) => {
    const beetle = createBeetle(world, x, y, null);
    world.getComponent<LayerComponent>(beetle, COMPONENT.LAYER)!.layer = Layer.Underground;
    return beetle;
  };
  return { grid, system, ant, health, hunger, pile, invaderAt };
}

describe('a hurt defender heals by eating', () => {
  it('leaves its post for the pantry when hurt, and turns the meal into HP', () => {
    const { grid, system, ant, health } = setup(40);
    const before = health.current;

    system.update(0.1); // decides to eat
    expect(ant.state).toBe(AntState.Eating);
    system.update(0.5);

    const eaten = HUNGER_EAT_RATE * 0.5;
    expect(grid.getPantryStored().total).toBeCloseTo(40 - eaten);
    expect(health.current).toBeCloseTo(before + eaten * HEAL_HP_PER_FOOD);
  });

  it('a hungry, hurt defender fills hunger first and heals with the rest', () => {
    const { system, health, hunger } = setup(200);
    hunger.current = hunger.max * 0.2;
    const before = health.current;

    system.update(0.1);
    for (let i = 0; i < 20; i++) system.update(0.5);

    expect(hunger.current).toBeGreaterThanOrEqual(hunger.max * 0.95);
    expect(health.current).toBeGreaterThan(before);
  });

  it('returns to guard duty once healed', () => {
    const { system, ant, health } = setup(200);
    system.update(0.1);
    for (let i = 0; i < 20; i++) system.update(0.5);
    expect(health.current).toBe(health.max);
    expect(ant.state).not.toBe(AntState.Eating);
  });

  it('with an empty pantry it never starts an eating trip', () => {
    const { system, ant, health } = setup(0);
    const before = health.current;
    for (let i = 0; i < 40; i++) {
      system.update(0.25);
      expect(ant.state).not.toBe(AntState.Eating);
    }
    expect(health.current).toBe(before);
  });

  it('a merely hurt defender fights an intruder near its post instead of leaving', () => {
    const { system, ant, pile, invaderAt } = setup(40);
    invaderAt(pile.x + 3.5, pile.y + 0.5);
    system.update(0.1);
    expect(ant.state).toBe(AntState.AttackingEnemy);
  });

  it('a defender topping up HP breaks off to answer an intruder near its post', () => {
    const { system, ant, pile, invaderAt } = setup(40);
    system.update(0.1);
    expect(ant.state).toBe(AntState.Eating);
    invaderAt(pile.x + 3.5, pile.y + 0.5);
    system.update(0.1);
    expect(ant.state).toBe(AntState.AttackingEnemy);
  });
});
