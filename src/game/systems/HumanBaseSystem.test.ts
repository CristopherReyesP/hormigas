import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { TileGrid } from '../../simulation/world/TileGrid';
import { TerrainType } from '../../simulation/world/types';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { createAnt, createNest } from '../entities/factories';
import {
  AntRole,
  COMPONENT,
  type CombatComponent,
  type HealthComponent,
  type PositionComponent,
} from '../components/components';
import { FactionId, ownerOf } from '../factions/factions';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import type { DayPhase } from './DayNightSystem';
import { MovementSystem } from './MovementSystem';
import { CombatSystem } from './CombatSystem';
import { HumanBaseSystem } from './HumanBaseSystem';
import { HumanUnitAISystem } from './HumanUnitAISystem';
import {
  HUMAN_COMPONENT,
  createHumanBase,
  createHumanBuilding,
  createHumanUnit,
  type HumanBuildingComponent,
  type HumanUnitComponent,
} from '../rival/humanFactories';
import { HUMAN_BUILDING_STATS, HUMAN_UNIT_STATS } from '../rival/humanBase';
import { humanShotsFor } from '../rival/humanShots';

const NX = Math.floor(WORLD_WIDTH / 2);
const NY = Math.floor(WORLD_HEIGHT / 2);
const BX = NX + 36;
const BY = NY;
const TICK = 1 / 30;

function fakeClock(day = 1, phase: DayPhase = 'day', progress = 0) {
  const clock = { phase, day, progress };
  return {
    clock,
    source: { getPhase: () => clock.phase, getDayNumber: () => clock.day, getPhaseProgress: () => clock.progress },
  };
}

function openGrid(): TileGrid {
  const surface = new TileGrid();
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) surface.setTile(x, y, { terrain: TerrainType.Dirt, walkable: true });
  }
  return surface;
}

function setup(day = 1) {
  const world = new World();
  const surface = openGrid();
  createNest(world, NX, NY);
  const base = createHumanBase(world, surface, { x: BX, y: BY }, { x: NX, y: NY });
  const { clock, source } = fakeClock(day);
  const baseSystem = new HumanBaseSystem(world, surface, source);
  const ai = new HumanUnitAISystem(world, surface);
  const movement = new MovementSystem(world, surface, createDefaultModifiers());
  const combat = new CombatSystem(world, surface);
  const tick = () => {
    baseSystem.update(TICK);
    ai.update(TICK);
    movement.update(TICK);
    combat.update(TICK);
  };
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / TICK); i++) tick();
  };
  const buildings = () => world.query(HUMAN_COMPONENT.BUILDING).map((id) => {
    const b = world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!;
    const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    return { kind: b.kind, x: pos.x, y: pos.y, done: b.constructing <= 0 };
  });
  return { world, surface, base, clock, baseSystem, ai, combat, tick, run, buildings };
}

describe('the human base', () => {
  it('starts with a command center, barracks, bunker, supply depot and a builder, owned by the rival', () => {
    const { world, base, buildings } = setup();
    expect(buildings().map((b) => b.kind).sort()).toEqual(['barracks', 'bunker', 'command_center', 'supply_depot']);
    const core = world.getComponent<HumanBuildingComponent>(base.coreId, HUMAN_COMPONENT.BUILDING)!;
    expect(core.kind).toBe('command_center');
    expect(ownerOf(world, base.coreId)).toBe(FactionId.RIVAL);
    const builders = world.query(HUMAN_COMPONENT.UNIT)
      .filter((id) => world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type === 'builder');
    expect(builders).toHaveLength(1);
    const hp = world.getComponent<HealthComponent>(base.coreId, COMPONENT.HEALTH)!;
    expect(hp.max).toBe(HUMAN_BUILDING_STATS.command_center.health);
  });

  it('raises the same buildings in the same places on every run (scripted build order)', () => {
    const a = setup(3);
    const b = setup(3);
    a.run(240);
    b.run(240);
    expect(a.buildings()).toEqual(b.buildings());
    expect(a.buildings().length).toBeGreaterThan(4);
  });

  it('builds more as the nights go by', () => {
    const early = setup(1);
    const late = setup(6);
    early.run(400);
    late.run(400);
    expect(late.buildings().length).toBeGreaterThan(early.buildings().length);
  });

  it('a day raid sends garrison troops after the player\'s miners from day 2', () => {
    const { world, clock, baseSystem } = setup(1);
    const miner = createAnt(world, NX + 10, NY + 3, AntRole.Worker);
    world.getComponent<{ resourceType: string | null; amount: number }>(miner, COMPONENT.CARRYING)!.resourceType = 'ore';
    const raiders = () => world.query(HUMAN_COMPONENT.UNIT)
      .filter((id) => world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.state === 'raiding');
    clock.progress = 0.5;
    baseSystem.update(TICK);
    expect(raiders()).toHaveLength(0); // day 1: no raid yet
    clock.day = 2;
    baseSystem.update(TICK);
    expect(raiders().length).toBeGreaterThan(0);
    for (const id of raiders()) {
      expect(world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.goal).toEqual({ x: NX + 10, y: NY + 3 });
    }
    expect(world.notifications.some((n) => /patrulla/.test(n.message))).toBe(true);
  });

  it('a night raid sends its squad from the base at the enemy nest', () => {
    const { world, baseSystem } = setup(2);
    const sent = baseSystem.launchRaid(4);
    expect(sent).toHaveLength(4);
    for (const id of sent) {
      const unit = world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!;
      expect(unit.state).toBe('assaulting');
      expect(unit.goal).toEqual({ x: NX, y: NY });
      const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      expect(Math.hypot(pos.x - BX, pos.y - BY)).toBeLessThan(8);
    }
    expect(baseSystem.raidOrigin()).toEqual({ x: BX, y: BY });
  });
});

