import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { TileGrid } from '../../simulation/world/TileGrid';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { TerrainType } from '../../simulation/world/types';
import type { PathGrid } from '../../simulation/pathfinding/AStar';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { createAnt, createBeetle, createNest } from '../entities/factories';
import {
  AntRole,
  AntState,
  COMPONENT,
  Layer,
  type AntComponent,
  type LayerComponent,
  type NestComponent,
  type PathComponent,
  type PlayerOrderComponent,
  type PositionComponent,
} from '../components/components';
import { ORDER_ARRIVE_RADIUS, ORDER_PATHS_PER_TICK, STUCK_STALL_SECONDS, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { AntAISystem } from './AntAISystem';
import { MovementSystem } from './MovementSystem';
import { TransitSystem } from './TransitSystem';
import { PorterSystem } from './PorterSystem';
import { UndergroundInvasionSystem } from './UndergroundInvasionSystem';
import { DayNightSystem } from './DayNightSystem';
import { formationSlots, issueMoveOrders, hasPlayerOrder } from './helpers/playerOrders';

const NX = Math.floor(WORLD_WIDTH / 2);
const NY = Math.floor(WORLD_HEIGHT / 2);
const TICK = 1 / 60;

function openGrid(width: number, height: number, solid: (x: number, y: number) => boolean = () => false): PathGrid {
  return {
    width,
    height,
    isWalkable: (x, y) => x >= 0 && y >= 0 && x < width && y < height && !solid(x, y),
  };
}

function setup() {
  const world = new World();
  const surface = new TileGrid();
  for (let dy = -24; dy <= 24; dy++) {
    for (let dx = -30; dx <= 30; dx++) {
      surface.setTile(NX + dx, NY + dy, { terrain: TerrainType.Dirt, walkable: true });
    }
  }
  const underground = new UndergroundGrid();
  const nestId = createNest(world, NX, NY);
  const transit = new TransitSystem(world, underground);
  const modifiers = createDefaultModifiers();
  const ai = new AntAISystem(world, surface, new VisibilityGrid(WORLD_WIDTH, WORLD_HEIGHT), modifiers);
  ai.setUndergroundAccess(underground, transit);
  const movement = new MovementSystem(world, surface, modifiers, underground);
  const tick = () => {
    ai.update(TICK);
    movement.update(TICK);
  };
  const antOf = (id: number) => world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
  const posOf = (id: number) => world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
  const pathOf = (id: number) => world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
  const orderOf = (id: number) => world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER);
  return { world, surface, underground, transit, ai, movement, nestId, tick, antOf, posOf, pathOf, orderOf, modifiers };
}

