import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { TileGrid } from '../../simulation/world/TileGrid';
import { CreepGrid } from '../../simulation/world/CreepGrid';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { createNest } from '../entities/factories';
import { AntRole, AntState, COMPONENT, Layer, type AntComponent, type HealthComponent, type PositionComponent } from '../components/components';
import { CREEP_BASE_RADIUS, CREEP_MAX_RADIUS, CREEP_SOLID, CREEP_SPEED_MULT, CREEP_UPDATE_SECONDS } from '../../shared/constants';
import { CreepSystem, creepRadius } from './CreepSystem';
import { MovementSystem } from './MovementSystem';

function setup() {
  const world = new World();
  const grid = new TileGrid();
  // Flat walkable ground, so the test does not depend on the random terrain
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) grid.setTile(x, y, { walkable: true, terrain: 'dirt' });
  }
  const creep = new CreepGrid(grid.width, grid.height);
  const system = new CreepSystem(world, grid, creep);
  return { world, grid, creep, system };
}

function ant(world: World, x: number, y: number, health = 80): number {
  const id = world.createEntity();
  world.addComponent<PositionComponent>(id, COMPONENT.POSITION, { x, y, prevX: x, prevY: y });
  world.addComponent<AntComponent>(id, COMPONENT.ANT, { role: AntRole.Worker, state: AntState.Idle, stateTimer: 0, commandTargetId: null });
  world.addComponent(id, COMPONENT.LAYER, { layer: Layer.Surface });
  world.addComponent<HealthComponent>(id, COMPONENT.HEALTH, { current: health, max: 80, damage: 3 });
  return id;
}

describe('mycelium creep', () => {
  it('reaches farther as the colony grows, up to a cap', () => {
    expect(creepRadius(0)).toBe(CREEP_BASE_RADIUS);
    expect(creepRadius(8)).toBeGreaterThan(creepRadius(0));
    expect(creepRadius(10_000)).toBe(CREEP_MAX_RADIUS);
  });

  it('spreads out from the nest a ring at a time', () => {
    const { world, creep, system } = setup();
    createNest(world, 60, 45);
    system.update(CREEP_UPDATE_SECONDS);
    expect(creep.get(60, 45)).toBeGreaterThan(0);
    expect(creep.get(60 + CREEP_BASE_RADIUS - 1, 45)).toBe(0);

    system.settle();
    expect(creep.isCreepAt(60 + CREEP_BASE_RADIUS - 1, 45)).toBe(true);
    expect(creep.get(60 + CREEP_BASE_RADIUS + 3, 45)).toBe(0);
  });

  it('never grows over rock or water', () => {
    const { world, grid, creep, system } = setup();
    grid.setTile(61, 45, { walkable: false, terrain: 'stone' });
    grid.setTile(59, 45, { walkable: true, terrain: 'water' });
    createNest(world, 60, 45);
    system.settle();
    expect(creep.get(61, 45)).toBe(0);
    expect(creep.get(59, 45)).toBe(0);
  });

  it('recedes once the nest is gone', () => {
    const { world, creep, system } = setup();
    const nest = createNest(world, 60, 45);
    system.settle();
    world.destroyEntity(nest);
    system.settle();
    expect(creep.get(60, 45)).toBe(0);
  });

  it('heals colony ants standing on it, not off it', () => {
    const { world, system } = setup();
    createNest(world, 60, 45);
    system.settle();
    const onCreep = ant(world, 61, 45, 40);
    const offCreep = ant(world, 100, 80, 40);
    system.update(1);
    expect(world.getComponent<HealthComponent>(onCreep, COMPONENT.HEALTH)!.current).toBeGreaterThan(40);
    expect(world.getComponent<HealthComponent>(offCreep, COMPONENT.HEALTH)!.current).toBe(40);
  });

  it('speeds up colony ants that walk on it', () => {
    const { world, grid, creep } = setup();
    for (let x = 10; x <= 20; x++) creep.coverage[45 * creep.width + x] = 255;
    const movement = new MovementSystem(world, grid, createDefaultModifiers());
    movement.setCreep(creep);
    const fast = ant(world, 10, 45);
    const slow = ant(world, 10, 60);
    world.addComponent(fast, COMPONENT.PATH, { waypoints: [{ x: 20, y: 45 }], currentIndex: 0 });
    world.addComponent(slow, COMPONENT.PATH, { waypoints: [{ x: 20, y: 60 }], currentIndex: 0 });
    movement.update(0.5);
    const fastX = world.getComponent<PositionComponent>(fast, COMPONENT.POSITION)!.x - 10;
    const slowX = world.getComponent<PositionComponent>(slow, COMPONENT.POSITION)!.x - 10;
    expect(fastX / slowX).toBeCloseTo(CREEP_SPEED_MULT, 5);
  });

  it('counts a tile as creep from CREEP_SOLID coverage', () => {
    const creep = new CreepGrid(4, 4);
    creep.coverage[5] = CREEP_SOLID - 1;
    expect(creep.isCreepAt(1, 1)).toBe(false);
    creep.coverage[5] = CREEP_SOLID;
    expect(creep.isCreepAt(1.3, 0.8)).toBe(true);
  });
});
