import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { TileGrid } from '../../simulation/world/TileGrid';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { TerrainType } from '../../simulation/world/types';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { createAnt, createBeetle, createCrystalDrone, createCrystalHive, createNest } from '../entities/factories';
import {
  AntRole,
  COMPONENT,
  CrystalUnitState,
  type CombatComponent,
  type CrystalUnitComponent,
  type HealthComponent,
  type PathComponent,
  type PositionComponent,
} from '../components/components';
import { FactionId, ownerOf } from '../factions/factions';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import type { DayPhase } from '../systems/DayNightSystem';
import { AntAISystem } from '../systems/AntAISystem';
import { MovementSystem } from '../systems/MovementSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { TransitSystem } from '../systems/TransitSystem';
import { CrystalHiveSystem } from '../systems/CrystalHiveSystem';
import { CrystalUnitAISystem } from '../systems/CrystalUnitAISystem';
import { findEnemyAt, issueAttackOrders, isSurfaceEnemy } from '../systems/helpers/playerOrders';
import { buildAttackerMap } from '../systems/helpers/combatHelpers';
import { CRYSTAL_DRONE_STATS, CRYSTAL_HIVE_STATS } from './crystalHive';
import { resolveRunOutcome } from '../run/RunOutcome';
import type { ShieldComponent } from './crystalShield';

const NX = Math.floor(WORLD_WIDTH / 2);
const NY = Math.floor(WORLD_HEIGHT / 2);
const HX = NX + 30;
const HY = NY;
const TICK = 1 / 60;

/** A day/night clock the test flips by hand */
function fakeClock() {
  const clock = { phase: 'day' as DayPhase, day: 1 };
  return {
    clock,
    source: { getPhase: () => clock.phase, getDayNumber: () => clock.day },
  };
}

/** Open dirt from the nest to the hive, the player nest, the hive and every system that moves or fights */
function setup() {
  const world = new World();
  const surface = new TileGrid();
  for (let dy = -20; dy <= 20; dy++) {
    for (let dx = -10; dx <= 40; dx++) {
      surface.setTile(NX + dx, NY + dy, { terrain: TerrainType.Dirt, walkable: true });
    }
  }
  const underground = new UndergroundGrid();
  const nest = createNest(world, NX, NY);
  const hive = createCrystalHive(world, HX, HY);
  const { clock, source } = fakeClock();
  const modifiers = createDefaultModifiers();
  const transit = new TransitSystem(world, underground);
  const ai = new AntAISystem(world, surface, new VisibilityGrid(WORLD_WIDTH, WORLD_HEIGHT), modifiers);
  ai.setUndergroundAccess(underground, transit);
  const hiveSystem = new CrystalHiveSystem(world, surface, source);
  const crystalAI = new CrystalUnitAISystem(world, surface);
  const movement = new MovementSystem(world, surface, modifiers, underground);
  const combat = new CombatSystem(world, surface);
  const tick = () => {
    hiveSystem.update(TICK);
    ai.update(TICK);
    crystalAI.update(TICK);
    movement.update(TICK);
    combat.update(TICK);
  };
  const run = (seconds: number, until: () => boolean = () => false) => {
    for (let i = 0; i < seconds * 60 && !until(); i++) tick();
  };
  const drones = () => world.query(COMPONENT.CRYSTAL_UNIT);
  const unitOf = (id: number) => world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!;
  const posOf = (id: number) => world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
  const healthOf = (id: number) => world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
  return { world, surface, nest, hive, clock, hiveSystem, crystalAI, run, tick, drones, unitOf, posOf, healthOf };
}

describe('the Crystal Hive base', () => {
  it('is a RIVAL structure with health, enemy to the player and selectable for attack orders', () => {
    const { world, hive, healthOf } = setup();
    expect(ownerOf(world, hive)).toBe(FactionId.RIVAL);
    expect(healthOf(hive).current).toBe(CRYSTAL_HIVE_STATS.health);
    expect(isSurfaceEnemy(world, hive)).toBe(true);
    expect(findEnemyAt(world, { x: HX, y: HY }, () => true)).toBe(hive);
  });

  it('crystallizes drones owned by RIVAL over time, up to its garrison cap', () => {
    const { world, drones, run } = setup();
    expect(drones()).toHaveLength(0);
    run(CRYSTAL_HIVE_STATS.productionInterval + 1);
    expect(drones()).toHaveLength(1);
    expect(ownerOf(world, drones()[0])).toBe(FactionId.RIVAL);
    run(CRYSTAL_HIVE_STATS.productionInterval * (CRYSTAL_HIVE_STATS.garrisonCap + 2));
    expect(drones()).toHaveLength(CRYSTAL_HIVE_STATS.garrisonCap);
  });

  it('drones carry the P4 tier-1 stats', () => {
    const { world, hive } = setup();
    const drone = createCrystalDrone(world, HX + 2, HY, hive);
    const health = world.getComponent<HealthComponent>(drone, COMPONENT.HEALTH)!;
    const combat = world.getComponent<CombatComponent>(drone, COMPONENT.COMBAT)!;
    expect(health.max).toBe(CRYSTAL_DRONE_STATS.health);
    expect(combat.attackDamage).toBe(CRYSTAL_DRONE_STATS.damage);
    expect(combat.attackCooldown).toBe(CRYSTAL_DRONE_STATS.attackCooldown);
  });
});

