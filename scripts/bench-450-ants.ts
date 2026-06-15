// Benchmark: 450 ants + 12 beetles + 200 food sources, measure ms/tick of the
// hot per-frame systems, and isolate the cost of the OLD per-ant query pattern.
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../src/simulation/world/VisibilityGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { AntAISystem } from '../src/game/systems/AntAISystem';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { PheromoneSystem } from '../src/game/systems/PheromoneSystem';
import { FogOfWarSystem } from '../src/game/systems/FogOfWarSystem';
import { HungerSystem } from '../src/game/systems/HungerSystem';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { createNest, createAnt, createFood, createBeetle } from '../src/game/entities/factories';
import { COMPONENT, AntRole } from '../src/game/components/components';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../src/shared/constants';
import { TerrainType } from '../src/simulation/world/types';

const world = new World();
const surface = new TileGrid();
const ug = new UndergroundGrid();
const visibility = new VisibilityGrid();
const modifiers = createDefaultModifiers();

const nx = Math.floor(WORLD_WIDTH / 2);
const ny = Math.floor(WORLD_HEIGHT / 2);
for (let dy = -20; dy <= 20; dy++) {
  for (let dx = -20; dx <= 20; dx++) {
    const t = surface.getTile(nx + dx, ny + dy);
    if (t && !t.walkable) surface.setTile(nx + dx, ny + dy, { terrain: TerrainType.Dirt, walkable: true });
  }
}

createNest(world, nx, ny);

const roles = [AntRole.Worker, AntRole.Worker, AntRole.Soldier, AntRole.Scout];
for (let i = 0; i < 450; i++) {
  createAnt(world, nx - 15 + (i % 30), ny - 15 + Math.floor(i / 30) * 2, roles[i % 4]);
}
for (let i = 0; i < 200; i++) {
  createFood(world, (i * 7) % WORLD_WIDTH, (i * 13) % WORLD_HEIGHT, 100);
}
for (let i = 0; i < 12; i++) {
  createBeetle(world, (i * 31) % WORLD_WIDTH, (i * 17) % WORLD_HEIGHT);
}

const antAI = new AntAISystem(world, surface, visibility, modifiers);
const transit = new TransitSystem(world, ug);
antAI.setUndergroundAccess(ug, transit);
world.addSystem(antAI);
world.addSystem(new MovementSystem(world, surface, modifiers, ug));
world.addSystem(new PheromoneSystem(surface, modifiers));
world.addSystem(new FogOfWarSystem(world, visibility));
world.addSystem(new HungerSystem(world, modifiers));
world.addSystem(transit);

const dt = 1 / 60;
// Warmup
for (let i = 0; i < 120; i++) world.update(dt);

const TICKS = 600;
const t0 = performance.now();
for (let i = 0; i < TICKS; i++) world.update(dt);
const t1 = performance.now();
console.log(`NEW code: ${((t1 - t0) / TICKS).toFixed(3)} ms/tick over ${TICKS} ticks (${world.getEntityCount()} entities)`);

// Isolate the REMOVED cost: the old pattern ran findAttacker (2 queries) +
// findNearestBeetle (2 queries) per ant per frame
const ants = world.query(COMPONENT.ANT);
const t2 = performance.now();
for (let tick = 0; tick < TICKS; tick++) {
  for (const id of ants) {
    void id;
    world.query(COMPONENT.BEETLE, COMPONENT.COMBAT);
    world.query(COMPONENT.CRICKET, COMPONENT.COMBAT);
    world.query(COMPONENT.BEETLE, COMPONENT.POSITION);
    world.query(COMPONENT.CRICKET, COMPONENT.POSITION);
  }
}
const t3 = performance.now();
console.log(`OLD per-ant query pattern alone: ${((t3 - t2) / TICKS).toFixed(3)} ms/tick extra (${ants.length} ants)`);
