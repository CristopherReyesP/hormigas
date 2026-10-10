import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { TileGrid } from '../../simulation/world/TileGrid';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { findPath } from '../../simulation/pathfinding/AStar';
import { createAnt, createBeetle, createNest } from '../entities/factories';
import { createCrystalUnit } from '../rival/crystalFactories';
import {
  AntRole,
  COMPONENT,
  Layer,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type RoleStatsComponent,
} from '../components/components';
import { DEFENSE_STATS } from '../run/defenses';
import { dealDamage } from '../run/waveRuntime';
import { CombatSystem } from './CombatSystem';
import { CrystalUnitAISystem } from './CrystalUnitAISystem';
import { DefenseSystem, STRUCTURE_COMPONENT, type StructureComponent } from './DefenseSystem';
import type { EntityId } from '../../shared/types';

const NEST = { x: 60, y: 45 };

function setup() {
  const world = new World();
  const surface = new TileGrid();
  // A known, open patch around the nest (the real map is random noise)
  for (let y = NEST.y - 14; y <= NEST.y + 14; y++) {
    for (let x = NEST.x - 14; x <= NEST.x + 14; x++) surface.getTile(x, y)!.walkable = true;
  }
  const underground = new UndergroundGrid();
  createNest(world, NEST.x, NEST.y);
  const defenses = new DefenseSystem(world, surface, underground);
  const combat = new CombatSystem(world, surface);
  const run = (seconds: number, dt = 1 / 20) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      defenses.update(dt);
      combat.update(dt);
    }
  };
  world.minerals.deposit(1000);
  return { world, surface, underground, defenses, combat, run };
}

const hp = (world: World, id: EntityId) => world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
const speedOf = (world: World, id: EntityId) => world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS)!.speedMultiplier;

describe('placing defenses', () => {
  it('spends the cost from the minerals bank and builds the structure', () => {
    const { world, defenses } = setup();
    const result = defenses.place('spine', 'surface', NEST.x + 4, NEST.y);
    expect(result.ok).toBe(true);
    expect(world.minerals.stored).toBe(1000 - DEFENSE_STATS.spine.cost);
    const s = world.getComponent<StructureComponent>(result.id!, STRUCTURE_COMPONENT)!;
    expect(s).toMatchObject({ kind: 'spine', layer: 'surface', x: NEST.x + 4, y: NEST.y });
    expect(hp(world, result.id!).max).toBe(DEFENSE_STATS.spine.health);
  });

  it('refuses without taking minerals when the bank is short or the tile is taken', () => {
    const { world, defenses } = setup();
    world.minerals.spend(world.minerals.stored - 10);
    expect(defenses.place('wall', 'surface', NEST.x + 4, NEST.y)).toMatchObject({ ok: false });
    expect(world.minerals.stored).toBe(10);
    world.minerals.deposit(500);
    expect(defenses.place('wall', 'surface', NEST.x + 4, NEST.y).ok).toBe(true);
    const before = world.minerals.stored;
    expect(defenses.place('trap', 'surface', NEST.x + 4, NEST.y)).toMatchObject({ ok: false, reason: 'occupied' });
    expect(world.minerals.stored).toBe(before);
  });

  it('a chitin wall blocks A* on the surface until it is destroyed', () => {
    const { world, surface, defenses, run } = setup();
    // A one-tile gap in a rock line: the only short way through
    for (let y = 0; y < surface.height; y++) if (y !== NEST.y) surface.getTile(NEST.x + 6, y)!.walkable = false;
    const from = { x: NEST.x + 3, y: NEST.y };
    const to = { x: NEST.x + 9, y: NEST.y };
    expect(findPath(surface, from, to)!.some((p) => p.x === NEST.x + 6 && p.y === NEST.y)).toBe(true);
    // Walling the gap would seal the nest side off: refused
    expect(defenses.place('wall', 'surface', NEST.x + 6, NEST.y)).toMatchObject({ ok: false, reason: 'seal' });
    // Open a second way round, then the wall is legal and A* goes round it
    surface.getTile(NEST.x + 6, NEST.y + 8)!.walkable = true;
    const wall = defenses.place('wall', 'surface', NEST.x + 6, NEST.y);
    expect(wall.ok).toBe(true);
    expect(surface.isWalkable(NEST.x + 6, NEST.y)).toBe(false);
    const around = findPath(surface, from, to)!;
    expect(around.some((p) => p.x === NEST.x + 6 && p.y === NEST.y)).toBe(false);
    expect(around.some((p) => p.x === NEST.x + 6 && p.y === NEST.y + 8)).toBe(true);
    dealDamage(world, wall.id!, 99999);
    run(0.2);
    expect(world.hasEntity(wall.id!)).toBe(false);
    expect(surface.isWalkable(NEST.x + 6, NEST.y)).toBe(true);
  });

  it('underground: builds at the breach and walls block the nest A*', () => {
    const { defenses, underground } = setup();
    const entrance = underground.getEntrances()[0];
    expect(defenses.place('spine', 'underground', entrance.x, entrance.y + 4).ok).toBe(true);
    const wall = defenses.place('wall', 'underground', entrance.x + 1, entrance.y + 6);
    expect(wall.ok).toBe(true);
    expect(underground.isWalkable(entrance.x + 1, entrance.y + 6)).toBe(false);
    const route = underground.findPath(entrance.x + 1, entrance.y + 9, entrance.x + 1, entrance.y + 3)!;
    expect(route.some((p) => Math.floor(p.x) === entrance.x + 1 && Math.floor(p.y) === entrance.y + 6)).toBe(false);
    // Sealing the other half of the shaft is refused
    expect(defenses.place('wall', 'underground', entrance.x, entrance.y + 6)).toMatchObject({ ok: false, reason: 'seal' });
    // Deep in the nest is no breach tile
    expect(defenses.place('spine', 'underground', 45, 30)).toMatchObject({ ok: false, reason: 'area' });
  });
});

