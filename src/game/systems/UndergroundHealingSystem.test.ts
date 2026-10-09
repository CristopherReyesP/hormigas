import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { createAnt, createFood } from '../entities/factories';
import {
  AntState,
  COMPONENT,
  FoodType,
  Layer,
  type AntComponent,
  type FoodSourceComponent,
  type HealthComponent,
  type LayerComponent,
} from '../components/components';
import { HEAL_HP_PER_FOOD, HUNGER_EAT_RATE } from '../../shared/constants';
import { TransitSystem } from './TransitSystem';
import { UndergroundHealingSystem } from './UndergroundHealingSystem';

function setup() {
  const world = new World();
  const grid = new UndergroundGrid();
  const system = new UndergroundHealingSystem(world, grid, new TransitSystem(world, grid));

  /** A fed (full hunger) worker below ground, half health, that came down to eat */
  function hurtAnt(x: number, y: number) {
    const id = createAnt(world, x, y);
    world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
    world.getComponent<AntComponent>(id, COMPONENT.ANT)!.state = AntState.Healing;
    const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
    health.current = health.max / 2;
    return health;
  }

  return { world, grid, system, hurtAnt };
}

describe('eating restores HP', () => {
  it('turns pantry food into HP at HEAL_HP_PER_FOOD, paced by how fast the ant eats', () => {
    const { grid, system, hurtAnt } = setup();
    const pile = grid.getPantryTiles()[0];
    grid.depositFood(pile.x, pile.y, 'leaf', 40);
    const health = hurtAnt(pile.x + 0.5, pile.y + 0.5);
    const before = health.current;

    system.update(0.5);

    const eaten = HUNGER_EAT_RATE * 0.5;
    expect(grid.getPantryStored().total).toBeCloseTo(40 - eaten);
    expect(health.current).toBeCloseTo(before + eaten * HEAL_HP_PER_FOOD);
  });

  it('turns loose food on the nest floor into HP the same way', () => {
    const { world, system, hurtAnt } = setup();
    const meat = createFood(world, 20.5, 20.5, 40, FoodType.BeetleMeat);
    world.addComponent<LayerComponent>(meat, COMPONENT.LAYER, { layer: Layer.Underground });
    const health = hurtAnt(20.5, 20.5);
    const before = health.current;

    system.update(0.5);

    const eaten = HUNGER_EAT_RATE * 0.5;
    expect(world.getComponent<FoodSourceComponent>(meat, COMPONENT.FOOD_SOURCE)!.amount).toBeCloseTo(40 - eaten);
    expect(health.current).toBeCloseTo(before + eaten * HEAL_HP_PER_FOOD);
  });
});
