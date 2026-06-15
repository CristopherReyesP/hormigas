// Headless test: a starving hurt soldier at the nest, empty surface stockpile,
// food only in the underground pantry → must descend, eat, heal, and come back up.
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../src/simulation/world/VisibilityGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { AntAISystem } from '../src/game/systems/AntAISystem';
import { UndergroundHealingSystem } from '../src/game/systems/UndergroundHealingSystem';
import { HungerSystem } from '../src/game/systems/HungerSystem';
import { createNest, createAnt } from '../src/game/entities/factories';
import {
  COMPONENT, AntRole, AntState,
  type NestComponent, type AntComponent, type LayerComponent,
  type HealthComponent, type HungerComponent,
} from '../src/game/components/components';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../src/shared/constants';
import { TerrainType } from '../src/simulation/world/types';

const world = new World();
const surface = new TileGrid();
const ug = new UndergroundGrid();
const visibility = new VisibilityGrid();
const modifiers = createDefaultModifiers();

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
nest.foodStored = 0; // surface stockpile DRY (porters took everything)
nest.mushroomStored = 0;
nest.meatStored = 0;

// Pantry stocked underground
let put = 0;
for (;;) {
  const tile = ug.findDepositTile('leaf');
  if (!tile) break;
  const acc = ug.depositFood(tile.x, tile.y, 'leaf', 40);
  if (acc <= 0) break;
  put += acc;
  if (put >= 200) break;
}
console.log('pantry stocked:', put);

// A hurt, starving soldier near the nest
const soldierId = createAnt(world, nx + 2, ny + 2, AntRole.Soldier);
const soldier = world.getComponent<AntComponent>(soldierId, COMPONENT.ANT)!;
const health = world.getComponent<HealthComponent>(soldierId, COMPONENT.HEALTH)!;
const hunger = world.getComponent<HungerComponent>(soldierId, COMPONENT.HUNGER)!;
health.current = health.max * 0.4;
hunger.current = hunger.max * 0.2;
soldier.state = AntState.PatrollingNest;

const antAI = new AntAISystem(world, surface, visibility, modifiers);
const transit = new TransitSystem(world, ug);
antAI.setUndergroundAccess(ug, transit);
const ugHeal = new UndergroundHealingSystem(world, ug, transit);
const movement = new MovementSystem(world, surface, modifiers, ug);
const hungerSys = new HungerSystem(world, modifiers);

world.addSystem(antAI);
world.addSystem(ugHeal);
world.addSystem(movement);
world.addSystem(transit);
world.addSystem(hungerSys);

const dt = 1 / 60;
let everUnderground = false;
for (let frame = 0; frame < 60 * 90; frame++) {
  world.update(dt);
  const layer = world.getComponent<LayerComponent>(soldierId, COMPONENT.LAYER);
  if (layer?.layer === 'underground') everUnderground = true;
  if (frame % (60 * 10) === 0) {
    const alive = world.hasEntity(soldierId);
    console.log(
      `t=${(frame / 60).toFixed(0)}s alive=${alive} state=${soldier.state}@${layer?.layer}` +
      ` hp=${health.current.toFixed(0)}/${health.max} hunger=${(100 * hunger.current / hunger.max).toFixed(0)}%` +
      ` pantry=${ug.getPantryStored().total.toFixed(0)}`
    );
    if (!alive) break;
  }
}

const finalLayer = world.getComponent<LayerComponent>(soldierId, COMPONENT.LAYER);
console.log('---');
console.log('survived:', world.hasEntity(soldierId));
console.log('went underground:', everUnderground);
console.log('final: hp', health.current.toFixed(0), '/', health.max, '| hunger', (100 * hunger.current / hunger.max).toFixed(0) + '%', '| layer', finalLayer?.layer);
