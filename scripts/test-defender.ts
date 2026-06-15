// Headless test: defenders post in their defense area, engage intruders near the
// post, and leave only to eat. Plus: rock pockets exist and the start is intact.
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { DefenderAISystem } from '../src/game/systems/DefenderAISystem';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { createAnt, createBeetle } from '../src/game/entities/factories';
import {
  COMPONENT, AntRole, AntState, Layer,
  type AntComponent, type LayerComponent, type PositionComponent,
  type CombatComponent, type HungerComponent,
} from '../src/game/components/components';
import { ChamberType, UndergroundTerrainType } from '../src/simulation/world/types';

const world = new World();
const ug = new UndergroundGrid();
const surface = new TileGrid();
const modifiers = createDefaultModifiers();

// 1. Rock pockets sanity
let rock = 0;
for (let y = 1; y < ug.height - 1; y++) {
  for (let x = 1; x < ug.width - 1; x++) {
    if (ug.getTile(x, y)!.terrain === UndergroundTerrainType.Reinforced) rock++;
  }
}
console.log(`rock pocket tiles (interior): ${rock} (expect > 20)`);
console.log('undiggable check:', ug.designate(0, 0) === false, '(reinforced border refuses designation)');

// 2. Defense area + defender + intruder
const cx = Math.floor(ug.width / 2);
const cy = Math.floor(ug.height / 2);

// Carve a guard room 8 tiles east of the queen chamber + corridor
for (let x = cx; x <= cx + 10; x++) {
  const t = ug.getTile(x, cy)!;
  if (!t.walkable) { t.terrain = UndergroundTerrainType.Tunnel; t.walkable = true; }
}
for (let dy = -1; dy <= 1; dy++) {
  for (let dx = 8; dx <= 10; dx++) {
    const t = ug.getTile(cx + dx, cy + dy)!;
    t.terrain = UndergroundTerrainType.Chamber;
    t.walkable = true;
    t.chamberType = ChamberType.Defense;
  }
}
ug.invalidateChamberCache();
console.log('defense regions:', ug.getChamberRegions().filter((r) => r.type === ChamberType.Defense).length);

// Defender hatches at the queen chamber (away from its post)
const defId = createAnt(world, cx + 0.5, cy + 0.5, AntRole.Defender);
world.getComponent<LayerComponent>(defId, COMPONENT.LAYER)!.layer = Layer.Underground;
const def = world.getComponent<AntComponent>(defId, COMPONENT.ANT)!;
const defPos = world.getComponent<PositionComponent>(defId, COMPONENT.POSITION)!;
def.state = AntState.Idle;

world.addSystem(new DefenderAISystem(world, ug));
world.addSystem(new MovementSystem(world, surface, modifiers, ug));

// Phase 1: walks to its post
for (let f = 0; f < 60 * 40; f++) world.update(1 / 60);
const distToArea = Math.hypot(defPos.x - (cx + 9.5), defPos.y - (cy + 0.5));
console.log(`defender at post: dist to area center = ${distToArea.toFixed(1)} (expect < 3)`);

// Phase 2: intruder appears 5 tiles past the area — inside detection, outside area
const beetleId = createBeetle(world, cx + 14, cy, null);
world.getComponent<LayerComponent>(beetleId, COMPONENT.LAYER)!.layer = Layer.Underground;
for (let x = cx + 10; x <= cx + 15; x++) {
  const t = ug.getTile(x, cy)!;
  if (!t.walkable) { t.terrain = UndergroundTerrainType.Tunnel; t.walkable = true; }
}
for (let f = 0; f < 60 * 5; f++) world.update(1 / 60);
const combat = world.getComponent<CombatComponent>(defId, COMPONENT.COMBAT);
console.log(`defender engaged: state=${def.state} target=${combat?.targetEntityId} (expect attacking_enemy → ${beetleId})`);

// Phase 3: remove threat + make defender starving → goes to eat at the pantry
world.destroyEntity(beetleId);
const hunger = world.getComponent<HungerComponent>(defId, COMPONENT.HUNGER)!;
hunger.current = hunger.max * 0.1;
const pantry = ug.getPantryTiles();
ug.depositFood(pantry[0].x, pantry[0].y, 'leaf', 50);
let ate = false;
for (let f = 0; f < 60 * 90; f++) {
  world.update(1 / 60);
  if (hunger.current > hunger.max * 0.9) { ate = true; break; }
}
console.log(`defender ate and recovered: ${ate} (hunger ${(100 * hunger.current / hunger.max).toFixed(0)}%)`);
// Phase 4: returns to post after eating
for (let f = 0; f < 60 * 60; f++) world.update(1 / 60);
const backDist = Math.hypot(defPos.x - (cx + 9.5), defPos.y - (cy + 0.5));
console.log(`defender back at post: dist = ${backDist.toFixed(1)} (expect < 3)`);
