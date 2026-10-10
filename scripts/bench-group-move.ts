// Benchmark: order 30 and 60 ants across the map in one command and measure
// what it costs per tick.
//   before: every ordered ant runs the old linear-open-list A* in the same tick
//   after:  binary-heap A*, routes rationed to ORDER_PATHS_PER_TICK per tick
// Run: npx tsx scripts/bench-group-move.ts
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../src/simulation/world/VisibilityGrid';
import { TerrainType } from '../src/simulation/world/types';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { AntAISystem } from '../src/game/systems/AntAISystem';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { PheromoneSystem } from '../src/game/systems/PheromoneSystem';
import { FogOfWarSystem } from '../src/game/systems/FogOfWarSystem';
import { HungerSystem } from '../src/game/systems/HungerSystem';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { hasActiveOrder, issueMoveOrders } from '../src/game/systems/helpers/playerOrders';
import { createAnt, createFood, createNest } from '../src/game/entities/factories';
import { AntRole, COMPONENT, type PlayerOrderComponent, type PositionComponent } from '../src/game/components/components';
import { findPath } from '../src/simulation/pathfinding/AStar';
import { referenceFindPath } from '../src/simulation/pathfinding/referenceAStar';
import { createSeededRng } from '../src/game/run/MutationOffers';
import { ORDER_PATHS_PER_TICK, ORDER_PATH_MAX_STEPS, WORLD_HEIGHT, WORLD_WIDTH } from '../src/shared/constants';

// TileGrid draws its terrain from Math.random: seed it so every run benches the same map
Math.random = createSeededRng(20261009);

const dt = 1 / 60;
const NX = Math.floor(WORLD_WIDTH / 2);
const NY = Math.floor(WORLD_HEIGHT / 2);

function buildColony() {
  const world = new World();
  const surface = new TileGrid();
  const ug = new UndergroundGrid();
  const visibility = new VisibilityGrid();
  const modifiers = createDefaultModifiers();
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      if (dx * dx + dy * dy <= 64) surface.setTile(NX + dx, NY + dy, { terrain: TerrainType.Dirt, walkable: true });
    }
  }
  createNest(world, NX, NY);
  const roles = [AntRole.Worker, AntRole.Worker, AntRole.Soldier, AntRole.Scout];
  const ants: number[] = [];
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    const r = 2 + (i % 5);
    ants.push(createAnt(world, Math.round(NX + Math.cos(a) * r), Math.round(NY + Math.sin(a) * r), roles[i % 4]));
  }
  for (let i = 0; i < 80; i++) createFood(world, (i * 7) % WORLD_WIDTH, (i * 13) % WORLD_HEIGHT, 100);

  const ai = new AntAISystem(world, surface, visibility, modifiers);
  const transit = new TransitSystem(world, ug);
  ai.setUndergroundAccess(ug, transit);
  world.addSystem(ai);
  world.addSystem(new MovementSystem(world, surface, modifiers, ug));
  world.addSystem(new PheromoneSystem(surface, modifiers));
  world.addSystem(new FogOfWarSystem(world, visibility));
  world.addSystem(new HungerSystem(world, modifiers));
  world.addSystem(transit);
  return { world, surface, transit, ants };
}

/** A walkable tile far from the nest that the nest can actually reach. */
function farTarget(surface: TileGrid): { x: number; y: number } {
  let best = { x: NX, y: NY };
  let bestDist = 0;
  for (let y = 4; y < WORLD_HEIGHT - 4; y += 3) {
    for (let x = 4; x < WORLD_WIDTH - 4; x += 3) {
      const d = Math.hypot(x - NX, y - NY);
      if (d <= bestDist || !surface.isWalkable(x, y)) continue;
      if (!findPath(surface, { x: NX, y: NY }, { x, y }, ORDER_PATH_MAX_STEPS)) continue;
      best = { x, y };
      bestDist = d;
    }
  }
  return best;
}

function ms(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

function runTicks(world: World, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(ms(() => world.update(dt)));
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const fmt = (n: number) => n.toFixed(2).padStart(7);

for (const groupSize of [30, 60]) {
  const { world, surface, transit, ants } = buildColony();
  runTicks(world, 180); // warm up: the colony spreads out
  const baseline = runTicks(world, 240);

  const group = ants.slice(0, groupSize).filter((id) => world.hasEntity(id));
  const target = farTarget(surface);
  const result = issueMoveOrders(world, surface, group, target, transit);
  if (!result) throw new Error('no ant took the order');

  // The same routes three ways, all in one go: the hitch an unrationed order would cause
  const legs = result.ordered.map((id) => {
    const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const order = world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER)!;
    return { from: { x: Math.round(pos.x), y: Math.round(pos.y) }, to: order.target };
  });
  // Warm both versions up first so the JIT does not bias the comparison
  for (const leg of legs.slice(0, 5)) {
    referenceFindPath(surface, leg.from, leg.to);
    findPath(surface, leg.from, leg.to);
  }
  let legacyFound = 0;
  const legacyBurst = ms(() => {
    for (const leg of legs) if (referenceFindPath(surface, leg.from, leg.to)) legacyFound++;
  });
  const heapBurst = ms(() => {
    for (const leg of legs) findPath(surface, leg.from, leg.to);
  });
  let heapFound = 0;
  const heapOrderBurst = ms(() => {
    for (const leg of legs) if (findPath(surface, leg.from, leg.to, ORDER_PATH_MAX_STEPS)) heapFound++;
  });

  // The real thing: rationed routing inside the live simulation
  const routingTicks = Math.ceil(result.ordered.length / ORDER_PATHS_PER_TICK);
  const ordered = runTicks(world, 60 * 50);
  const routingWindow = ordered.slice(0, routingTicks + 2);
  // Warriors keep a guard order once they arrive; only the move itself counts as still under way
  const stillOrdered = result.ordered.filter((id) => hasActiveOrder(world, id)).length;

  const avgBase = mean(baseline);
  console.log(`\n=== ${result.ordered.length} ants ordered from the nest to (${target.x}, ${target.y}), ${Math.round(Math.hypot(target.x - NX, target.y - NY))} tiles away ===`);
  console.log(`baseline tick (no order)                 mean ${fmt(avgBase)} ms   max ${fmt(Math.max(...baseline))} ms`);
  console.log(`BEFORE  order tick, linear A* x${legs.length} (2000 steps)  ${fmt(avgBase + legacyBurst)} ms   (${legacyFound}/${legs.length} routes found)`);
  console.log(`        heap A* x${legs.length}, same budget, one tick   ${fmt(avgBase + heapBurst)} ms`);
  console.log(`        heap A* x${legs.length}, order budget, one tick  ${fmt(avgBase + heapOrderBurst)} ms   (${heapFound}/${legs.length} routes found)`);
  console.log(`AFTER   rationed, ${ORDER_PATHS_PER_TICK}/tick over ${routingTicks} ticks      mean ${fmt(mean(routingWindow))} ms   max ${fmt(Math.max(...routingWindow))} ms`);
  console.log(`        next 50 s of marching                mean ${fmt(mean(ordered))} ms   max ${fmt(Math.max(...ordered))} ms   (${result.ordered.length - stillOrdered}/${result.ordered.length} arrived)`);
}