describe('formation slots', () => {
  it('gives distinct walkable tiles in a compact clump around the target', () => {
    const grid = openGrid(30, 30);
    const slots = formationSlots(grid, { x: 15, y: 15 }, 9);
    expect(slots).toHaveLength(9);
    expect(new Set(slots.map((s) => `${s.x},${s.y}`)).size).toBe(9);
    for (const s of slots) {
      expect(grid.isWalkable(s.x, s.y)).toBe(true);
      expect(Math.hypot(s.x - 15, s.y - 15)).toBeLessThanOrEqual(Math.SQRT2 + 1e-9);
    }
    expect(slots[0]).toEqual({ x: 15, y: 15 });
  });

  it('never puts a slot on rock or behind a wall', () => {
    // A wall down column 10; rocks scattered on the near side
    const grid = openGrid(30, 30, (x, y) => x === 10 || (x + y) % 5 === 0);
    const slots = formationSlots(grid, { x: 7, y: 14 }, 40);
    expect(slots).toHaveLength(40);
    expect(new Set(slots.map((s) => `${s.x},${s.y}`)).size).toBe(40);
    for (const s of slots) {
      expect(grid.isWalkable(s.x, s.y)).toBe(true);
      expect(s.x).toBeLessThan(10);
    }
  });

  it('returns only what a closed pocket holds', () => {
    const grid = openGrid(10, 10, (x, y) => !(x >= 4 && x <= 5 && y >= 4 && y <= 5));
    expect(formationSlots(grid, { x: 4, y: 4 }, 12)).toHaveLength(4);
  });

  it('every ant in a big group gets its own walkable slot', () => {
    const { world, surface, posOf, orderOf } = setup();
    const ids = Array.from({ length: 24 }, (_, i) => createAnt(world, NX - 6 + (i % 6), NY - 2 + Math.floor(i / 6), AntRole.Soldier));
    const result = issueMoveOrders(world, surface, ids, { x: NX + 18, y: NY + 6 });
    expect(result?.ordered).toHaveLength(24);
    const targets = ids.map((id) => orderOf(id)!.target);
    expect(new Set(targets.map((t) => `${t.x},${t.y}`)).size).toBe(24);
    for (const t of targets) expect(surface.isWalkable(t.x, t.y)).toBe(true);
    // The ant nearest the click takes the center slot
    const nearest = [...ids].sort((a, b) => Math.hypot(posOf(a).x - (NX + 18), posOf(a).y - (NY + 6)) - Math.hypot(posOf(b).x - (NX + 18), posOf(b).y - (NY + 6)))[0];
    expect(orderOf(nearest)!.target).toEqual({ x: NX + 18, y: NY + 6 });
  });

  it('snaps a click on rock to the nearest walkable tile and ignores non-ants and ants below', () => {
    const { world, surface, orderOf } = setup();
    surface.setTile(NX + 10, NY, { terrain: TerrainType.Stone, walkable: false });
    const ant = createAnt(world, NX + 2, NY, AntRole.Worker);
    const below = createAnt(world, NX + 2, NY + 1, AntRole.Worker);
    world.getComponent<LayerComponent>(below, COMPONENT.LAYER)!.layer = Layer.Underground;
    const beetle = createBeetle(world, NX + 3, NY);
    const result = issueMoveOrders(world, surface, [ant, below, beetle], { x: NX + 10, y: NY });
    expect(result?.ordered).toEqual([ant]);
    expect(surface.isWalkable(result!.target.x, result!.target.y)).toBe(true);
    expect(Math.hypot(result!.target.x - (NX + 10), result!.target.y - NY)).toBe(1);
    expect(orderOf(below)).toBeUndefined();
    expect(orderOf(beetle)).toBeUndefined();
  });
});

describe('a move order drives the ant until it arrives', () => {
  it('beats the colony AI and the stall nets, then hands the ant back to its job', () => {
    const { world, surface, tick, antOf, posOf, pathOf, orderOf } = setup();
    const id = createAnt(world, NX + 3, NY, AntRole.Worker);
    const target = { x: NX + 16, y: NY + 6 };
    issueMoveOrders(world, surface, [id], target);

    // Make every net armed: stalled long enough, a net state, an empty route
    const ant = antOf(id);
    ant.state = AntState.GoingToFood;
    ant.stateTimer = 9;
    ant.stuckTimer = STUCK_STALL_SECONDS + 1;
    ant.lastX = posOf(id).x;
    ant.lastY = posOf(id).y;

    let ticks = 0;
    while (orderOf(id) && ticks < 60 * 30) {
      tick();
      ticks++;
      if (orderOf(id)) {
        expect(ant.state).toBe(AntState.Moving);
        const end = pathOf(id).waypoints.at(-1);
        if (end) expect(end).toEqual(target);
      }
    }
    expect(orderOf(id)).toBeUndefined();
    expect(Math.hypot(posOf(id).x - target.x, posOf(id).y - target.y)).toBeLessThanOrEqual(ORDER_ARRIVE_RADIUS);

    tick();
    expect(ant.state).toBe(AntState.Searching);
    expect(hasPlayerOrder(world, id)).toBe(false);
  });

  it('a loaded worker delivers its load after the order ends', () => {
    const { world, surface, tick, antOf, orderOf } = setup();
    const id = createAnt(world, NX + 2, NY, AntRole.Worker);
    const carrying = world.getComponent<{ amount: number; resourceType: string | null }>(id, COMPONENT.CARRYING)!;
    carrying.amount = 5;
    carrying.resourceType = 'leaf';
    issueMoveOrders(world, surface, [id], { x: NX + 6, y: NY });
    for (let i = 0; i < 60 * 10 && orderOf(id); i++) tick();
    expect(orderOf(id)).toBeUndefined();
    tick();
    expect(antOf(id).state).toBe(AntState.ReturningHome);
  });

  it('spreads the routes of a big group over several ticks', () => {
    const { world, surface, ai, pathOf } = setup();
    const ids = Array.from({ length: 30 }, (_, i) => createAnt(world, NX - 5 + (i % 10), NY - 1 + Math.floor(i / 10), AntRole.Soldier));
    issueMoveOrders(world, surface, ids, { x: NX + 22, y: NY - 12 });
    const routed = () => ids.filter((id) => pathOf(id).waypoints.length > 0).length;

    ai.update(TICK);
    expect(routed()).toBe(ORDER_PATHS_PER_TICK);
    const ticksNeeded = Math.ceil(ids.length / ORDER_PATHS_PER_TICK);
    for (let i = 1; i < ticksNeeded; i++) ai.update(TICK);
    expect(routed()).toBe(ids.length);
  });

  it('an order calls off a ride down the shaft', () => {
    const { world, surface, transit, orderOf } = setup();
    const id = createAnt(world, NX, NY, AntRole.Worker);
    transit.requestTransit(id, 'enter');
    expect(transit.isInTransit(id)).toBe(true);
    issueMoveOrders(world, surface, [id], { x: NX + 8, y: NY }, transit);
    expect(transit.isInTransit(id)).toBe(false);
    expect(orderOf(id)).toBeDefined();
  });
});

