import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../../engine/ecs/World';
import { GameManager } from '../GameManager';
import { createAnt, createBeetle, createFood, createNest, createQueen } from '../entities/factories';
import { AntRole, AntState, COMPONENT, FoodType, Layer, type AntComponent, type CarryingComponent, type CombatComponent, type FoodSourceComponent, type HealthComponent, type HungerComponent, type LayerValue, type NestComponent, type PositionComponent, type QueenEntityComponent } from '../components/components';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { EventSystem } from '../events/EventSystem';
import { HungerSystem } from '../systems/HungerSystem';
import { FoodRespawnSystem } from '../systems/FoodRespawnSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { ExcavationSystem } from '../systems/ExcavationSystem';
import { PorterSystem } from '../systems/PorterSystem';
import { TransitSystem } from '../systems/TransitSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { FogOfWarSystem } from '../systems/FogOfWarSystem';
import { RegenerationSystem } from '../systems/RegenerationSystem';
import { TileGrid } from '../../simulation/world/TileGrid';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { fakeCanvas } from '../../test/gameManagerMocks';
import { ANT_SPEED, BEETLE_MEAT_AMOUNT, BREED_COST_SOLDIER, BREED_COST_WORKER, EXCAVATION_TIME, FLANKING_BONUS_PER_ALLY, FOG_REVEAL_MULTIPLIER, FOOD_RESPAWN_INTERVAL, ROLE_STATS, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';

// Keep the actual manager constructor and simulation, replace browser-only adapters.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () =>
  (await import('../../test/gameManagerMocks')).mockRenderSystem());
// The intro-skip listeners hang off window and the canvas; node has neither.
vi.stubGlobal('window', new EventTarget());

function manager() {
  return new GameManager(fakeCanvas());
}

function get<T>(world: World, id: number, component: string): T {
  return world.getComponent<T>(id, component)!;
}

afterEach(() => vi.restoreAllMocks());

