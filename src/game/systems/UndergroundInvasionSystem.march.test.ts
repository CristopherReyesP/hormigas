import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import type { System } from '../../engine/ecs/types';
import { TileGrid } from '../../simulation/world/TileGrid';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { createAnt, createBeetleDen, createNest, createQueen } from '../entities/factories';
import {
  AntRole,
  AntState,
  COMPONENT,
  ColonyPriority,
  Layer,
  type AntComponent,
  type CombatComponent,
  type HealthComponent,
  type HungerComponent,
  type LayerComponent,
  type NestComponent,
  type OwnerComponent,
  type PathComponent,
  type PositionComponent,
} from '../components/components';
import { FactionId } from '../factions/factions';
import { ENTRANCE_ROW, UNDERGROUND_HEIGHT, UNDERGROUND_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { waveComposition } from '../run/waveComposition';
import { BOSS_COMPONENT } from '../run/miniBoss';
import { STRUCTURE_COMPONENT, type StructureComponent } from '../run/defenses';
import {
  MARCH_SPEED_KEY,
  MARCH_TUNING,
  SIEGE_TUNING,
  WAVE_MARCH_COMPONENT,
  surfaceHoleFor,
  type WaveMarchComponent,
} from '../run/waveMarch';
import { dealDamage, speedFactorOf, waveRuntimeFor } from '../run/waveRuntime';
import { AntAISystem } from './AntAISystem';
import { CombatSystem } from './CombatSystem';
import { DayNightSystem } from './DayNightSystem';
import { DefenseSystem } from './DefenseSystem';
import { MovementSystem } from './MovementSystem';
import { TransitSystem } from './TransitSystem';
import { UndergroundInvasionSystem } from './UndergroundInvasionSystem';
import type { EntityId } from '../../shared/types';

const DT = 1 / 16;
const NEST = { x: 60, y: 45 };

function setup() {
  const world = new World();
  const surface = new TileGrid();
  // A known, open map (the real one is random noise)
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) surface.getTile(x, y)!.walkable = true;
  }
  const ug = new UndergroundGrid();
  createNest(world, NEST.x, NEST.y);
  const queen = createQueen(world, Math.floor(UNDERGROUND_WIDTH / 2) + 0.5, Math.floor(UNDERGROUND_HEIGHT / 2) + 0.5);
  const modifiers = createDefaultModifiers();
  const dayNight = new DayNightSystem(world, modifiers);
  const transit = new TransitSystem(world, ug);
  const invasion = new UndergroundInvasionSystem(world, ug, transit, dayNight, surface);
  const defenses = new DefenseSystem(world, surface, ug);
  const combat = new CombatSystem(world, surface);
  const movement = new MovementSystem(world, surface, modifiers, ug);
  const extra: System[] = [];
  let t = 0;
  // The real priority order: day/night, the AIs, defenses, combat, the invasion, movement
  const step = () => {
    dayNight.update(DT);
    for (const s of extra) s.update(DT);
    defenses.update(DT);
    combat.update(DT);
    invasion.update(DT);
    movement.update(DT);
    t += DT;
  };
  const run = (seconds: number) => {
    for (let i = 0; i < seconds / DT; i++) step();
  };
  const toNightfall = () => {
    while (dayNight.getPhase() === 'day') step();
  };
  world.minerals.deposit(2000);
  return { world, surface, ug, queen, dayNight, invasion, defenses, extra, step, run, toNightfall, now: () => t, modifiers };
}

const layerOf = (world: World, id: EntityId) => world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer;
const posOf = (world: World, id: EntityId) => world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
const marchOf = (world: World, id: EntityId) => world.getComponent<WaveMarchComponent>(id, WAVE_MARCH_COMPONENT);
const beetles = (world: World) => world.query(COMPONENT.BEETLE);
const marchers = (world: World) => beetles(world).filter((id) => marchOf(world, id) !== undefined);
const inside = (world: World) => beetles(world).filter((id) => layerOf(world, id) === Layer.Underground);
const onEdge = (p: { x: number; y: number }) => p.x <= 2 || p.y <= 2 || p.x >= WORLD_WIDTH - 3 || p.y >= WORLD_HEIGHT - 3;

function openEntrance(ug: UndergroundGrid, x: number): void {
  ug.designate(x, ENTRANCE_ROW);
  ug.excavate(x, ENTRANCE_ROW);
}

