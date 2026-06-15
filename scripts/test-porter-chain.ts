// Headless integration test: surface stockpile → porters → pantry → fungus farm.
// Uses the REAL systems (Porter, Transit, Movement, FungusFarm) with real grids.
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { PorterSystem } from '../src/game/systems/PorterSystem';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { FungusFarmSystem } from '../src/game/systems/FungusFarmSystem';
import { createNest, createAnt } from '../src/game/entities/factories';
import { ChamberType, TerrainType } from '../src/simulation/world/types';
import { COMPONENT, AntRole, type NestComponent, type AntComponent, type LayerComponent } from '../src/game/components/components';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../src/shared/constants';

const world = new World();
const surface = new TileGrid();
const ug = new UndergroundGrid();
const modifiers = createDefaultModifiers();

// Clear surface area around nest like GameManager does
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
nest.foodStored = 2000; // long-game scenario: way more surface food than pantry capacity (450)

// 6 idle workers near the nest
const antIds: number[] = [];
for (let i = 0; i < 6; i++) antIds.push(createAnt(world, nx + 1 + (i % 3), ny + 1 + Math.floor(i / 3), AntRole.Worker));

// Designate farm tiles underground (walkable tunnel tiles)
let farmTiles = 0;
for (let y = 1; y < ug.height - 1 && farmTiles < 6; y++) {
  for (let x = 1; x < ug.width - 1 && farmTiles < 6; x++) {
    const t = ug.getTile(x, y);
    if (t && t.walkable && t.chamberType === null) { t.chamberType = ChamberType.FungusFarm; farmTiles++; }
  }
}
console.log('farm tiles:', farmTiles);

const transit = new TransitSystem(world, ug);
const porter = new PorterSystem(world, ug, surface, transit);
const movement = new MovementSystem(world, surface, modifiers, ug);
const farm = new FungusFarmSystem(world, ug);

world.addSystem(porter);
world.addSystem(movement);
world.addSystem(transit);
world.addSystem(farm);

const dt = 1 / 60;
for (let frame = 0; frame < 60 * 180; frame++) { // 3 minutes
  world.update(dt);
  if (frame % (60 * 30) === 0) {
    const stored = ug.getPantryStored();
    const states = antIds.map((id) => {
      const a = world.getComponent<AntComponent>(id, COMPONENT.ANT);
      const l = world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      return a ? `${a.state}@${l?.layer}` : 'dead';
    });
    console.log(
      `t=${(frame / 60).toFixed(0)}s surface=${nest.foodStored.toFixed(0)} pantry={leaf:${stored.leaf.toFixed(1)}, mush:${stored.mushroom.toFixed(1)}} states=[${states.join(', ')}]`
    );
  }
}
const stored = ug.getPantryStored();
console.log('FINAL surface:', nest.foodStored.toFixed(1), 'pantry:', JSON.stringify({ leaf: +stored.leaf.toFixed(1), mushroom: +stored.mushroom.toFixed(1), meat: +stored.meat.toFixed(1) }));
console.log('notifications:', world.notifications.map((n) => n.message));
