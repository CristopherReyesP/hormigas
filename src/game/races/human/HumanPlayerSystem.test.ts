import { describe, expect, it } from 'vitest';
import { World } from '../../../engine/ecs/World';
import { TileGrid } from '../../../simulation/world/TileGrid';
import { TerrainType } from '../../../simulation/world/types';
import { createDefaultModifiers } from '../../events/GlobalModifiers';
import { createBeetle, createMineral } from '../../entities/factories';
import { COMPONENT, type CombatComponent, type HealthComponent, type MineralComponent, type PositionComponent } from '../../components/components';
import { FactionId, ownerOf } from '../../factions/factions';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../../shared/constants';
import { MovementSystem } from '../../systems/MovementSystem';
import { HUMAN_BUILDING_STATS, HUMAN_UNIT_STATS } from '../../rival/humanBase';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent } from '../../rival/humanComponents';
import { HumanPlayerSystem } from './HumanPlayerSystem';
import { createPlayerHumanBuilding, createPlayerHumanUnit, spawnHumanPlayerStart } from './humanPlayerFactories';
import { HUMAN_GATHER, PLAYER_BUILD_COST, PLAYER_HUMAN_START, PLAYER_TRAIN_COST, placementProblem } from './humanPlayerRules';
import { placementWorldOf } from './humanPlayerQueries';
import { HUMAN_PLAYER_COMPONENT, type HumanProducerComponent, type HumanWorkerComponent } from './humanPlayerComponents';

const CX = Math.floor(WORLD_WIDTH / 2);
const CY = Math.floor(WORLD_HEIGHT / 2);
const TICK = 1 / 30;

function openGrid(): TileGrid {
  const surface = new TileGrid();
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) surface.setTile(x, y, { terrain: TerrainType.Dirt, walkable: true });
  }
  return surface;
}

function setup() {
  const world = new World();
  const grid = openGrid();
  const start = spawnHumanPlayerStart(world, grid, { x: CX, y: CY }, { homeField: false });
  const system = new HumanPlayerSystem(world, grid);
  const movement = new MovementSystem(world, grid, createDefaultModifiers());
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / TICK); i++) {
      system.update(TICK);
      movement.update(TICK);
    }
  };
  const units = (type?: string) => world.query(HUMAN_COMPONENT.UNIT).filter(
    (id) => type === undefined || world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type === type,
  );
  return { world, grid, start, system, run, units };
}

describe('the Human expedition start', () => {
  it('lands a player command center at the center with two builders and two soldiers, and no nest or queen', () => {
    const { world, start, units } = setup();
    const core = world.getComponent<HumanBuildingComponent>(start.coreId, HUMAN_COMPONENT.BUILDING)!;
    expect(core.kind).toBe('command_center');
    expect(core.constructing).toBe(0);
    expect(ownerOf(world, start.coreId)).toBe(FactionId.PLAYER);
    const pos = world.getComponent<PositionComponent>(start.coreId, COMPONENT.POSITION)!;
    expect([pos.x, pos.y]).toEqual([CX, CY]);
    expect(units('builder')).toHaveLength(PLAYER_HUMAN_START.builders);
    expect(units('soldier')).toHaveLength(PLAYER_HUMAN_START.soldiers);
    for (const id of units()) expect(ownerOf(world, id)).toBe(FactionId.PLAYER);
    expect(world.query(COMPONENT.NEST)).toHaveLength(0);
    expect(world.query(COMPONENT.QUEEN_ENTITY)).toHaveLength(0);
  });

  it('banks the starting rations and minerals', () => {
    const { world, system } = setup();
    expect(system.stock().rations).toBe(PLAYER_HUMAN_START.rations);
    expect(world.minerals.stored).toBe(PLAYER_HUMAN_START.minerals);
  });

  it('can drop a home mineral field near the command center, clear of its footprint', () => {
    const world = new World();
    const grid = openGrid();
    spawnHumanPlayerStart(world, grid, { x: CX, y: CY });
    const nodes = world.query(COMPONENT.MINERAL);
    expect(nodes.length).toBeGreaterThanOrEqual(4);
    for (const id of nodes) {
      const p = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const d = Math.hypot(p.x - CX, p.y - CY);
      expect(d).toBeGreaterThan(HUMAN_BUILDING_STATS.command_center.halfWidth + 2);
      expect(d).toBeLessThan(12);
    }
  });
});

