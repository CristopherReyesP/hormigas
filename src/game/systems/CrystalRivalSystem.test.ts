import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { TileGrid } from '../../simulation/world/TileGrid';
import { TerrainType } from '../../simulation/world/types';
import {
  AntRole,
  AntState,
  COMPONENT,
  CrystalUnitState,
  type AntComponent,
  type CrystalSpireComponent,
  type CrystalUnitComponent,
  type HealthComponent,
  type MineralComponent,
} from '../components/components';
import { createAnt, createCrystalHive, createMineral, createNest } from '../entities/factories';
import { createCrystalSpire, createCrystalUnit } from '../rival/crystalFactories';
import { CRYSTAL_ECONOMY, CRYSTAL_QUEEN_POWERS, CRYSTAL_UNIT_STATS, RAID_AT_DAY_REMAINING, spireInterval } from '../rival/crystalRival';
import { CrystalRivalSystem } from './CrystalRivalSystem';
import type { DayPhase } from './DayNightSystem';

const HX = 60;
const HY = 40;
const NX = 20;
const NY = 40;

function setup() {
  const world = new World();
  const grid = new TileGrid();
  for (let y = 20; y <= 60; y++) for (let x = 5; x <= 80; x++) grid.setTile(x, y, { terrain: TerrainType.Dirt, walkable: true });
  createNest(world, NX, NY);
  const hive = createCrystalHive(world, HX, HY);
  const clock = { phase: 'day' as DayPhase, day: 1, remaining: 150 };
  const rival = new CrystalRivalSystem(world, grid, {
    getPhase: () => clock.phase,
    getDayNumber: () => clock.day,
    getPhaseRemaining: () => clock.remaining,
  });
  const run = (seconds: number, dt = 0.1) => {
    for (let t = 0; t < seconds; t += dt) rival.update(dt);
  };
  const spires = (kind?: string) =>
    world.query(COMPONENT.CRYSTAL_SPIRE).filter((id) => !kind || world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE)!.kind === kind);
  const units = (kind?: string) =>
    world.query(COMPONENT.CRYSTAL_UNIT).filter((id) => !kind || world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!.kind === kind);
  return { world, grid, hive, clock, rival, run, spires, units };
}

describe('the Crystal rival economy', () => {
  it('an extractor drains the crater field into the bank, and its nodes run dry', () => {
    const { world, hive, rival, run } = setup();
    const node = createMineral(world, HX + 3, HY);
    world.getComponent<MineralComponent>(node, COMPONENT.MINERAL)!.amount = 10;
    createCrystalSpire(world, 'extractor', HX + 2, HY, hive);
    rival['buildIndex'] = 99; // nothing to build: watch the income alone
    const before = rival.snapshot().bank;
    run(5);
    const gained = rival.snapshot().bank - before;
    expect(gained).toBeGreaterThanOrEqual(Math.floor(CRYSTAL_ECONOMY.passiveIncome * 5 + 5));
    run(10);
    expect(world.hasEntity(node)).toBe(false);
  });

  it('builds the opening by itself: the crater extractor, then the drone forge', () => {
    const { spires, run } = setup();
    run(200);
    expect(spires('extractor')).toHaveLength(1);
    expect(spires('forge')).toHaveLength(1);
  });

  it('expands to a field away from the crater', () => {
    const { world, rival, clock, spires, run } = setup();
    for (let i = 0; i < 3; i++) createMineral(world, 40 + i, 25);
    clock.day = 3;
    rival['buildIndex'] = 3; // the expansion step
    rival['bank'] = 1000;
    run(0.2);
    const extractor = spires('extractor')[0];
    const pos = world.getComponent<{ x: number; y: number }>(extractor, COMPONENT.POSITION)!;
    expect(Math.hypot(pos.x - 41, pos.y - 25)).toBeLessThan(3);
  });
});

describe('Crystal production from spires', () => {
  it('a Sentinel prism crystallizes Sentinels while the bank pays', () => {
    const { hive, world, rival, units, run } = setup();
    createCrystalSpire(world, 'prism', HX + 4, HY, hive);
    rival['buildIndex'] = 99;
    rival['bank'] = CRYSTAL_UNIT_STATS.sentinel.cost;
    run(spireInterval('prism', 1) + 1);
    expect(units('sentinel')).toHaveLength(1);
    expect(rival.snapshot().bank).toBeLessThan(CRYSTAL_UNIT_STATS.sentinel.cost);
  });

  it('destroying a spire stops its production', () => {
    const { hive, world, rival, units, run } = setup();
    const forge = createCrystalSpire(world, 'forge', HX + 4, HY, hive);
    rival['buildIndex'] = 99;
    rival['bank'] = 5000;
    world.destroyEntity(forge);
    run(spireInterval('forge', 1) * 2);
    expect(units('drone')).toHaveLength(0);
  });
});

describe('Crystal raids', () => {
  it('once a day it sends raiders at the player miner, and they come home after siphoning', () => {
    const { world, hive, clock, units, run } = setup();
    for (let i = 0; i < 3; i++) createCrystalUnit(world, 'drone', HX + 2, HY + i, hive);
    const miner = createAnt(world, 35, 30, AntRole.Worker);
    world.getComponent<AntComponent>(miner, COMPONENT.ANT)!.state = AntState.Mining;
    clock.day = 3;
    clock.remaining = RAID_AT_DAY_REMAINING - 1;
    run(0.1);
    const raiders = units().filter((id) => world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!.state === CrystalUnitState.Raiding);
    expect(raiders).toHaveLength(2);
    expect(world.getComponent<CrystalUnitComponent>(raiders[0], COMPONENT.CRYSTAL_UNIT)!.goal).toEqual({ x: 35, y: 30 });
    run(1);
    // One raid a day
    expect(units().filter((id) => world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!.state === CrystalUnitState.Raiding)).toHaveLength(2);
    expect(world.notifications.some((n) => n.message.includes('Incursión de cristal'))).toBe(true);
  });

  it('sends nobody on day 1', () => {
    const { world, hive, clock, units, run } = setup();
    for (let i = 0; i < 3; i++) createCrystalUnit(world, 'drone', HX + 2, HY + i, hive);
    clock.remaining = 10;
    run(0.5);
    expect(units().every((id) => world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!.state === CrystalUnitState.Guarding)).toBe(true);
  });
});

describe('the Crystal Queen', () => {
  it('comes once, marching on the player nest', () => {
    const { world, rival, units } = setup();
    const queen = rival.launchQueen();
    expect(queen).not.toBeNull();
    expect(rival.launchQueen()).toBeNull();
    expect(units('queen')).toEqual([queen]);
    expect(world.getComponent<CrystalUnitComponent>(queen!, COMPONENT.CRYSTAL_UNIT)!.goal).toEqual({ x: NX, y: NY });
  });

  it('her pulse hurts the player ants around her', () => {
    const { world, rival, run } = setup();
    const queen = rival.launchQueen()!;
    const pos = world.getComponent<{ x: number; y: number }>(queen, COMPONENT.POSITION)!;
    const ant = createAnt(world, pos.x + 1, pos.y, AntRole.Soldier);
    const health = world.getComponent<HealthComponent>(ant, COMPONENT.HEALTH)!;
    const start = health.current;
    run(CRYSTAL_QUEEN_POWERS.pulseCooldown + 0.2);
    expect(!world.hasEntity(ant) || health.current <= start - CRYSTAL_QUEEN_POWERS.pulseDamage).toBe(true);
  });
});