describe('mutation read sites', () => {
  it('retrofits living ants and newborns from base stats with integer soldier damage', () => {
    const game = manager();
    const world = game['world'];
    const worker = createAnt(world, 10, 10);
    const soldier = createAnt(world, 10, 10, AntRole.Soldier);
    const scout = createAnt(world, 10, 10, AntRole.Scout);
    world.addComponent(soldier, COMPONENT.COMBAT, { attackDamage: ROLE_STATS.soldier.damage });
    get<HealthComponent>(world, soldier, COMPONENT.HEALTH).current = 100;

    expect(game.applyMutation('acid_mandibles')).toBe(true);
    expect(get<HealthComponent>(world, soldier, COMPONENT.HEALTH).damage).toBe(11); // round(8 × 1.4)
    vi.spyOn(game as unknown as { deductMushrooms(cost: number): boolean }, 'deductMushrooms').mockReturnValue(true);
    game.purchaseUpgrade('damage');
    game.purchaseUpgrade('carry');
    game.applyMutation('acid_mandibles');
    game.applyMutation('titan_brood');
    game.applyMutation('cargo_sacs');
    game.applyMutation('regenerative_tissue');

    const soldierHealth = get<HealthComponent>(world, soldier, COMPONENT.HEALTH);
    expect(soldierHealth.damage).toBe(20); // round(8 × 1.25 × 1.4²)
    expect(get<CombatComponent>(world, soldier, COMPONENT.COMBAT).attackDamage).toBe(20);
    expect(soldierHealth.max).toBe(225);
    expect(soldierHealth.current).toBe(175); // the gained max HP is granted
    const newborn = createAnt(world, 10, 10, AntRole.Soldier);
    expect(get<HealthComponent>(world, newborn, COMPONENT.HEALTH)).toMatchObject({ damage: 20, max: 225, current: 225 });
    game.purchaseUpgrade('damage');
    expect(soldierHealth.damage).toBe(24); // round(8 × 1.5 × 1.96)
    expect(Number.isInteger(get<CombatComponent>(world, soldier, COMPONENT.COMBAT).attackDamage)).toBe(true);

    const carry = Math.round(ROLE_STATS.worker.carryCapacity * 1.25 * 1.5);
    expect(get<CarryingComponent>(world, worker, COMPONENT.CARRYING).maxCapacity).toBe(carry);
    expect(get<CarryingComponent>(world, createAnt(world, 10, 10), COMPONENT.CARRYING).maxCapacity).toBe(carry);
    const workerHunger = get<HungerComponent>(world, worker, COMPONENT.HUNGER);
    expect(workerHunger.max).toBe(850);
    expect(workerHunger.current).toBe(850);
    expect(get<HungerComponent>(world, scout, COMPONENT.HUNGER).max).toBe(680);
    expect(get<HealthComponent>(world, scout, COMPONENT.HEALTH)).toMatchObject({ damage: 0, max: ROLE_STATS.scout.health });
    expect(get<HungerComponent>(world, createAnt(world, 10, 10, AntRole.Nurse), COMPONENT.HUNGER).max).toBe(510);
    expect(game.getAppliedMutations()).toHaveLength(5);

    const fresh = manager();
    expect(fresh.getAppliedMutations()).toEqual([]);
    expect(fresh['world'].runModifiers.soldierDamageMult).toBe(1);
    expect(fresh['world'].runModifiers).not.toBe(world.runModifiers);
  });

  it('refuses a pick past max stacks without changing ants', () => {
    const game = manager();
    const world = game['world'];
    const soldier = createAnt(world, 10, 10, AntRole.Soldier);
    for (let i = 0; i < 3; i++) expect(game.applyMutation('titan_brood')).toBe(true);
    const health = { ...get<HealthComponent>(world, soldier, COMPONENT.HEALTH) };
    expect(game.applyMutation('titan_brood')).toBe(false);
    expect(get<HealthComponent>(world, soldier, COMPONENT.HEALTH)).toEqual(health);
    expect(game.getAppliedMutations()).toHaveLength(3);
  });

  it('charges the titan_brood soldier surcharge in both production queues', () => {
    const game = manager();
    const deduct = vi.spyOn(game as unknown as { deductFromStorage(cost: number): boolean }, 'deductFromStorage').mockReturnValue(true);
    game.applyMutation('titan_brood');
    game.applyMutation('titan_brood');
    expect(game.queueBreed(AntRole.Soldier)).toBe(true);
    expect(deduct).toHaveBeenLastCalledWith(BREED_COST_SOLDIER + 20);
    expect(game.queueBreed(AntRole.Worker)).toBe(true);
    expect(deduct).toHaveBeenLastCalledWith(BREED_COST_WORKER);
    const world = game['world'];
    const nest = get<NestComponent>(world, world.query(COMPONENT.NEST, COMPONENT.QUEEN)[0], COMPONENT.NEST);
    nest.foodStored = 100;
    expect(game.breedAnt(AntRole.Soldier)).toBe(true);
    expect(nest.foodStored).toBe(100 - BREED_COST_SOLDIER - 20);
  });

  it('registers regeneration in the manager loop', () => {
    const systems = manager()['world']['systems'] as Array<{ name: string }>;
    expect(systems.some(system => system.name === 'RegenerationSystem')).toBe(true);
  });

  it('composes movement mutations with role, carry and event modifiers across recalculation', () => {
    const world = new World();
    const modifiers = createDefaultModifiers();
    for (const id of ['hyper_metabolism', 'acid_mandibles', 'titan_brood', 'cargo_sacs'] as const) world.runModifiers.apply(id);
    const walker = (role: AntRole, y: number, load = 0) => {
      const id = createAnt(world, 10, y, role);
      get<CarryingComponent>(world, id, COMPONENT.CARRYING).amount = load;
      world.addComponent(id, COMPONENT.PATH, { waypoints: [{ x: 30, y }], currentIndex: 0 });
      return get<PositionComponent>(world, id, COMPONENT.POSITION);
    };
    const worker = walker(AntRole.Worker, 10);
    const soldier = walker(AntRole.Soldier, 20);
    const loaded = walker(AntRole.Worker, 30, 5);
    const movement = new MovementSystem(world, { isWalkable: () => true, getNeighbors: () => [], width: 100, height: 100 }, modifiers);
    modifiers.movementSpeedMultiplier = 2;
    movement.update(0.1);
    expect(worker.x - 10).toBeCloseTo(ANT_SPEED * 2 * 1.2 * 0.1);
    expect(soldier.x - 10).toBeCloseTo(ANT_SPEED * ROLE_STATS.soldier.speedMultiplier * 2 * 1.2 * 0.9 * 0.75 * 0.1);
    expect(loaded.x - 10).toBeCloseTo(ANT_SPEED * ROLE_STATS.worker.carrySpeedPenalty * 2 * 1.2 * 0.9 * 0.1);
    new EventSystem(world, new TileGrid(), modifiers).update(0);
    expect(modifiers.movementSpeedMultiplier).toBe(1);
    const previous = worker.x;
    movement.update(0.1);
    expect(worker.x - previous).toBeCloseTo(ANT_SPEED * 1.2 * 0.1);
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

  it('composes hunger decay mutations with events and survives event recalculation', () => {
    const world = new World();
    const modifiers = createDefaultModifiers();
    world.runModifiers.apply('hyper_metabolism');
    world.runModifiers.apply('carrion_gut');
    const hunger = get<HungerComponent>(world, createAnt(world, 10, 10), COMPONENT.HUNGER);
    const queen = get<QueenEntityComponent>(world, createQueen(world, 10, 10), COMPONENT.QUEEN_ENTITY);
    const start = hunger.current;
    const queenStart = queen.hunger;
    modifiers.hungerDecayMultiplier = 2;
    new HungerSystem(world, modifiers).update(1);
    expect(hunger.current).toBeCloseTo(start - hunger.decayRate * 2 * 1.25 * 0.7);
    expect(queen.hunger).toBeCloseTo(queenStart - queen.hungerDecay * 2 * 1.25 * 0.7);
    new EventSystem(world, new TileGrid(), modifiers).update(0);
    const previous = hunger.current;
    new HungerSystem(world, modifiers).update(1);
    expect(hunger.current).toBeCloseTo(previous - hunger.decayRate * 1.25 * 0.7);
  });

  it('regenerates every colony ant anywhere, stacking per pick, never past max or onto wildlife', () => {
    const world = new World();
    const system = new RegenerationSystem(world);
    const surface = get<HealthComponent>(world, createAnt(world, 10, 10), COMPONENT.HEALTH);
    const undergroundId = createAnt(world, 10, 10, AntRole.Soldier);
    world.addComponent(undergroundId, COMPONENT.LAYER, { layer: Layer.Underground });
    const underground = get<HealthComponent>(world, undergroundId, COMPONENT.HEALTH);
    const beetle = get<HealthComponent>(world, createBeetle(world, 10, 10), COMPONENT.HEALTH);
    surface.current = 10;
    underground.current = 10;
    beetle.current = 10;
    system.update(1);
    expect(surface.current).toBe(10);
    world.runModifiers.apply('regenerative_tissue');
    world.runModifiers.apply('regenerative_tissue');
    system.update(0.5);
    expect(surface.current).toBeCloseTo(11);
    expect(underground.current).toBeCloseTo(11);
    expect(beetle.current).toBe(10);
    surface.current = surface.max - 0.5;
    system.update(1);
    expect(surface.current).toBe(surface.max);
  });

  it('shortens excavation with both upgrades and bone_spurs', () => {
    const world = new World();
    const grid = new UndergroundGrid();
    const system = new ExcavationSystem(world, grid, new TransitSystem(world, grid));
    const id = createAnt(world, 10, 10);
    const ant = get<AntComponent>(world, id, COMPONENT.ANT);
    world.upgrades.digSpeedMult = 1.3;
    world.runModifiers.apply('bone_spurs');
    system['jobs'].push({ x: 11, y: 10, assignedTo: id });
    system['handleGoingToDigSite'](id, ant, 0);
    expect(ant.state).toBe(AntState.Excavating);
    expect(ant.stateTimer).toBeCloseTo(EXCAVATION_TIME / (1.3 * 1.3));
  });

  describe('combat', () => {
    function strike(world: World, layer: LayerValue, attackers: number, ant = true): number {
      const target = world.createEntity();
      world.addComponent(target, COMPONENT.POSITION, { x: 10, y: 10, prevX: 10, prevY: 10 });
      world.addComponent(target, COMPONENT.LAYER, { layer });
      world.addComponent(target, COMPONENT.HEALTH, { current: 1000, max: 1000, damage: 0 });
      for (let i = 0; i < attackers; i++) {
        const id = ant ? createAnt(world, 10, 10, AntRole.Soldier) : world.createEntity();
        if (!ant) world.addComponent(id, COMPONENT.POSITION, { x: 10, y: 10, prevX: 10, prevY: 10 });
        world.addComponent(id, COMPONENT.LAYER, { layer });
        world.addComponent(id, COMPONENT.COMBAT, { attackDamage: 10, attackRange: 2, attackCooldown: 1, attackTimer: 0, targetEntityId: target });
      }
      new CombatSystem(world, new TileGrid()).update(0);
      return 1000 - get<HealthComponent>(world, target, COMPONENT.HEALTH).current;
    }

    it('multiplies ant damage underground with bone_spurs only', () => {
      const world = new World();
      world.runModifiers.apply('bone_spurs');
      expect(strike(world, Layer.Underground, 1)).toBeCloseTo(15);
      expect(strike(world, Layer.Surface, 1)).toBeCloseTo(10);
      expect(strike(world, Layer.Underground, 1, false)).toBeCloseTo(10);
    });

    it('doubles the flanking bonus with hive_mind', () => {
      const world = new World();
      expect(strike(world, Layer.Surface, 2)).toBeCloseTo(2 * 10 * (1 + FLANKING_BONUS_PER_ALLY));
      world.runModifiers.apply('hive_mind');
      expect(strike(world, Layer.Surface, 2)).toBeCloseTo(2 * 10 * (1 + FLANKING_BONUS_PER_ALLY * 2));
    });

    it('drops +50% meat from kills with carrion_gut', () => {
      const world = new World();
      world.runModifiers.apply('carrion_gut');
      const beetle = createBeetle(world, 10, 10);
      get<HealthComponent>(world, beetle, COMPONENT.HEALTH).current = 1;
      const soldier = createAnt(world, 10, 10, AntRole.Soldier);
      world.addComponent(soldier, COMPONENT.COMBAT, { attackDamage: 10, attackRange: 2, attackCooldown: 1, attackTimer: 0, targetEntityId: beetle });
      new CombatSystem(world, new TileGrid()).update(0);
      const meat = world.query(COMPONENT.FOOD_SOURCE).map(id => get<FoodSourceComponent>(world, id, COMPONENT.FOOD_SOURCE).amount);
      expect(meat).toEqual([Math.round(BEETLE_MEAT_AMOUNT * 1.5)]);
    });
  });

  it('widens scout fog reveal with wing_stubs and leaves other roles alone', () => {
    const world = new World();
    world.runModifiers.apply('wing_stubs');
    const grid = new VisibilityGrid(WORLD_WIDTH, WORLD_HEIGHT);
    const reveal = vi.spyOn(grid, 'revealCircle');
    createAnt(world, 10, 10, AntRole.Scout);
    createAnt(world, 30, 30);
    const fog = new FogOfWarSystem(world, grid);
    fog.update(0);
    fog.update(0);
    expect(reveal).toHaveBeenCalledWith(10, 10, Math.ceil(ROLE_STATS.scout.visionRange * 1.5 * FOG_REVEAL_MULTIPLIER));
    expect(reveal).toHaveBeenCalledWith(30, 30, Math.ceil(ROLE_STATS.worker.visionRange * FOG_REVEAL_MULTIPLIER));
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

  it('adds one invader per spore_bloom stack to each wave', () => {
    const waveSize = (stacks: number) => {
      const game = manager();
      for (let i = 0; i < stacks; i++) game.applyMutation('spore_bloom');
      const invasion = game['invasionSystem'];
      invasion['launchWave']();
      return invasion['invaders'].size + invasion['pendingSpawns'];
    };
    expect(waveSize(0)).toBe(1);
    expect(waveSize(2)).toBe(3);
  });

  describe('porter loads', () => {
    function porterSetup() {
      const world = new World();
      const grid = new UndergroundGrid();
      vi.spyOn(grid, 'hasDepositSpace').mockReturnValue(true);
      const transit = new TransitSystem(world, grid);
      vi.spyOn(transit, 'requestTransit').mockImplementation(() => {});
      vi.spyOn(transit, 'isInTransit').mockReturnValue(false);
      const system = new PorterSystem(world, grid, new TileGrid(), transit);
      world.runModifiers.apply('cargo_sacs');
      const nest = get<NestComponent>(world, createNest(world, 10, 10), COMPONENT.NEST);
      const id = createAnt(world, 10, 10);
      return { world, system, nest, id, ant: get<AntComponent>(world, id, COMPONENT.ANT), carrying: get<CarryingComponent>(world, id, COMPONENT.CARRYING) };
    }

    it('fetches exactly the cargo_sacs capacity from the nest stockpile', () => {
      const { system, nest, ant, carrying } = porterSetup();
      nest.foodStored = 100;
      ant.state = AntState.FetchingFood;
      system.update(0);
      expect(carrying.maxCapacity).toBe(Math.round(ROLE_STATS.worker.carryCapacity * 1.5));
      expect(carrying.amount).toBe(carrying.maxCapacity);
    });

    it('never picks up more loose meat than the carrying capacity', () => {
      const { world, system, nest, id, ant, carrying } = porterSetup();
      world.addComponent(id, COMPONENT.LAYER, { layer: Layer.Underground });
      ant.state = AntState.Scavenging;
      const food = get<FoodSourceComponent>(world, createFood(world, 10, 10, 100, FoodType.BeetleMeat, Layer.Underground), COMPONENT.FOOD_SOURCE);
      system['handleScavenging'](id, ant, nest, 0);
      expect(carrying.maxCapacity).toBe(Math.round(ROLE_STATS.worker.carryCapacity * 1.5));
      expect(100 - food.amount).toBe(carrying.maxCapacity);
    });
  });
});
