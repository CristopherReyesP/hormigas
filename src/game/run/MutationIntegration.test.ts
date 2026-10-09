import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../../engine/ecs/World';
import { GameManager } from '../GameManager';
import { createAnt, createNest, createQueen } from '../entities/factories';
import { AntRole, AntState, COMPONENT, Layer, type AntComponent, type CarryingComponent, type HealthComponent, type HungerComponent, type QueenEntityComponent, type PositionComponent, type NestComponent } from '../components/components';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { EventSystem } from '../events/EventSystem';
import { HungerSystem } from '../systems/HungerSystem';
import { FoodRespawnSystem } from '../systems/FoodRespawnSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { ExcavationSystem } from '../systems/ExcavationSystem';
import { PorterSystem } from '../systems/PorterSystem';
import { UndergroundHealingSystem } from '../systems/UndergroundHealingSystem';
import { TransitSystem } from '../systems/TransitSystem';
import { TileGrid } from '../../simulation/world/TileGrid';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { ANT_SPEED, EXCAVATION_TIME, FOOD_RESPAWN_INTERVAL, HEAL_RATE, ROLE_STATS } from '../../shared/constants';

// Keep the actual manager constructor and simulation, replace browser-only adapters.
vi.mock('../../engine/input/InputManager', () => ({ InputManager: class {
  setCamera() {} onKeyAction() {} onCanvasClick() {}
} }));
vi.mock('../systems/RenderSystem', () => ({ RenderSystem: class {
  setCamera() {} setUndergroundContext() {} setDayPhaseProvider() {}
  setFarmStatusProvider() {} invalidateTerrain() {}
} }));

function manager() {
  return new GameManager({ getContext: () => ({}) } as unknown as HTMLCanvasElement);
}

afterEach(() => vi.restoreAllMocks());