describe('night waves from the hive', () => {
  it('sends a 1-drone scout on night 1, toward the player nest', () => {
    const { clock, drones, unitOf, world, tick } = setup();
    tick();
    clock.phase = 'night';
    tick();
    expect(drones()).toHaveLength(1);
    const drone = drones()[0];
    expect(unitOf(drone).state).toBe(CrystalUnitState.Assaulting);
    expect(unitOf(drone).goal).toEqual({ x: NX, y: NY });
    const path = world.getComponent<PathComponent>(drone, COMPONENT.PATH)!;
    expect(path.waypoints.length).toBeGreaterThan(0);
    expect(path.waypoints[path.waypoints.length - 1]).toEqual({ x: NX, y: NY });
  });

  it('sizes the wave by night number and launches it once per night', () => {
    const { clock, drones, unitOf, tick } = setup();
    clock.day = 3;
    tick();
    clock.phase = 'night';
    tick();
    const assaulting = () => drones().filter((id) => unitOf(id).state === CrystalUnitState.Assaulting);
    expect(assaulting()).toHaveLength(3);
    for (let i = 0; i < 30; i++) tick();
    expect(assaulting()).toHaveLength(3);
  });

  it('uses the garrison first: produced drones join the wave', () => {
    const { clock, drones, unitOf, run, tick } = setup();
    run(CRYSTAL_HIVE_STATS.productionInterval + 1);
    const garrison = drones();
    expect(garrison).toHaveLength(1);
    clock.day = 2;
    clock.phase = 'night';
    tick();
    expect(drones()).toHaveLength(2);
    expect(unitOf(garrison[0]).state).toBe(CrystalUnitState.Assaulting);
  });

  it('the wave walks to the nest', () => {
    const { clock, drones, posOf, run, tick } = setup();
    tick();
    clock.phase = 'night';
    tick();
    const drone = drones()[0];
    run(60, () => Math.hypot(posOf(drone).x - NX, posOf(drone).y - NY) < 2);
    expect(Math.hypot(posOf(drone).x - NX, posOf(drone).y - NY)).toBeLessThan(2);
  });
});

describe('drones and the player fight each other', () => {
  it('a drone attacks a player ant it meets', () => {
    const { world, hive, healthOf, run } = setup();
    const drone = createCrystalDrone(world, HX - 5, HY, hive);
    const soldier = createAnt(world, HX - 7, HY, AntRole.Soldier);
    const start = healthOf(soldier).current;
    run(4, () => !world.hasEntity(soldier) || healthOf(soldier).current < start);
    expect(!world.hasEntity(soldier) || healthOf(soldier).current < start).toBe(true);
    // The attacker map lets the colony AI react (a worker flees or fights back)
    if (world.hasEntity(soldier)) expect(buildAttackerMap(world).get(soldier)).toBe(drone);
  });

  it('a worker the drone goes for knows it is under attack', () => {
    const { world, hive, run } = setup();
    const drone = createCrystalDrone(world, HX - 5, HY, hive);
    const worker = createAnt(world, HX - 7, HY, AntRole.Worker);
    let attacked = false;
    run(2, () => (attacked = buildAttackerMap(world).get(worker) === drone));
    expect(attacked).toBe(true);
  });

  it('a drone ignores wildlife', () => {
    const { world, hive, healthOf, run } = setup();
    createCrystalDrone(world, HX - 5, HY, hive);
    const beetle = createBeetle(world, HX - 6, HY);
    run(5);
    expect(healthOf(beetle).current).toBe(healthOf(beetle).max);
  });

  it('player soldiers see rival drones as enemies and damage them', () => {
    const { world, hive, healthOf, run } = setup();
    const drone = createCrystalDrone(world, NX + 4, NY, hive);
    createAnt(world, NX + 1, NY, AntRole.Soldier);
    createAnt(world, NX + 1, NY + 1, AntRole.Soldier);
    run(6, () => !world.hasEntity(drone) || healthOf(drone).current < CRYSTAL_DRONE_STATS.health);
    expect(!world.hasEntity(drone) || healthOf(drone).current < CRYSTAL_DRONE_STATS.health).toBe(true);
  });

  it('an attack order on the hive destroys it', () => {
    const { world, surface, hive, healthOf, run } = setup();
    healthOf(hive).current = 20;
    // Its shield is down too: the hits land on the hull
    world.getComponent<ShieldComponent>(hive, COMPONENT.SHIELD)!.current = 0;
    const soldier = createAnt(world, HX - 4, HY, AntRole.Soldier);
    expect(issueAttackOrders(world, surface, [soldier], hive)?.ordered).toEqual([soldier]);
    run(20, () => !world.hasEntity(hive));
    expect(world.hasEntity(hive)).toBe(false);
  });
});

describe('victory by destroying the hive', () => {
  it('wins when the hive falls and the queen lives', () => {
    expect(resolveRunOutcome(null, true, 'day', 'day', 2, true)).toBe('victory');
  });

  it('still loses when the queen dies, even if the hive fell', () => {
    expect(resolveRunOutcome(null, false, 'day', 'day', 2, true)).toBe('defeat');
  });

  it('does not win while the hive stands', () => {
    expect(resolveRunOutcome(null, true, 'day', 'day', 2, false)).toBeNull();
  });
});