describe('Espina', () => {
  it('shoots the nearest hostile in range, never allies or what is out of range', () => {
    const { world, defenses, run } = setup();
    const spine = defenses.place('spine', 'surface', NEST.x + 4, NEST.y).id!;
    const ally = createAnt(world, NEST.x + 5, NEST.y, AntRole.Soldier);
    const near = createBeetle(world, NEST.x + 6, NEST.y);
    const farther = createBeetle(world, NEST.x + 4, NEST.y + 4);
    const outside = createBeetle(world, NEST.x + 4 + DEFENSE_STATS.spine.range + 1, NEST.y);
    for (const id of [near, farther, outside]) world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!.targetEntityId = null;
    run(0.1);
    expect(defenses.targetOf(spine)).toBe(near);
    expect(hp(world, near).current).toBe(hp(world, near).max - DEFENSE_STATS.spine.damage);
    expect(hp(world, farther).current).toBe(hp(world, farther).max);
    expect(hp(world, outside).current).toBe(hp(world, outside).max);
    expect(hp(world, ally).current).toBe(hp(world, ally).max);
    // Cooldown: the next spine only after the reload
    run(DEFENSE_STATS.spine.cooldown - 0.2);
    expect(hp(world, near).current).toBe(hp(world, near).max - DEFENSE_STATS.spine.damage);
    run(0.3);
    expect(hp(world, near).current).toBe(hp(world, near).max - 2 * DEFENSE_STATS.spine.damage);
  });

  it('never shoots across layers', () => {
    const { world, defenses, run } = setup();
    defenses.place('spine', 'surface', NEST.x + 4, NEST.y);
    const below = createBeetle(world, NEST.x + 5, NEST.y);
    world.getComponent<LayerComponent>(below, COMPONENT.LAYER)!.layer = Layer.Underground;
    run(0.5);
    expect(hp(world, below).current).toBe(hp(world, below).max);
  });

  it('rival units pick structures as targets', () => {
    const { world, defenses } = setup();
    const spine = defenses.place('spine', 'surface', NEST.x + 4, NEST.y).id!;
    const drone = createCrystalUnit(world, 'drone', NEST.x + 8, NEST.y);
    new CrystalUnitAISystem(world, new TileGrid()).update(0.1);
    expect(world.getComponent<CombatComponent>(drone, COMPONENT.COMBAT)!.targetEntityId).toBe(spine);
  });
});

describe('Trampa de resina', () => {
  it('slows an enemy standing in it and bites a little, then lets it go when it leaves', () => {
    const { world, defenses, run } = setup();
    defenses.place('trap', 'surface', NEST.x + 4, NEST.y);
    const beetle = createBeetle(world, NEST.x + 4.2, NEST.y);
    world.getComponent<CombatComponent>(beetle, COMPONENT.COMBAT)!.targetEntityId = null;
    const base = speedOf(world, beetle);
    run(DEFENSE_STATS.trap.tick + 0.05);
    expect(speedOf(world, beetle)).toBeCloseTo(base * DEFENSE_STATS.trap.slow);
    expect(hp(world, beetle).current).toBeLessThan(hp(world, beetle).max);
    expect(hp(world, beetle).current).toBeGreaterThan(hp(world, beetle).max - 3 * DEFENSE_STATS.trap.damage);
    const pos = world.getComponent<{ x: number; y: number }>(beetle, COMPONENT.POSITION)!;
    pos.x = NEST.x + 9;
    run(1.5);
    expect(speedOf(world, beetle)).toBeCloseTo(base);
  });

  it('does not touch ants', () => {
    const { world, defenses, run } = setup();
    defenses.place('trap', 'surface', NEST.x + 4, NEST.y);
    const ant = createAnt(world, NEST.x + 4, NEST.y, AntRole.Worker);
    const base = speedOf(world, ant);
    run(2);
    expect(speedOf(world, ant)).toBeCloseTo(base);
    expect(hp(world, ant).current).toBe(hp(world, ant).max);
  });

  it('runs out of resin after its charges, then recharges', () => {
    const { world, defenses, run } = setup();
    const trap = defenses.place('trap', 'surface', NEST.x + 4, NEST.y).id!;
    const beetle = createBeetle(world, NEST.x + 4, NEST.y);
    world.getComponent<CombatComponent>(beetle, COMPONENT.COMBAT)!.targetEntityId = null;
    hp(world, beetle).max = hp(world, beetle).current = 100000;
    const s = () => world.getComponent<StructureComponent>(trap, STRUCTURE_COMPONENT)!;
    const base = speedOf(world, beetle);
    run(DEFENSE_STATS.trap.charges * DEFENSE_STATS.trap.tick + 0.5);
    expect(s().charges).toBe(0);
    run(1);
    expect(speedOf(world, beetle)).toBeCloseTo(base); // spent: no more slow
    world.getComponent<{ x: number }>(beetle, COMPONENT.POSITION)!.x = NEST.x + 12;
    run(DEFENSE_STATS.trap.recharge);
    expect(s().charges).toBe(DEFENSE_STATS.trap.charges);
  });
});