describe('the Human start\'s Cuartel', () => {
  it('stands finished beside the command center, on a tile the placement rules accept', () => {
    const world = new World();
    const grid = openGrid();
    const start = spawnHumanPlayerStart(world, grid, { x: CX, y: CY });
    expect(start.barracksId).not.toBeNull();
    const barracks = world.getComponent<HumanBuildingComponent>(start.barracksId!, HUMAN_COMPONENT.BUILDING)!;
    expect(barracks.kind).toBe('barracks');
    expect(barracks.constructing).toBe(0);
    expect(ownerOf(world, start.barracksId!)).toBe(FactionId.PLAYER);
    expect(world.getComponent(start.barracksId!, HUMAN_PLAYER_COMPONENT.PRODUCER)).toBeDefined();
    const pos = world.getComponent<PositionComponent>(start.barracksId!, COMPONENT.POSITION)!;
    // Close to the command center: a short walk, on screen with it
    expect(Math.hypot(pos.x - CX, pos.y - CY)).toBeLessThanOrEqual(8);
    // Valid by the same rules a builder's Construir uses (the Cuartel itself left out)
    const map = placementWorldOf(world, grid, [start.barracksId!]);
    expect(placementProblem('barracks', { x: pos.x, y: pos.y }, map)).toBeNull();
    // No starting unit stands inside its footprint
    for (const id of [...start.builders, ...start.soldiers]) {
      const u = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      expect(Math.max(Math.abs(u.x - pos.x), Math.abs(u.y - pos.y))).toBeGreaterThan(HUMAN_BUILDING_STATS.barracks.halfWidth);
    }
  });

  it('pays for the free Cuartel out of the starting minerals', () => {
    expect(PLAYER_HUMAN_START.minerals).toBe(50);
    expect(PLAYER_HUMAN_START.minerals).toBeLessThan(PLAYER_BUILD_COST.barracks.minerals);
  });

  it('can be left out', () => {
    const world = new World();
    const start = spawnHumanPlayerStart(world, openGrid(), { x: CX, y: CY }, { homeField: false, barracks: false });
    expect(start.barracksId).toBeNull();
  });
});

describe('the Human economy', () => {
  it('earns rations from the command center, more with a finished supply depot', () => {
    const { world, system, run } = setup();
    const before = system.stock().rations;
    run(10);
    const base = system.stock().rations - before;
    expect(base).toBeGreaterThan(15);
    createPlayerHumanBuilding(world, 'supply_depot', CX + 6, CY);
    const mid = system.stock().rations;
    run(10);
    expect(system.stock().rations - mid).toBeGreaterThan(base);
  });

  it('a builder sent to a mineral node mines it and brings the minerals back to the command center', () => {
    const { world, system, run, units } = setup();
    const node = createMineral(world, CX + 8, CY);
    const builder = units('builder')[0];
    const before = world.minerals.stored;
    expect(system.orderGather([builder], node)).toBe(1);
    run(30);
    expect(world.minerals.stored).toBeGreaterThan(before);
    expect((world.minerals.stored - before) % HUMAN_GATHER.tripAmount).toBe(0);
    const left = world.getComponent<MineralComponent>(node, COMPONENT.MINERAL)!;
    expect(left.amount).toBeLessThan(left.maxAmount);
    // Ore is never counted as rations
    expect(Number.isFinite(system.stock().rations)).toBe(true);
  });

  it('moves on to the next node when one runs dry', () => {
    const { world, system, run, units } = setup();
    const small = createMineral(world, CX + 7, CY, HUMAN_GATHER.tripAmount);
    const next = createMineral(world, CX + 8, CY + 1);
    const builder = units('builder')[0];
    system.orderGather([builder], small);
    run(40);
    expect(world.hasEntity(small)).toBe(false);
    const worker = world.getComponent<HumanWorkerComponent>(builder, HUMAN_PLAYER_COMPONENT.WORKER)!;
    expect(worker.nodeId).toBe(next);
  });
});

