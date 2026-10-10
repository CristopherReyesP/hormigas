import { describe, expect, it } from 'vitest';
import { World } from '../../../engine/ecs/World';
import { TileGrid } from '../../../simulation/world/TileGrid';
import { TerrainType } from '../../../simulation/world/types';
import {
  COMPONENT,
  OrderKind,
  type CombatComponent,
  type CrystalSpireComponent,
  type CrystalUnitComponent,
  type HealthComponent,
  type MineralComponent,
  type PlayerOrderComponent,
} from '../../components/components';
import { createBeetle, createMineral } from '../../entities/factories';
import { FactionId, FactionRegistry, ownerOf } from '../../factions/factions';
import { CrystalPlayerSystem } from './CrystalPlayerSystem';
import { spawnCrystalPlayerBase } from './crystalPlayerSetup';
import {
  CRYSTAL_FLOOR,
  CRYSTAL_HIVE_SUPPLY,
  CRYSTAL_PLAYER_ECONOMY,
  CRYSTAL_PLAYER_START,
  CRYSTAL_PLAYER_UNITS,
  CRYSTAL_STRUCTURES,
  productionTime,
} from './crystalPlayerRules';
import { CRYSTAL_PLAYER_COMPONENT } from './crystalPlayerComponents';
import { createCrystalUnit } from '../../rival/crystalFactories';

const HX = 60;
const HY = 45;

function setup() {
  const world = new World(undefined, new FactionRegistry([
    { id: FactionId.WILDLIFE, race: 'wildlife', controller: 'none' },
    { id: FactionId.PLAYER, race: 'crystal', controller: 'human' },
  ]));
  const grid = new TileGrid();
  for (let y = 20; y <= 70; y++) for (let x = 20; x <= 100; x++) grid.setTile(x, y, { terrain: TerrainType.Dirt, walkable: true });
  const base = spawnCrystalPlayerBase(world, HX, HY);
  const system = new CrystalPlayerSystem(world, grid);
  const run = (seconds: number, dt = 0.1) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) system.update(dt);
  };
  const place = () => system.placementWorld(() => true);
  const units = (kind?: string) =>
    world.query(COMPONENT.CRYSTAL_UNIT).filter((id) => !kind || world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!.kind === kind);
  return { world, grid, base, system, run, place, units };
}

describe('Crystal player economy', () => {
  it('starts with the Hive, its drones and a mineral stock; no nest and no queen', () => {
    const { world, base, units } = setup();
    expect(world.query(COMPONENT.NEST)).toHaveLength(0);
    expect(world.query(COMPONENT.QUEEN_ENTITY)).toHaveLength(0);
    expect(ownerOf(world, base.hiveId)).toBe(FactionId.PLAYER);
    expect(world.factions.get(FactionId.PLAYER)?.coreId).toBe(base.hiveId);
    expect(units('drone')).toHaveLength(CRYSTAL_PLAYER_START.drones);
    expect(units().every((id) => ownerOf(world, id) === FactionId.PLAYER)).toBe(true);
    expect(world.minerals.stored).toBe(CRYSTAL_PLAYER_START.minerals);
  });

  it('the Hive trickles minerals into the bank by itself', () => {
    const { world, run } = setup();
    const before = world.minerals.stored;
    run(10);
    expect(world.minerals.stored - before).toBeCloseTo(CRYSTAL_PLAYER_ECONOMY.hiveTrickle * 10, 0);
  });

  it('an extractor crystallizes, then drains the nodes around it into the bank until they run dry', () => {
    const { world, system, run, place } = setup();
    const node = createMineral(world, HX + 20, HY);
    world.getComponent<MineralComponent>(node, COMPONENT.MINERAL)!.amount = 30;
    const before = world.minerals.stored;
    const result = system.startStructure('extractor', { x: HX + 18, y: HY }, place());
    expect(result.ok).toBe(true);
    expect(world.minerals.stored).toBe(before - CRYSTAL_STRUCTURES.extractor.cost);
    const extractor = result.ok ? result.id : -1;
    expect(world.getComponent(extractor, CRYSTAL_PLAYER_COMPONENT.CONSTRUCTION)).toBeDefined();

    // Still crystallizing: it drains nothing
    run(CRYSTAL_STRUCTURES.extractor.buildTime - 1);
    expect(world.getComponent<MineralComponent>(node, COMPONENT.MINERAL)!.amount).toBe(30);
    run(1.5);
    expect(world.getComponent(extractor, CRYSTAL_PLAYER_COMPONENT.CONSTRUCTION)).toBeUndefined();

    const bank = world.minerals.stored;
    run(5);
    const gained = world.minerals.stored - bank;
    expect(gained).toBeCloseTo((CRYSTAL_PLAYER_ECONOMY.hiveTrickle + CRYSTAL_PLAYER_ECONOMY.extractorRate) * 5, 0);
    run(20);
    expect(world.hasEntity(node)).toBe(false); // ran dry
  });

  it('refuses a structure it cannot pay for or place', () => {
    const { world, system, place } = setup();
    expect(system.startStructure('forge', { x: HX + 1, y: HY }, place())).toMatchObject({ ok: false });
    world.minerals.spend(world.minerals.stored);
    const poor = system.startStructure('forge', { x: HX + 6, y: HY }, place());
    expect(poor).toMatchObject({ ok: false, reason: expect.stringContaining('minerales') });
    expect(world.query(COMPONENT.CRYSTAL_SPIRE)).toHaveLength(0);
  });
});

