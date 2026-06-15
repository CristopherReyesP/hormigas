// Headless test: the entrance-jam bug. (1) Worst case: two groups crossing a
// 1-wide corridor in OPPOSITE directions — the squeeze valve must guarantee
// everyone gets through. (2) Real flow: foragers cycling through the entrance
// while others exit — food must keep arriving at the pantry.
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../src/simulation/world/VisibilityGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { AntAISystem } from '../src/game/systems/AntAISystem';
import { PorterSystem } from '../src/game/systems/PorterSystem';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { HungerSystem } from '../src/game/systems/HungerSystem';
import { createNest, createAnt, createFood } from '../src/game/entities/factories';
import {
  COMPONENT, AntRole, Layer, FoodType,
  type LayerComponent, type PositionComponent, type PathComponent, type NestComponent,
} from '../src/game/components/components';
import { UndergroundTerrainType, TerrainType } from '../src/simulation/world/types';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../src/shared/constants';

// ── Test 1: head-on traffic in a 1-wide corridor ──
{
  const world = new World();
  const ug = new UndergroundGrid();
  const surface = new TileGrid();
  const modifiers = createDefaultModifiers();
  const cy = Math.floor(ug.height / 2) + 10;
  const x0 = 10;
  const LEN = 20;
  for (let x = x0; x < x0 + LEN; x++) {
    const t = ug.getTile(x, cy)!;
    t.terrain = UndergroundTerrainType.Tunnel;
    t.walkable = true;
    t.chamberType = null;
  }
  const eastbound: number[] = [];
  const westbound: number[] = [];
  for (let i = 0; i < 5; i++) {
    const e = createAnt(world, x0 + 0.5, cy + 0.5, AntRole.Worker);
    world.getComponent<LayerComponent>(e, COMPONENT.LAYER)!.layer = Layer.Underground;
    const ep = world.getComponent<PathComponent>(e, COMPONENT.PATH)!;
    ep.waypoints = Array.from({ length: LEN - 1 }, (_, k) => ({ x: x0 + 1 + k + 0.5, y: cy + 0.5 }));
    ep.currentIndex = 0;
    eastbound.push(e);

    const w = createAnt(world, x0 + LEN - 0.5, cy + 0.5, AntRole.Worker);
    world.getComponent<LayerComponent>(w, COMPONENT.LAYER)!.layer = Layer.Underground;
    const wp = world.getComponent<PathComponent>(w, COMPONENT.PATH)!;
    wp.waypoints = Array.from({ length: LEN - 1 }, (_, k) => ({ x: x0 + LEN - 2 - k + 0.5, y: cy + 0.5 }));
    wp.currentIndex = 0;
    westbound.push(w);
  }
  world.addSystem(new MovementSystem(world, surface, modifiers, ug));
  for (let f = 0; f < 60 * 120; f++) world.update(1 / 60);

  const eArrived = eastbound.filter((id) => world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!.x > x0 + LEN - 3).length;
  const wArrived = westbound.filter((id) => world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!.x < x0 + 3).length;
  console.log(`T1 head-on 1-wide corridor: east ${eArrived}/5, west ${wArrived}/5 crossed (squeeze valve — expect 5/5 both)`);
}

// ── Test 2: entrance throughput under two-way load ──
{
  const world = new World();
  const ug = new UndergroundGrid();
  const surface = new TileGrid();
  const visibility = new VisibilityGrid();
  const modifiers = createDefaultModifiers();
  const nx = Math.floor(WORLD_WIDTH / 2);
  const ny = Math.floor(WORLD_HEIGHT / 2);
  for (let dy = -10; dy <= 10; dy++) {
    for (let dx = -10; dx <= 10; dx++) {
      const t = surface.getTile(nx + dx, ny + dy);
      if (t && !t.walkable) surface.setTile(nx + dx, ny + dy, { terrain: TerrainType.Dirt, walkable: true });
    }
  }
  const nestId = createNest(world, nx, ny);
  const nest = world.getComponent<NestComponent>(nestId, COMPONENT.NEST)!;
  nest.foodStored = 0; nest.mushroomStored = 0; nest.meatStored = 0;

  // Lots of food + 12 workers → constant two-way entrance traffic
  for (let i = 0; i < 6; i++) createFood(world, nx + 3 + (i % 3), ny - 2 + Math.floor(i / 3) * 4, 80, FoodType.Leaf);
  for (let i = 0; i < 12; i++) createAnt(world, nx + 1 + (i % 4), ny + 1 + Math.floor(i / 4), AntRole.Worker);

  const antAI = new AntAISystem(world, surface, visibility, modifiers);
  const transit = new TransitSystem(world, ug);
  antAI.setUndergroundAccess(ug, transit);
  world.addSystem(antAI);
  world.addSystem(new PorterSystem(world, ug, surface, transit));
  world.addSystem(new MovementSystem(world, surface, modifiers, ug));
  world.addSystem(new HungerSystem(world, modifiers));
  world.addSystem(transit);

  const samples: number[] = [];
  for (let f = 0; f < 60 * 180; f++) {
    world.update(1 / 60);
    if (f % (60 * 30) === 0) samples.push(Math.round(ug.getPantryStored().total));
  }
  samples.push(Math.round(ug.getPantryStored().total));
  console.log(`T2 entrance throughput: pantry over time = [${samples.join(', ')}] (must keep GROWING — no jam)`);
  const states = new Map<string, number>();
  for (const id of world.query(COMPONENT.ANT)) {
    const a = world.getComponent<any>(id, COMPONENT.ANT)!;
    const l = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
    const c = world.getComponent<any>(id, COMPONENT.CARRYING)!;
    const key = a.state + '@' + l.layer + (c.amount > 0 ? '+food' : '');
    states.set(key, (states.get(key) ?? 0) + 1);
  }
  console.log('T2 ant states:', JSON.stringify(Object.fromEntries(states)));
  const foods = world.query(COMPONENT.FOOD_SOURCE).length;
  console.log('T2 food sources left:', foods);
  for (const id of world.query(COMPONENT.ANT)) {
    const pp = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const pa = world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
    console.log('  ant', id, 'pos', pp.x.toFixed(1), pp.y.toFixed(1), 'inTransit', transit.isInTransit(id), 'waypoints', pa.waypoints.length - pa.currentIndex);
  }
  console.log(`T2 verdict: ${samples[samples.length - 1] > samples[1] && samples[samples.length - 1] > 50 ? 'FLOWING ✅' : 'JAMMED ❌'}`);
}