/** A surface wall standing on (x, y), built outside the placement rules (they never let one seal the way) */
function wallAt(world: World, surface: TileGrid, defenses: DefenseSystem, x: number, y: number, health: number): EntityId {
  const id = world.createEntity();
  world.addComponent<PositionComponent>(id, COMPONENT.POSITION, { x, y, prevX: x, prevY: y });
  world.addComponent<HealthComponent>(id, COMPONENT.HEALTH, { current: health, max: health, damage: 0 });
  world.addComponent<LayerComponent>(id, COMPONENT.LAYER, { layer: Layer.Surface });
  world.addComponent<OwnerComponent>(id, COMPONENT.OWNER, { faction: FactionId.PLAYER });
  world.addComponent<StructureComponent>(id, STRUCTURE_COMPONENT, { kind: 'wall', layer: 'surface', x, y, timer: 0, targetId: null, charges: 0, rechargeTimer: 0 });
  surface.getTile(x, y)!.walkable = false;
  (defenses['walls'] as Map<EntityId, { layer: 'surface'; x: number; y: number }>).set(id, { layer: 'surface', x, y });
  return id;
}

describe('the wave arrives on the surface', () => {
  it('spawns every unit on the surface at the scouted map edge, in a column over a few seconds', () => {
    const { world, invasion, toNightfall, step, now } = setup();
    const scouted = invasion.getInfo().next!.wildlife!;
    expect(scouted).not.toBeNull();
    expect(onEdge(scouted)).toBe(true);
    toNightfall();
    const first = beetles(world);
    expect(first).toHaveLength(1);
    expect(layerOf(world, first[0])).toBe(Layer.Surface);
    const at = posOf(world, first[0]);
    expect(Math.hypot(at.x - scouted.x, at.y - scouted.y)).toBeLessThanOrEqual(2);
    const start = now();
    while (invasion['pendingSpawns'].length > 0) step();
    const spread = now() - start;
    expect(spread).toBeGreaterThanOrEqual(1.5);
    expect(spread).toBeLessThanOrEqual(MARCH_TUNING.columnSeconds + 1);
    const wave = beetles(world);
    expect(wave).toHaveLength(waveComposition(1).total);
    for (const id of wave) {
      expect(layerOf(world, id)).toBe(Layer.Surface);
      expect(marchOf(world, id)?.phase).toBe('marching');
    }
  });

  it('comes from the side of the nearest wildlife den', () => {
    const { world, invasion } = setup();
    createBeetleDen(world, 100, NEST.y);
    const next = invasion.getInfo().next!;
    expect(next.wildlife).toMatchObject({ direction: 'este' });
    expect(next.wildlife!.x).toBeGreaterThanOrEqual(WORLD_WIDTH - 3);
  });

  it('the threats and the minimap point at the edge before the wave and at the column during it', () => {
    const { world, invasion, toNightfall, dayNight, step, run } = setup();
    while (dayNight.getPhaseRemaining() > 29) step();
    const scouted = invasion.getInfo().next!.wildlife!;
    expect(invasion.getInfo().threats).toContainEqual({ x: scouted.x, y: scouted.y, layer: 'surface' });
    toNightfall();
    run(6);
    const ids = marchers(world);
    const cx = ids.reduce((s, id) => s + posOf(world, id).x, 0) / ids.length;
    const cy = ids.reduce((s, id) => s + posOf(world, id).y, 0) / ids.length;
    const surface = invasion.getInfo().threats.filter((t) => t.layer === 'surface');
    expect(surface.some((t) => Math.hypot(t.x - cx, t.y - cy) < 1)).toBe(true);
  });
});

