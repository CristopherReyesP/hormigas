import { describe, expect, it, vi } from 'vitest';
import { World } from '../../engine/ecs/World';
import { createAnt, createFood, createNest } from '../entities/factories';
import { AntRole, AntState, COMPONENT, FoodType, Layer, type AntComponent, type CarryingComponent, type FoodSourceComponent } from '../components/components';
import { PorterSystem } from './PorterSystem';
import { TransitSystem } from './TransitSystem';
import { TileGrid } from '../../simulation/world/TileGrid';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';

function setup() {
  const world = new World();
  const grid = new UndergroundGrid();
  vi.spyOn(grid, 'hasDepositSpace').mockReturnValue(true);
  const transit = new TransitSystem(world, grid);
  const requestTransit = vi.spyOn(transit, 'requestTransit').mockImplementation(() => {});
  vi.spyOn(transit, 'isInTransit').mockReturnValue(false);
  const system = new PorterSystem(world, grid, new TileGrid(), transit);
  createNest(world, 10, 10);
  const nurse = createAnt(world, 10, 10, AntRole.Nurse);
  world.addComponent(nurse, COMPONENT.LAYER, { layer: Layer.Underground });
  const ant = world.getComponent<AntComponent>(nurse, COMPONENT.ANT)!;
  ant.state = AntState.Idle;
  return { world, system, nurse, ant, requestTransit };
}

describe('loose meat inside the nest with no worker free', () => {
  it('an idle nurse below picks it up instead of leaving it to rot', () => {
    const { world, system, nurse, ant, requestTransit } = setup();
    const meat = createFood(world, 10, 10, 30, FoodType.BeetleMeat, Layer.Underground);
    system.update(0);
    expect(ant.state).toBe(AntState.Scavenging);
    system.update(0);
    // Standing on it: it loads the meat and goes to the pantry
    expect(world.getComponent<CarryingComponent>(nurse, COMPONENT.CARRYING)!.amount).toBeGreaterThan(0);
    expect(world.getComponent<FoodSourceComponent>(meat, COMPONENT.FOOD_SOURCE)?.amount ?? 0).toBeLessThan(30);
    expect(ant.state).toBe(AntState.Hauling);
    // A nurse never rides up to the surface for it
    expect(requestTransit).not.toHaveBeenCalledWith(nurse, 'exit');
  });

  it('a busy nurse is left alone', () => {
    const { world, system, ant } = setup();
    ant.state = AntState.FeedingQueen;
    createFood(world, 12, 10, 30, FoodType.BeetleMeat, Layer.Underground);
    system.update(0);
    expect(ant.state).toBe(AntState.FeedingQueen);
  });
});
