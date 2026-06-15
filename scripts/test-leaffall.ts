// Headless test: the leafFall event drops 4-6 giant walkable-ground leaves near the nest.
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { EVENT_REGISTRY } from '../src/game/events/EventDefinitions';
import { COMPONENT, FoodType, type FoodSourceComponent, type PositionComponent } from '../src/game/components/components';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../src/shared/constants';
import { TerrainType } from '../src/simulation/world/types';

const world = new World();
const grid = new TileGrid();
const nestX = Math.floor(WORLD_WIDTH / 2);
const nestY = Math.floor(WORLD_HEIGHT / 2);

// Clear ground around the nest like the real game does
for (let dy = -22; dy <= 22; dy++) {
  for (let dx = -22; dx <= 22; dx++) {
    const t = grid.getTile(nestX + dx, nestY + dy);
    if (t && !t.walkable) grid.setTile(nestX + dx, nestY + dy, { terrain: TerrainType.Dirt, walkable: true });
  }
}

const def = EVENT_REGISTRY.find((e) => e.type === 'leafFall')!;
def.onStart!({ world, grid, nestX, nestY });

const leaves: Array<{ amount: number; dist: number }> = [];
for (const id of world.query(COMPONENT.FOOD_SOURCE, COMPONENT.POSITION)) {
  const f = world.getComponent<FoodSourceComponent>(id, COMPONENT.FOOD_SOURCE)!;
  const p = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
  if (f.resourceType !== FoodType.Leaf) continue;
  leaves.push({ amount: f.amount, dist: Math.round(Math.hypot(p.x - nestX, p.y - nestY)) });
}

console.log(`leaves dropped: ${leaves.length} (expect 4-6)`);
for (const l of leaves) console.log(`  - ${l.amount} hojas a ${l.dist} tiles del nido`);
const total = leaves.reduce((s, l) => s + l.amount, 0);
console.log(`total: ${total} (expect 320-840)`);
console.log('all walkable+in-range:', leaves.every((l) => l.dist >= 5 && l.dist <= 21));