describe('Crystal player production', () => {
  function withForge() {
    const s = setup();
    s.world.minerals.deposit(5000);
    const result = s.system.startStructure('forge', { x: HX + 6, y: HY }, s.place());
    if (!result.ok) throw new Error(result.reason);
    s.run(CRYSTAL_STRUCTURES.forge.buildTime + 0.5);
    return { ...s, forge: result.id };
  }

  it('a spire does not produce while it crystallizes', () => {
    const { world, system, place } = setup();
    world.minerals.deposit(1000);
    const result = system.startStructure('forge', { x: HX + 6, y: HY }, place());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(system.queueUnit(result.id, 'drone')).toMatchObject({ ok: false });
  });

  it('a spire crystallizes a paid unit after its time, at the rally point', () => {
    const { world, system, run, forge, units } = withForge();
    const before = world.minerals.stored;
    expect(system.queueUnit(forge, 'drone')).toEqual({ ok: true });
    expect(world.minerals.stored).toBe(before - CRYSTAL_PLAYER_UNITS.drone.cost);
    system.setRally(forge, { x: HX + 10, y: HY + 5 });
    const startDrones = units('drone').length;
    run(productionTime('drone', 1) - 0.5);
    expect(units('drone')).toHaveLength(startDrones);
    run(1);
    expect(units('drone')).toHaveLength(startDrones + 1);
    const fresh = Math.max(...units('drone'));
    expect(ownerOf(world, fresh)).toBe(FactionId.PLAYER);
    const order = world.getComponent<PlayerOrderComponent>(fresh, COMPONENT.PLAYER_ORDER);
    expect(order?.kind).toBe(OrderKind.Move);
    expect(system.stats().unitsMade).toBe(1);
  });

  it('only the right spire makes a unit, and refuses a full queue or an empty bank', () => {
    const { world, system, forge } = withForge();
    expect(system.queueUnit(forge, 'sentinel')).toMatchObject({ ok: false });
    for (let i = 0; i < 5; i++) expect(system.queueUnit(forge, 'drone').ok).toBe(true);
    expect(system.queueUnit(forge, 'drone')).toMatchObject({ ok: false });
    expect(system.cancelLast(forge)).toBe(true);
    world.minerals.spend(world.minerals.stored);
    expect(system.queueUnit(forge, 'drone')).toMatchObject({ ok: false, reason: expect.stringContaining('minerales') });
  });

  it('respects the supply cap', () => {
    const { world, base, system, run, forge, units } = withForge();
    expect(system.supply().cap).toBe(CRYSTAL_HIVE_SUPPLY + CRYSTAL_STRUCTURES.forge.supply);
    // Fill most of the cap first
    for (let i = 0; i < 4; i++) createCrystalUnit(world, 'drone', HX - 3, HY + i, base.hiveId, FactionId.PLAYER);
    const supply = system.supply();
    const room = Math.floor((supply.cap - supply.used) / CRYSTAL_PLAYER_UNITS.drone.supply);
    for (let i = 0; i < room + 1; i++) system.queueUnit(forge, 'drone');
    const start = units().length;
    run(productionTime('drone', 1) * (room + 2) + 1);
    expect(units().length).toBe(start + room);
    expect(system.supply().used).toBe(supply.cap);
    expect(system.producerOf(forge)?.blocked).toBe('supply');
  });

  it('Añadir piso crystallizes a floor: more supply and faster production', () => {
    const { world, system, run, forge } = withForge();
    const before = world.minerals.stored;
    const cap = system.supply().cap;
    expect(system.addFloor(forge)).toEqual({ ok: true });
    expect(world.minerals.stored).toBe(before - CRYSTAL_FLOOR.cost);
    expect(system.addFloor(forge)).toMatchObject({ ok: false }); // one floor at a time
    run(CRYSTAL_FLOOR.buildTime + 0.5);
    expect(world.getComponent<CrystalSpireComponent>(forge, COMPONENT.CRYSTAL_SPIRE)!.floors).toBe(2);
    expect(system.supply().cap).toBe(cap + CRYSTAL_STRUCTURES.forge.supply);
  });
});

describe('the Hive defends itself', () => {
  it('aims its bolt at the nearest enemy in range', () => {
    const { world, base, run } = setup();
    const beetle = createBeetle(world, HX + 4, HY, null);
    run(0.2);
    expect(world.getComponent<CombatComponent>(base.hiveId, COMPONENT.COMBAT)!.targetEntityId).toBe(beetle);
    // Out of range: it lets go
    world.getComponent<HealthComponent>(beetle, COMPONENT.HEALTH)!.current = 100;
    const pos = world.getComponent<{ x: number; y: number }>(beetle, COMPONENT.POSITION)!;
    pos.x = HX + 20;
    run(0.2);
    expect(world.getComponent<CombatComponent>(base.hiveId, COMPONENT.COMBAT)!.targetEntityId).toBeNull();
  });
});