describe('colony systems leave ordered ants alone', () => {
  it('porter recruiting skips an ordered worker, even one whose state reads free', () => {
    const { world, surface, underground, transit, nestId, antOf } = setup();
    world.getComponent<NestComponent>(nestId, COMPONENT.NEST)!.foodStored = 40;
    const porters = new PorterSystem(world, underground, surface, transit);

    const ordered = createAnt(world, NX + 2, NY, AntRole.Worker);
    issueMoveOrders(world, surface, [ordered], { x: NX + 12, y: NY });
    antOf(ordered).state = AntState.Searching;
    porters.update(TICK);
    expect(antOf(ordered).state).toBe(AntState.Searching);

    const free = createAnt(world, NX + 2, NY + 1, AntRole.Worker);
    antOf(free).state = AntState.Searching;
    porters.update(3); // past the recruit cooldown
    expect(antOf(free).state).toBe(AntState.FetchingFood);
    expect(antOf(ordered).state).toBe(AntState.Searching);
  });

  it('the garrison and wave call-ups skip ordered soldiers', () => {
    const { world, surface, underground, transit, antOf, modifiers } = setup();
    const invasion = new UndergroundInvasionSystem(world, underground, transit, new DayNightSystem(world, modifiers));
    invasion.setGarrison(3);
    const ordered = createAnt(world, NX + 2, NY, AntRole.Soldier);
    issueMoveOrders(world, surface, [ordered], { x: NX + 12, y: NY });
    antOf(ordered).state = AntState.Searching;
    const free = createAnt(world, NX + 2, NY + 1, AntRole.Soldier);
    antOf(free).state = AntState.Searching;

    invasion.update(TICK);
    expect(transit.isInTransit(free)).toBe(true);
    expect(transit.isInTransit(ordered)).toBe(false);

    invasion['deploySoldiers'](5);
    expect(transit.isInTransit(ordered)).toBe(false);
  });

  it('the total-defense draft below skips an ordered ant', () => {
    const { world, surface, underground, transit, antOf, modifiers } = setup();
    const invasion = new UndergroundInvasionSystem(world, underground, transit, new DayNightSystem(world, modifiers));
    const entrance = underground.getEntrances()[0];
    const ordered = createAnt(world, NX + 2, NY, AntRole.Worker);
    issueMoveOrders(world, surface, [ordered], { x: NX + 12, y: NY });
    const free = createAnt(world, NX + 2, NY, AntRole.Worker);
    for (const id of [ordered, free]) {
      world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
      const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      pos.x = entrance.x + 0.5;
      pos.y = entrance.y + 1.5;
      antOf(id).state = AntState.Idle;
    }
    invasion['spawnInvader']();

    invasion.update(TICK);
    expect(antOf(free).state).toBe(AntState.AttackingEnemy);
    expect(antOf(ordered).state).toBe(AntState.Idle);
  });
});