describe('mutation read sites', () => {
  it('retrofits living workers and soldiers, composes upgrades, and starts each manager clean', () => {
    const game = manager();
    const world = game['world'];
    const worker = createAnt(world, 10, 10);
    const soldier = createAnt(world, 10, 10, AntRole.Soldier);
    const scout = createAnt(world, 10, 10, AntRole.Scout);
    world.addComponent(soldier, COMPONENT.COMBAT, { attackDamage: ROLE_STATS.soldier.damage });
    game.applyMutation('cargo_sacs');
    game.applyMutation('acid_mandibles');
    vi.spyOn(game as unknown as { deductMushrooms(cost: number): boolean }, 'deductMushrooms').mockReturnValue(true);
    game.purchaseUpgrade('carry');
    game.purchaseUpgrade('damage');
    game.applyMutation('cargo_sacs');
    game.applyMutation('acid_mandibles');
    const newborn = createAnt(world, 10, 10, AntRole.Soldier);
    const expectedDamage = ROLE_STATS.soldier.damage * 1.25 * 1.25 ** 2;
    expect(world.getComponent<HealthComponent>(soldier, COMPONENT.HEALTH)!.damage).toBeCloseTo(expectedDamage);
    expect(world.getComponent<{ attackDamage: number }>(soldier, COMPONENT.COMBAT)!.attackDamage).toBeCloseTo(expectedDamage);
    expect(world.getComponent<HealthComponent>(newborn, COMPONENT.HEALTH)!.damage).toBeCloseTo(expectedDamage);
    expect(world.getComponent<CarryingComponent>(worker, COMPONENT.CARRYING)!.maxCapacity).toBe(Math.round(ROLE_STATS.worker.carryCapacity * 1.25) + 2);
    const newWorker = createAnt(world, 10, 10);
    expect(world.getComponent<CarryingComponent>(newWorker, COMPONENT.CARRYING)!.maxCapacity).toBe(world.getComponent<CarryingComponent>(worker, COMPONENT.CARRYING)!.maxCapacity);
    expect(world.getComponent<HealthComponent>(scout, COMPONENT.HEALTH)!.damage).toBe(ROLE_STATS.scout.damage);
    expect(game.getAppliedMutations()).toHaveLength(4);
    const fresh = manager();
    expect(fresh.getAppliedMutations()).toEqual([]);
    expect(fresh['world'].runModifiers.soldierDamageMult).toBe(1);
    expect(fresh['world'].runModifiers).not.toBe(world.runModifiers);
  });

  it('composes movement and hunger with events and survives event recalculation', () => {
    const world = new World();
    const grid = new TileGrid();
    const modifiers = createDefaultModifiers();
    world.runModifiers.apply('hyper_metabolism');
    world.runModifiers.apply('iron_stomach');
    const ant = createAnt(world, 10, 10);
    const queen = createQueen(world, 10, 10);
    const hunger = world.getComponent<HungerComponent>(ant, COMPONENT.HUNGER)!;
    const queenData = world.getComponent<QueenEntityComponent>(queen, COMPONENT.QUEEN_ENTITY)!;
    const initialHunger = hunger.current;
    const initialQueenHunger = queenData.hunger;
    modifiers.hungerDecayMultiplier = 2;
    new HungerSystem(world, modifiers).update(1);
    expect(hunger.current).toBeCloseTo(initialHunger - hunger.decayRate * 2 * 0.75);
    expect(queenData.hunger).toBeCloseTo(initialQueenHunger - queenData.hungerDecay * 2 * 0.75);
    modifiers.movementSpeedMultiplier = 2;
    world.addComponent(ant, COMPONENT.PATH, { waypoints: [{ x: 20, y: 10 }], currentIndex: 0 });
    const movement = new MovementSystem(world, { isWalkable: () => true, getNeighbors: () => [], width: 100, height: 100 }, modifiers);
    movement.update(0.1);
    const pos = world.getComponent<PositionComponent>(ant, COMPONENT.POSITION)!;
    expect(pos.x - 10).toBeCloseTo(ANT_SPEED * ROLE_STATS.worker.speedMultiplier * 2 * 1.15 * 0.1);
    new EventSystem(world, grid, modifiers).update(0);
    expect(modifiers.movementSpeedMultiplier).toBe(1);
    const previous = pos.x;
    movement.update(0.1);
    expect(pos.x - previous).toBeCloseTo(ANT_SPEED * ROLE_STATS.worker.speedMultiplier * 1.15 * 0.1);
    const previousHunger = hunger.current;
    new HungerSystem(world, modifiers).update(1);
    expect(hunger.current).toBeCloseTo(previousHunger - hunger.decayRate * 0.75);
  });

  it('does not grant swarm movement mutations to wildlife', () => {
    const world = new World();
    world.runModifiers.apply('hyper_metabolism');
    const wildlife = world.createEntity();
    const position = { x: 10, y: 10, prevX: 10, prevY: 10 };
    world.addComponent(wildlife, COMPONENT.POSITION, position);
    world.addComponent(wildlife, COMPONENT.PATH, { waypoints: [{ x: 20, y: 10 }], currentIndex: 0 });
    const grid = { isWalkable: () => true, getNeighbors: () => [], width: 100, height: 100 };
    new MovementSystem(world, grid, createDefaultModifiers()).update(0.1);
    expect(position.x - 10).toBeCloseTo(ANT_SPEED * 0.1);
  });

  it('shortens excavation with both upgrades and mutations', () => {
    const world = new World();
    const grid = new UndergroundGrid();
    const system = new ExcavationSystem(world, grid, new TransitSystem(world, grid));
    const id = createAnt(world, 10, 10);
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    world.upgrades.digSpeedMult = 1.3;
    world.runModifiers.apply('burrowing_claws');
    system['jobs'].push({ x: 11, y: 10, assignedTo: id });
    system['handleGoingToDigSite'](id, ant, 0);
    expect(ant.state).toBe(AntState.Excavating);
    expect(ant.stateTimer).toBeCloseTo(EXCAVATION_TIME / (1.3 * 1.35));
  });

  it('increases porter loads without increasing ordinary worker carry capacity', () => {
    const world = new World();
    const grid = new UndergroundGrid();
    vi.spyOn(grid, 'hasDepositSpace').mockReturnValue(true);
    const transit = new TransitSystem(world, grid);
    vi.spyOn(transit, 'requestTransit').mockImplementation(() => {});
    const system = new PorterSystem(world, grid, new TileGrid(), transit);
    world.runModifiers.apply('titan_backs');
    const id = createAnt(world, 10, 10);
    const nestId = createNest(world, 10, 10);
    const nest = world.getComponent<NestComponent>(nestId, COMPONENT.NEST)!;
    nest.foodStored = 100;
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    ant.state = AntState.FetchingFood;
    system.update(0);
    const carrying = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;
    expect(carrying.amount).toBe(ROLE_STATS.worker.carryCapacity + 1);
    expect(carrying.maxCapacity).toBe(ROLE_STATS.worker.carryCapacity);
  });

  it.each([false, true])('increases underground healing from food (loose=%s)', loose => {
    const world = new World();
    const grid = new UndergroundGrid();
    const system = new UndergroundHealingSystem(world, grid, new TransitSystem(world, grid));
    const id = createAnt(world, 10.5, 10.5);
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    ant.state = AntState.Healing;
    world.addComponent(id, COMPONENT.LAYER, { layer: Layer.Underground });
    world.removeComponent(id, COMPONENT.HUNGER);
    const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
    health.current = 1;
    world.upgrades.healRateMult = 1.5;
    world.runModifiers.apply('regenerative_tissue');
    vi.spyOn(grid, 'findPreferredFetchTile').mockReturnValue(loose ? null : { x: 10, y: 10 });
    vi.spyOn(grid, 'takeFood').mockImplementation((_x, _y, amount) => ({ taken: amount, type: 'leaf' }));
    if (loose) {
      const food = world.createEntity();
      world.addComponent(food, COMPONENT.POSITION, { x: 10.5, y: 10.5 });
      world.addComponent(food, COMPONENT.LAYER, { layer: Layer.Underground });
      world.addComponent(food, COMPONENT.FOOD_SOURCE, { amount: 100 });
    }
    system.update(0.1);
    expect(health.current).toBeCloseTo(1 + HEAL_RATE * 1.5 * 1.4 * 0.1);
  });

  it('speeds food respawn multiplicatively with event modifiers', () => {
    const world = new World();
    const modifiers = createDefaultModifiers();
    modifiers.foodSpawnMultiplier = 2;
    world.runModifiers.apply('spore_bloom');
    const system = new FoodRespawnSystem(world, new TileGrid(), modifiers);
    const spawn = vi.spyOn(system as unknown as { spawnFoodCluster(): void }, 'spawnFoodCluster').mockImplementation(() => {});
    vi.spyOn(system as unknown as { spawnGiantMushroom(): void }, 'spawnGiantMushroom').mockImplementation(() => {});
    const interval = FOOD_RESPAWN_INTERVAL / (2 * 1.3);
    system.update(interval - 0.001);
    expect(spawn).not.toHaveBeenCalled();
    system.update(0.002);
    expect(spawn).toHaveBeenCalledOnce();
  });
});