describe('human combat', () => {
  it('armor takes 1 off every bite on a human soldier', () => {
    const world = new World();
    const surface = openGrid();
    const soldier = createHumanUnit(world, 'soldier', 50, 50);
    const ant = createAnt(world, 50.5, 50, AntRole.Soldier);
    world.addComponent<CombatComponent>(ant, COMPONENT.COMBAT, {
      attackDamage: 8, attackRange: 1.2, attackCooldown: 1, attackTimer: 0, targetEntityId: soldier,
    });
    new CombatSystem(world, surface).update(1 / 60);
    const hp = world.getComponent<HealthComponent>(soldier, COMPONENT.HEALTH)!;
    expect(hp.current).toBe(HUMAN_UNIT_STATS.soldier.health - 7);
  });

  it('a bunker shoots a player ant in range, with a tracer, and ignores one out of range', () => {
    const world = new World();
    const surface = openGrid();
    const { source } = fakeClock(1);
    const bunker = createHumanBuilding(world, 'bunker', 50, 50);
    const far = createAnt(world, 50 + HUMAN_BUILDING_STATS.bunker.attackRange + 2, 50, AntRole.Worker);
    const base = new HumanBaseSystem(world, surface, source);
    const combat = new CombatSystem(world, surface);
    base.update(TICK);
    expect(world.getComponent<CombatComponent>(bunker, COMPONENT.COMBAT)!.targetEntityId).toBeNull();

    const near = createAnt(world, 53, 50, AntRole.Worker);
    base.update(TICK);
    expect(world.getComponent<CombatComponent>(bunker, COMPONENT.COMBAT)!.targetEntityId).toBe(near);
    const before = world.getComponent<HealthComponent>(near, COMPONENT.HEALTH)!.current;
    combat.update(TICK);
    expect(world.getComponent<HealthComponent>(near, COMPONENT.HEALTH)!.current).toBeLessThan(before);
    expect(world.getComponent<HealthComponent>(far, COMPONENT.HEALTH)!.current).toBe(
      world.getComponent<HealthComponent>(far, COMPONENT.HEALTH)!.max,
    );
    expect(humanShotsFor(world).live().length).toBeGreaterThan(0);
  });

  it('a soldier opens fire from range 5 without closing in', () => {
    const world = new World();
    const surface = openGrid();
    const soldier = createHumanUnit(world, 'soldier', 50, 50);
    const ant = createAnt(world, 54.5, 50, AntRole.Worker);
    const ai = new HumanUnitAISystem(world, surface);
    const combat = new CombatSystem(world, surface);
    ai.update(TICK);
    combat.update(TICK);
    const pos = world.getComponent<PositionComponent>(soldier, COMPONENT.POSITION)!;
    expect(pos.x).toBe(50);
    const hp = world.getComponent<HealthComponent>(ant, COMPONENT.HEALTH)!;
    expect(hp.current).toBe(hp.max - HUMAN_UNIT_STATS.soldier.damage);
  });

  it('a tank shell splashes the enemies next to its target', () => {
    const world = new World();
    const surface = openGrid();
    const tank = createHumanUnit(world, 'tank', 50, 50);
    const target = createAnt(world, 54, 50, AntRole.Soldier);
    const beside = createAnt(world, 54.6, 50.4, AntRole.Soldier);
    const own = createHumanUnit(world, 'soldier', 54.3, 49.7);
    world.getComponent<CombatComponent>(tank, COMPONENT.COMBAT)!.targetEntityId = target;
    new CombatSystem(world, surface).update(TICK);
    const hp = (id: number) => world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
    expect(hp(target).current).toBeLessThan(hp(target).max);
    expect(hp(beside).current).toBeLessThan(hp(beside).max);
    expect(hp(own).current).toBe(hp(own).max);
  });
});