describe('the march on the breach', () => {
  it('heads for the surface hole of the scouted entrance', () => {
    const { world, ug, surface, invasion, toNightfall, run, step } = setup();
    openEntrance(ug, 12);
    openEntrance(ug, 75);
    // A wave whose scouted breach is not the main shaft
    let wave = 0;
    while (invasion['scoutEntrance'](wave + 1)!.x === ug.getEntrances()[1].x) wave++;
    invasion['waveNumber'] = wave;
    const next = invasion.getInfo().next!;
    const hole = surfaceHoleFor(surface, next.entrance!, NEST, ug.width);
    expect(hole).not.toEqual(NEST);
    expect(next.hole).toEqual(hole);
    toNightfall();
    while (invasion['pendingSpawns'].length > 0) step();
    run(1);
    const ids = marchers(world);
    expect(ids.length).toBeGreaterThan(0);
    const before = ids.map((id) => Math.hypot(posOf(world, id).x - hole.x, posOf(world, id).y - hole.y));
    for (const id of ids) {
      const march = marchOf(world, id)!;
      expect(march.hole).toEqual(hole);
      expect(march.entrance).toEqual({ x: next.entrance!.x, y: next.entrance!.y });
      const path = world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
      expect(path.waypoints.at(-1)).toEqual(hole);
    }
    run(4);
    ids.forEach((id, i) => {
      expect(Math.hypot(posOf(world, id).x - hole.x, posOf(world, id).y - hole.y)).toBeLessThan(before[i] - 4);
    });
  });

  it('a unit that reaches the hole digs in, comes out at the matching entrance and goes for the queen', () => {
    const { world, ug, queen, invasion, toNightfall, step, now } = setup();
    toNightfall();
    const night = now();
    const entrance = invasion['waveEntrance'] as { x: number; y: number } | null;
    expect(entrance).not.toBeNull();
    let dug = false;
    while (inside(world).length === 0 && now() - night < 60) {
      step();
      if (marchers(world).some((id) => marchOf(world, id)!.phase === 'digging')) dug = true;
    }
    const arrived = now() - night;
    expect(dug).toBe(true);
    // The march fits the night: in after a real walk, with time left to fight below
    expect(arrived).toBeGreaterThan(12);
    expect(arrived).toBeLessThan(40);
    expect(waveRuntimeFor(world).fx.some((fx) => fx.kind === 'dig' && fx.layer === Layer.Surface)).toBe(true);
    const id = inside(world)[0];
    const pos = posOf(world, id);
    expect({ x: Math.floor(pos.x), y: Math.floor(pos.y) }).toEqual(entrance);
    expect(ug.getEntrances()).toContainEqual(entrance);
    expect(marchOf(world, id)).toBeUndefined();
    expect(speedFactorOf(world, id, MARCH_SPEED_KEY)).toBe(1);
    for (let i = 0; i < 1 / DT; i++) step();
    expect(world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!.targetEntityId).toBe(queen);
    // The counter keeps counting the units on both layers
    expect(invasion.getInfo().remaining).toBe(waveComposition(1).total);
  });
});

describe('stopping them before they get in', () => {
  it('surface defenses kill the column on the way, and the counter drops with each kill', () => {
    const { world, invasion, defenses, toNightfall, step, now } = setup();
    // Wave 1 comes from the west (no den): spines along its way in
    for (const [dx, dy] of [[-4, -2], [-4, 2], [-6, -1], [-6, 1], [-3, 0], [-5, 0]]) {
      expect(defenses.place('spine', 'surface', NEST.x + dx, NEST.y + dy).ok).toBe(true);
    }
    toNightfall();
    const night = now();
    const total = waveComposition(1).total;
    const counts = new Set<number>();
    let broke = false;
    while (invasion.getInfo().active && now() - night < 60) {
      step();
      counts.add(invasion.getInfo().remaining);
      if (inside(world).length > 0) broke = true;
    }
    expect(broke).toBe(false);
    expect(invasion.getInfo().active).toBe(false);
    expect(world.metrics.wavesRepelled).toBe(1);
    expect(counts).toContain(total - 1);
    expect(counts).toContain(1);
  });

  it('soldiers meet them on the surface and can stop them before entry', () => {
    const { world, surface, invasion, extra, modifiers, toNightfall, step, now } = setup();
    const ai = new AntAISystem(world, surface, new VisibilityGrid(WORLD_WIDTH, WORLD_HEIGHT), modifiers);
    // The player put the colony on defense: soldiers patrol the nest
    ai.colonyPriority = ColonyPriority.Defend;
    extra.push(ai);
    for (let i = 0; i < 6; i++) {
      const id = createAnt(world, NEST.x - 3, NEST.y - 2 + i, AntRole.Soldier);
      const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      ant.state = AntState.PatrollingNest;
      const hunger = world.getComponent<HungerComponent>(id, COMPONENT.HUNGER)!;
      hunger.current = hunger.max;
    }
    toNightfall();
    const night = now();
    let broke = false;
    while (invasion.getInfo().active && now() - night < 60) {
      step();
      if (inside(world).length > 0) broke = true;
    }
    expect(broke).toBe(false);
    expect(invasion.getInfo().active).toBe(false);
  });
});