describe('Human construction', () => {
  it('placing a building pays its minerals, lays a frame and the builder raises it over its build time', () => {
    const { world, system, run, units } = setup();
    world.minerals.deposit(500);
    const minerals = world.minerals.stored;
    const builder = units('builder')[0];
    const result = system.placeBuilding([builder], 'barracks', { x: CX + 7, y: CY + 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(world.minerals.stored).toBe(minerals - PLAYER_BUILD_COST.barracks.minerals);
    const frame = world.getComponent<HumanBuildingComponent>(result.buildingId, HUMAN_COMPONENT.BUILDING)!;
    expect(frame.constructing).toBe(HUMAN_BUILDING_STATS.barracks.buildTime);
    expect(ownerOf(world, result.buildingId)).toBe(FactionId.PLAYER);
    run(HUMAN_BUILDING_STATS.barracks.buildTime * 0.5);
    expect(frame.constructing).toBeGreaterThan(0);
    run(HUMAN_BUILDING_STATS.barracks.buildTime * 0.7 + 6);
    expect(frame.constructing).toBe(0);
    const hp = world.getComponent<HealthComponent>(result.buildingId, COMPONENT.HEALTH)!;
    expect(hp.current).toBeCloseTo(hp.max, 0);
  });

  it('refuses a spot that is blocked or a building the bank cannot pay, and charges nothing', () => {
    const { world, system, units, start } = setup();
    const builder = units('builder')[0];
    const core = world.getComponent<PositionComponent>(start.coreId, COMPONENT.POSITION)!;
    world.minerals.deposit(1000);
    const onCore = system.placeBuilding([builder], 'bunker', { x: core.x, y: core.y });
    expect(onCore.ok).toBe(false);
    const poor = setup();
    poor.world.minerals.spend(poor.world.minerals.stored);
    const standing = poor.world.query(HUMAN_COMPONENT.BUILDING).length;
    const broke = poor.system.placeBuilding([poor.units('builder')[0]], 'factory', { x: CX + 8, y: CY });
    expect(broke).toMatchObject({ ok: false });
    expect(poor.world.query(HUMAN_COMPONENT.BUILDING)).toHaveLength(standing);
  });

  it('a second builder helps and finishes the frame sooner', () => {
    const time = (helpers: number) => {
      const { world, system, run, units } = setup();
      world.minerals.deposit(500);
      const builders = units('builder');
      const result = system.placeBuilding([builders[0]], 'supply_depot', { x: CX + 5, y: CY + 4 });
      if (!result.ok) throw new Error(result.reason);
      if (helpers > 1) system.orderBuild([builders[1]], result.buildingId);
      const frame = world.getComponent<HumanBuildingComponent>(result.buildingId, HUMAN_COMPONENT.BUILDING)!;
      let t = 0;
      while (frame.constructing > 0 && t < 120) {
        run(0.5);
        t += 0.5;
      }
      return t;
    };
    expect(time(2)).toBeLessThan(time(1) * 0.8);
  });
});

describe('Human production', () => {
  function withBarracks() {
    const ctx = setup();
    const barracks = createPlayerHumanBuilding(ctx.world, 'barracks', CX + 6, CY);
    return { ...ctx, barracks };
  }

  it('a barracks trains a soldier after its train time, paid in rations up front', () => {
    const { system, barracks, run, units, world } = withBarracks();
    const rations = system.stock().rations;
    expect(system.train(barracks, 'soldier')).toBeNull();
    expect(system.stock().rations).toBe(rations - PLAYER_TRAIN_COST.soldier.rations);
    const producer = world.getComponent<HumanProducerComponent>(barracks, HUMAN_PLAYER_COMPONENT.PRODUCER)!;
    expect(producer.queue).toEqual(['soldier']);
    run(HUMAN_UNIT_STATS.soldier.trainTime - 1);
    expect(units('soldier')).toHaveLength(2);
    run(1.5);
    expect(units('soldier')).toHaveLength(3);
    expect(producer.queue).toEqual([]);
  });

  it('respects the supply cap: no training past it, a supply depot raises it', () => {
    const { system, barracks, world } = withBarracks();
    system.addRations(10_000);
    const cap = system.status().supplyCap;
    let queued = 0;
    while (system.train(barracks, 'soldier') === null && queued < 20) queued++;
    // Start: 2 builders + 2 soldiers, five per queue
    expect(system.status().supply).toBeLessThanOrEqual(cap);
    expect(queued).toBe(Math.min(5, cap - 4));
    expect(system.train(barracks, 'soldier')).toMatch(/suministro|cola/i);
    createPlayerHumanBuilding(world, 'supply_depot', CX - 6, CY);
    expect(system.status().supplyCap).toBeGreaterThan(cap);
  });

  it('refuses what the building cannot train and what the bank cannot pay', () => {
    const { system, barracks, start } = withBarracks();
    expect(system.train(barracks, 'tank')).toMatch(/fábrica/i);
    expect(system.train(start.coreId, 'builder')).toBeNull();
    system.addRations(-system.stock().rations);
    expect(system.train(barracks, 'soldier')).toMatch(/raciones/i);
  });

  it('sends new units to the rally point', () => {
    const { system, barracks, run, units, world } = withBarracks();
    system.setRally(barracks, { x: CX + 14, y: CY + 6 });
    system.train(barracks, 'soldier');
    run(HUMAN_UNIT_STATS.soldier.trainTime + 0.5);
    const fresh = units('soldier').sort((a, b) => b - a)[0];
    const order = world.getComponent<{ target: { x: number; y: number } }>(fresh, COMPONENT.PLAYER_ORDER);
    expect(order).toBeDefined();
    expect(Math.hypot(order!.target.x - (CX + 14), order!.target.y - (CY + 6))).toBeLessThan(3);
  });

  it('a frame under construction trains nothing', () => {
    const { world, system } = setup();
    const frame = createPlayerHumanBuilding(world, 'barracks', CX + 6, CY, true);
    expect(system.train(frame, 'soldier')).toMatch(/construcci/i);
  });
});

describe('player bunkers', () => {
  it('shoot hostile units in range on their own, wildlife included', () => {
    const { world, system } = setup();
    const bunker = createPlayerHumanBuilding(world, 'bunker', CX + 6, CY);
    const beetle = createBeetle(world, CX + 9, CY);
    system.update(TICK);
    expect(world.getComponent<CombatComponent>(bunker, COMPONENT.COMBAT)!.targetEntityId).toBe(beetle);
  });

  it('a soldier made for the player is the player\'s, with armor', () => {
    const { world } = setup();
    const id = createPlayerHumanUnit(world, 'soldier', CX, CY + 3);
    expect(ownerOf(world, id)).toBe(FactionId.PLAYER);
  });
});
