import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../../engine/ecs/World';
import { TileGrid } from '../../simulation/world/TileGrid';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { TerrainType } from '../../simulation/world/types';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { createAnt, createMineral, createNest } from '../entities/factories';
import {
  AntRole,
  AntState,
  COMPONENT,
  Layer,
  ORE_LOAD,
  type AntComponent,
  type CarryingComponent,
  type HungerComponent,
  type LayerComponent,
  type MineralComponent,
  type NestComponent,
} from '../components/components';
import {
  MINERAL_TRIP_AMOUNT,
  RETURNING_HOME_DROP_TIMEOUT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../shared/constants';
import { AntAISystem } from './AntAISystem';
import { MovementSystem } from './MovementSystem';
import { TransitSystem } from './TransitSystem';
import { PorterSystem } from './PorterSystem';
import { HungerSystem } from './HungerSystem';

const NX = Math.floor(WORLD_WIDTH / 2);
const NY = Math.floor(WORLD_HEIGHT / 2);
const TICK = 1 / 60;

function setup() {
  const world = new World();
  const surface = new TileGrid();
  for (let dy = -12; dy <= 12; dy++) {
    for (let dx = -12; dx <= 12; dx++) {
      surface.setTile(NX + dx, NY + dy, { terrain: TerrainType.Dirt, walkable: true });
    }
  }
  const underground = new UndergroundGrid();
  const nestId = createNest(world, NX, NY);
  const nest = world.getComponent<NestComponent>(nestId, COMPONENT.NEST)!;
  const transit = new TransitSystem(world, underground);
  const modifiers = createDefaultModifiers();
  const ai = new AntAISystem(world, surface, new VisibilityGrid(WORLD_WIDTH, WORLD_HEIGHT), modifiers);
  ai.setUndergroundAccess(underground, transit);
  const movement = new MovementSystem(world, surface, modifiers, underground);
  const porter = new PorterSystem(world, underground, surface, transit);

  function ant(x: number, y: number, state: AntState, role: AntRole = AntRole.Worker) {
    const id = createAnt(world, x, y, role);
    const a = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    a.state = state;
    a.stateTimer = 1;
    return { id, ant: a, carrying: world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)! };
  }

  return { world, ai, movement, transit, porter, underground, nest, ant };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mining', () => {
  it('a worker mines a field and delivers the ore to the minerals bank without touching the pantry', () => {
    const { world, ai, movement, transit, underground, nest, ant } = setup();
    const mineralId = createMineral(world, NX + 7, NY, 100);
    const mineral = world.getComponent<MineralComponent>(mineralId, COMPONENT.MINERAL)!;
    const { id, ant: a } = ant(NX + 2, NY, AntState.Mining);
    a.mineralTargetId = mineralId;
    const foodBefore = nest.foodStored;
    const pantryBefore = underground.getPantryStored().total;

    const seen = new Set<AntState>();
    for (let t = 0; t < 60 * 30 && world.minerals.stored === 0; t++) {
      ai.update(TICK);
      movement.update(TICK);
      seen.add(a.state);
      expect(transit.isInTransit(id)).toBe(false);
    }

    expect(world.minerals.stored).toBe(MINERAL_TRIP_AMOUNT);
    expect(mineral.amount).toBe(100 - MINERAL_TRIP_AMOUNT);
    expect(nest.foodStored).toBe(foodBefore);
    expect(underground.getPantryStored().total).toBe(pantryBefore);
    expect(seen.has(AntState.Hauling)).toBe(false);
  });

  it('a miner goes back to its field after a delivery', () => {
    const { world, ai, ant } = setup();
    const mineralId = createMineral(world, NX + 7, NY, 100);
    const { ant: a, carrying } = ant(NX, NY, AntState.ReturningHome);
    a.mineralTargetId = mineralId;
    carrying.amount = MINERAL_TRIP_AMOUNT;
    carrying.resourceType = ORE_LOAD;

    ai.update(TICK);

    expect(world.minerals.stored).toBe(MINERAL_TRIP_AMOUNT);
    expect(carrying.amount).toBe(0);
    expect(a.state).toBe(AntState.Mining);
  });

  it('a worker that sees a mineral field and no food chooses to mine it', () => {
    const { world, ai, ant } = setup();
    const mineralId = createMineral(world, NX + 4, NY, 100);
    const { ant: a } = ant(NX, NY, AntState.Searching);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    ai.update(TICK);

    expect(a.state).toBe(AntState.Mining);
    expect(a.mineralTargetId).toBe(mineralId);
  });

  it('only workers mine', () => {
    const { world, ai, ant } = setup();
    createMineral(world, NX + 4, NY, 100);
    const { ant: soldier } = ant(NX, NY, AntState.Searching, AntRole.Soldier);
    const { ant: scout } = ant(NX, NY, AntState.Searching, AntRole.Scout);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    ai.update(TICK);

    expect(soldier.state).not.toBe(AntState.Mining);
    expect(scout.state).not.toBe(AntState.Mining);
  });

  it('a depleted node disappears and its miner looks for other work', () => {
    const { world, ai, ant } = setup();
    const mineralId = createMineral(world, NX + 1, NY, MINERAL_TRIP_AMOUNT);
    const { ant: a, carrying } = ant(NX + 1, NY, AntState.Mining);
    a.mineralTargetId = mineralId;

    for (let t = 0; t < 60 * 5 && carrying.amount === 0; t++) ai.update(TICK);

    expect(carrying.resourceType).toBe(ORE_LOAD);
    expect(world.hasEntity(mineralId)).toBe(false);
  });
});