describe('walls on the way', () => {
  it('goes around a lone wall and leaves it standing', () => {
    const { world, surface, defenses, toNightfall, step, now } = setup();
    const wall = wallAt(world, surface, defenses, NEST.x - 8, NEST.y, 450);
    toNightfall();
    const night = now();
    while (inside(world).length === 0 && now() - night < 60) step();
    expect(inside(world).length).toBeGreaterThan(0);
    expect(world.hasEntity(wall)).toBe(true);
  });

  it('a wall line it cannot go around blocks it until it breaks through', () => {
    const { world, surface, defenses, toNightfall, step, now } = setup();
    const line = NEST.x - 10;
    const walls: EntityId[] = [];
    for (let y = 0; y < WORLD_HEIGHT; y++) walls.push(wallAt(world, surface, defenses, line, y, 60));
    toNightfall();
    const night = now();
    let crossedWhileStanding = false;
    while (inside(world).length === 0 && now() - night < 70) {
      step();
      const allStanding = walls.every((w) => world.hasEntity(w));
      if (allStanding && beetles(world).some((id) => posOf(world, id).x > line + 0.5)) crossedWhileStanding = true;
    }
    expect(crossedWhileStanding).toBe(false);
    expect(walls.some((w) => !world.hasEntity(w))).toBe(true);
    expect(inside(world).length).toBeGreaterThan(0);
  });
});

describe('elites and bosses take the same road', () => {
  it('wave 5 elites march on the surface with their affixes', () => {
    const { world, invasion, toNightfall, step } = setup();
    invasion['waveNumber'] = 4;
    toNightfall();
    while (invasion['pendingSpawns'].length > 0) step();
    const elites = marchers(world).filter((id) => world.getComponent(id, 'elite'));
    expect(elites).toHaveLength(waveComposition(5, 'wildlife').elites.length);
    for (const id of elites) expect(layerOf(world, id)).toBe(Layer.Surface);
  });

  it('the Acorazado Colosal is too big for the hole: it besieges it, pounds the mound, then widens it and gets in', () => {
    const { world, invasion, toNightfall, step, now } = setup();
    invasion['waveNumber'] = 2;
    toNightfall();
    while (invasion['pendingSpawns'].length > 0) step();
    const boss = world.query(BOSS_COMPONENT)[0];
    expect(layerOf(world, boss)).toBe(Layer.Surface);
    expect(marchOf(world, boss)?.phase).toBe('marching');
    // Only the boss is left on the road
    for (const id of beetles(world)) if (id !== boss) dealDamage(world, id, 1e9);
    const night = now();
    while (marchOf(world, boss)?.phase !== 'siege' && now() - night < 60) step();
    expect(marchOf(world, boss)?.phase).toBe('siege');
    expect(layerOf(world, boss)).toBe(Layer.Surface);
    expect(world.notifications.some((n) => n.message.includes('asedia'))).toBe(true);
    // A worker by the hole and the nest's stockpile take the pounding
    const hole = marchOf(world, boss)!.hole;
    const worker = createAnt(world, hole.x + 1, hole.y + 1, AntRole.Worker);
    const nest = world.getComponent<NestComponent>(world.query(COMPONENT.NEST)[0], COMPONENT.NEST)!;
    nest.foodStored = 100;
    for (let i = 0; i < SIEGE_TUNING.poundEvery / DT + 2; i++) step();
    const hp = world.getComponent<HealthComponent>(worker, COMPONENT.HEALTH);
    expect(!hp || hp.current < hp.max).toBe(true);
    expect(nest.foodStored).toBeLessThan(100);
    expect(layerOf(world, boss)).toBe(Layer.Surface);
    // Nobody stops it: it widens the hole and breaks in
    for (let i = 0; i < (SIEGE_TUNING.seconds + MARCH_TUNING.digSeconds + 1) / DT; i++) step();
    expect(world.hasEntity(boss)).toBe(true);
    expect(layerOf(world, boss)).toBe(Layer.Underground);
    expect(marchOf(world, boss)).toBeUndefined();
    expect(invasion.getInfo().boss).toMatchObject({ name: 'Acorazado Colosal' });
  });
});
