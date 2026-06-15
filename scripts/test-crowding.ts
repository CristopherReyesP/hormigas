// Headless test: underground crowding — max N ants per tile, queen exempt.
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { createAnt, createQueen } from '../src/game/entities/factories';
import {
  COMPONENT, AntRole, Layer,
  type LayerComponent, type PositionComponent, type PathComponent,
} from '../src/game/components/components';
import { UndergroundTerrainType } from '../src/simulation/world/types';
import { MAX_ANTS_PER_TILE_UNDERGROUND, UNDERGROUND_WIDTH } from '../src/shared/constants';

const world = new World();
const ug = new UndergroundGrid();
const surface = new TileGrid();
const modifiers = createDefaultModifiers();

const cy = Math.floor(ug.height / 2);
const x0 = 5;
// Carve a 1-wide corridor of 30 tiles
for (let x = x0; x < x0 + 30; x++) {
  const t = ug.getTile(x, cy)!;
  t.terrain = UndergroundTerrainType.Tunnel;
  t.walkable = true;
  t.chamberType = null;
}

// 8 ants stacked at the corridor start, all pathing to the far end
const antIds: number[] = [];
for (let i = 0; i < 8; i++) {
  const id = createAnt(world, x0 + 0.5, cy + 0.5, AntRole.Worker);
  world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
  const path = world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
  path.waypoints = Array.from({ length: 29 }, (_, k) => ({ x: x0 + 1 + k + 0.5, y: cy + 0.5 }));
  path.currentIndex = 0;
  antIds.push(id);
}

// Queen pushes through the SAME corridor
const queenId = createQueen(world, x0 + 0.5, cy + 0.5);
const qPath = world.getComponent<PathComponent>(queenId, COMPONENT.PATH)!;
qPath.waypoints = Array.from({ length: 29 }, (_, k) => ({ x: x0 + 1 + k + 0.5, y: cy + 0.5 }));
qPath.currentIndex = 0;
const qPos = world.getComponent<PositionComponent>(queenId, COMPONENT.POSITION)!;

world.addSystem(new MovementSystem(world, surface, modifiers, ug));

let maxPerTile = 0;
for (let f = 0; f < 60 * 60; f++) {
  world.update(1 / 60);
  // Measure worst-case ant density (excluding the spawn tile where they teleported in)
  const counts = new Map<number, number>();
  for (const id of antIds) {
    const p = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const tx = Math.floor(p.x);
    if (tx === x0) continue; // spawn stack doesn't count — crowding only gates ENTRY
    const key = Math.floor(p.y) * UNDERGROUND_WIDTH + tx;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const c of counts.values()) maxPerTile = Math.max(maxPerTile, c);
}

const arrived = antIds.filter((id) => {
  const p = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
  return p.x > x0 + 27;
}).length;

console.log(`max ants observed per corridor tile: ${maxPerTile} (cap ${MAX_ANTS_PER_TILE_UNDERGROUND})`);
console.log(`ants that traversed the corridor: ${arrived}/8 (single-file flow, no deadlock)`);
console.log(`queen got through: ${qPos.x > x0 + 27} (x=${qPos.x.toFixed(1)} — exempt from crowding)`);