describe('ore is never food', () => {
  it('a starving worker never eats the ore it carries', () => {
    const world = new World();
    const hunger = new HungerSystem(world, createDefaultModifiers());
    const id = createAnt(world, 10, 10);
    const food = world.getComponent<HungerComponent>(id, COMPONENT.HUNGER)!;
    const load = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;
    food.current = food.max * 0.1;
    load.amount = MINERAL_TRIP_AMOUNT;
    load.resourceType = ORE_LOAD;

    hunger.update(0.5);

    expect(load.amount).toBe(MINERAL_TRIP_AMOUNT);
    expect(load.resourceType).toBe(ORE_LOAD);
  });

  it('a worker bringing ore home banks it instead of hauling it to the pantry', () => {
    const { world, ai, transit, underground, nest, ant } = setup();
    const { id, ant: a, carrying } = ant(NX, NY, AntState.ReturningHome);
    carrying.amount = MINERAL_TRIP_AMOUNT;
    carrying.resourceType = ORE_LOAD;
    const foodBefore = nest.foodStored;
    const pantryBefore = underground.getPantryStored().total;

    ai.update(TICK);

    expect(a.state).not.toBe(AntState.Hauling);
    expect(transit.isInTransit(id)).toBe(false);
    expect(world.minerals.stored).toBe(MINERAL_TRIP_AMOUNT);
    expect(nest.foodStored).toBe(foodBefore);
    expect(underground.getPantryStored().total).toBe(pantryBefore);
  });

  it('a lost miner keeps its ore past the return timeout instead of dropping it', () => {
    const { ai, ant } = setup();
    const { ant: a, carrying } = ant(NX + 10, NY, AntState.ReturningHome);
    carrying.amount = MINERAL_TRIP_AMOUNT;
    carrying.resourceType = ORE_LOAD;
    a.stateTimer = RETURNING_HOME_DROP_TIMEOUT + 1;

    ai.update(TICK);

    expect(carrying.amount).toBe(MINERAL_TRIP_AMOUNT);
    expect(carrying.resourceType).toBe(ORE_LOAD);
    expect(a.state).toBe(AntState.ReturningHome);
  });

  it('porters never recruit a worker carrying ore', () => {
    const { porter, nest, ant } = setup();
    nest.foodStored = 100;
    const { ant: a, carrying } = ant(NX + 3, NY, AntState.Searching);
    carrying.amount = MINERAL_TRIP_AMOUNT;
    carrying.resourceType = ORE_LOAD;

    porter.update(TICK);

    expect(a.state).toBe(AntState.Searching);
    expect(carrying.resourceType).toBe(ORE_LOAD);
    expect(carrying.amount).toBe(MINERAL_TRIP_AMOUNT);
  });

  it('ore that ends up below ground is never put in the pantry as leaves', () => {
    const { world, porter, transit, underground, ant } = setup();
    const { id, ant: a, carrying } = ant(NX, NY, AntState.Hauling);
    world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
    carrying.amount = MINERAL_TRIP_AMOUNT;
    carrying.resourceType = ORE_LOAD;
    const pantryBefore = underground.getPantryStored();

    for (let t = 0; t < 60; t++) porter.update(TICK);

    expect(underground.getPantryStored()).toEqual(pantryBefore);
    expect(carrying.resourceType).toBe(ORE_LOAD);
    expect(carrying.amount).toBe(MINERAL_TRIP_AMOUNT);
    expect(a.state).not.toBe(AntState.Hauling);
    expect(transit.isInTransit(id)).toBe(true); // riding back up to bank it
  });

  it('an idle worker below with ore is not sent to haul it into the pantry', () => {
    const { world, porter, underground, ant } = setup();
    const { id, ant: a, carrying } = ant(NX, NY, AntState.Idle);
    world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
    carrying.amount = MINERAL_TRIP_AMOUNT;
    carrying.resourceType = ORE_LOAD;
    const pantryBefore = underground.getPantryStored();

    for (let t = 0; t < 60; t++) porter.update(TICK);

    expect(a.state).not.toBe(AntState.Hauling);
    expect(underground.getPantryStored()).toEqual(pantryBefore);
    expect(carrying.amount).toBe(MINERAL_TRIP_AMOUNT);
  });
});
