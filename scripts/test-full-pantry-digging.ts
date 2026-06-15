// Headless test of the reported game-breaker: pantry FULL → haulers wait holding
// food → excavation never gets workers → can't expand storage → colony soft-locked.
// Expected now: waiting haulers convert to diggers, tiles get excavated, the
// player designates new storage, and the held loads finally land in the pantry.
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../src/simulation/world/VisibilityGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { AntAISystem } from '../src/game/systems/AntAISystem';
import { PorterSystem } from '../src/game/systems/PorterSystem';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { ExcavationSystem } from '../src/game/systems/ExcavationSystem';
import { HungerSystem } from '../src/game/systems/HungerSystem';
import { createNest, createAnt, createFood } from '../src/game/entities/factories';
import { COMPONENT, AntRole, FoodType, type NestComponent } from '../src/game/components/components';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../src/shared/constants';
import { TerrainType, ChamberType } from '../src/simulation/world/types';

const world = new World();
const surface = new TileGrid();
const ug = new UndergroundGrid();
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

// Pantry COMPLETELY FULL of leaves
for (;;) {
  const t = ug.findDepositTile('leaf');
  if (!t) break;
  if (ug.depositFood(t.x, t.y, 'leaf', 50) <= 0) break;
}
const capBefore = ug.getPantryCapacity();
console.log(`pantry full: ${ug.getPantryStored().total}/${capBefore}`);

// Surface food + 6 workers → they will harvest and try to deposit
for (let i = 0; i < 4; i++) createFood(world, nx + 3 + i, ny - 2, 60, FoodType.Leaf);
for (let i = 0; i < 6; i++) createAnt(world, nx + 1 + (i % 3), ny + 1, AntRole.Worker);

const antAI = new AntAISystem(world, surface, visibility, modifiers);
const transit = new TransitSystem(world, ug);
antAI.setUndergroundAccess(ug, transit);
const excavation = new ExcavationSystem(world, ug, transit);
const porter = new PorterSystem(world, ug, surface, transit);
porter.setDigJobsProvider(() => excavation.getPendingJobCount());
world.addSystem(antAI);
world.addSystem(porter);
world.addSystem(excavation);
world.addSystem(new MovementSystem(world, surface, modifiers, ug));
world.addSystem(new HungerSystem(world, modifiers));
world.addSystem(transit);

// Player designates 4 dig jobs next to the food chamber (earth tiles)
const pantryTiles = ug.getPantryTiles();
const px = pantryTiles[0].x;
const py = pantryTiles[0].y;
const digTargets: Array<{ x: number; y: number }> = [];
for (let dy = 0; dy < 4 && digTargets.length < 4; dy++) {
  const tx = px - 1; // adjacent to the pantry chamber edge — reachable digging
  const ty = py + dy;
  if (excavation.designateTile(tx, ty)) digTargets.push({ x: tx, y: ty });
}
console.log(`dig jobs designated: ${digTargets.length}`);

// Phase 1: run — despite the full pantry, the tiles MUST get excavated
for (let f = 0; f < 60 * 150; f++) world.update(1 / 60);
const dug = digTargets.filter((t) => ug.getTile(t.x, t.y)!.walkable).length;
console.log(`excavated: ${dug}/${digTargets.length} (old code: 0 — all workers frozen in hauling-wait)`);

// Phase 2: player designates the new tiles as storage → held loads must land
for (const t of digTargets) {
  const tile = ug.getTile(t.x, t.y)!;
  if (tile.walkable) tile.chamberType = ChamberType.FoodStorage;
}
ug.invalidateChamberCache();
for (let f = 0; f < 60 * 60; f++) world.update(1 / 60);
const after = ug.getPantryStored().total;
console.log(`pantry after expansion: ${after.toFixed(0)} (was ${capBefore} — held mouthfuls must have landed)`);
console.log(`VERDICT: ${dug >= 3 && after > capBefore ? 'GAME UNBROKEN ✅' : 'STILL BROKEN ❌'}`);
