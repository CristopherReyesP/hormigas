// Headless test: porters haul the consumption-priority type down FIRST.
// Surface stockpile has leaves AND mushrooms; with policy 'mushroom' the first
// pantry arrivals must be mushrooms (so nurses find what the colony eats first).
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { PorterSystem } from '../src/game/systems/PorterSystem';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { createNest, createAnt } from '../src/game/entities/factories';
import { COMPONENT, AntRole, type NestComponent } from '../src/game/components/components';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../src/shared/constants';
import { TerrainType } from '../src/simulation/world/types';

function runScenario(priority: 'leaf' | 'mushroom'): { leaf: number; mushroom: number } {
  const world = new World();
  const surface = new TileGrid();
  const ug = new UndergroundGrid();
  const modifiers = createDefaultModifiers();
  ug.setConsumptionPriority(priority);

  const nx = Math.floor(WORLD_WIDTH / 2);
  const ny = Math.floor(WORLD_HEIGHT / 2);
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      if (dx * dx + dy * dy <= 64) {
        const t = surface.getTile(nx + dx, ny + dy);
        if (t && !t.walkable) surface.setTile(nx + dx, ny + dy, { terrain: TerrainType.Dirt, walkable: true });
      }
    }
  }

  const nestId = createNest(world, nx, ny);
  const nest = world.getComponent<NestComponent>(nestId, COMPONENT.NEST)!;
  nest.foodStored = 200; // 120 leaves (implicit) + 80 mushrooms
  nest.mushroomStored = 80;
  nest.meatStored = 0;

  for (let i = 0; i < 3; i++) createAnt(world, nx + 1 + i, ny + 1, AntRole.Worker);

  const transit = new TransitSystem(world, ug);
  world.addSystem(new PorterSystem(world, ug, surface, transit));
  world.addSystem(new MovementSystem(world, surface, modifiers, ug));
  world.addSystem(transit);

  for (let f = 0; f < 60 * 45; f++) {
    world.update(1 / 60);
    const stored = ug.getPantryStored();
    if (stored.total >= 25) break; // stop after the first loads land
  }
  const stored = ug.getPantryStored();
  return { leaf: Math.round(stored.leaf), mushroom: Math.round(stored.mushroom) };
}

const leafFirst = runScenario('leaf');
const mushFirst = runScenario('mushroom');
console.log("policy 'leaf'     → first pantry arrivals:", JSON.stringify(leafFirst));
console.log("policy 'mushroom' → first pantry arrivals:", JSON.stringify(mushFirst));
console.log('---');
console.log('leaf policy hauls leaves first:', leafFirst.leaf > leafFirst.mushroom);
console.log('mushroom policy hauls mushrooms first:', mushFirst.mushroom > mushFirst.leaf);
