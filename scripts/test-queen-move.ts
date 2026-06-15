// Headless test: queen relocation. Carve a corridor from the queen chamber to a
// distant throne area, designate it, and verify the queen WALKS there (PATH +
// RoleStats on createQueen + MovementSystem + underground pathfinding).
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { createQueen } from '../src/game/entities/factories';
import { COMPONENT, type PositionComponent, type PathComponent } from '../src/game/components/components';
import { ChamberType, UndergroundTerrainType } from '../src/simulation/world/types';
import { UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT } from '../src/shared/constants';

const world = new World();
const ug = new UndergroundGrid();
const surface = new TileGrid();
const modifiers = createDefaultModifiers();

console.log(`underground grid: ${UNDERGROUND_WIDTH}×${UNDERGROUND_HEIGHT} (${ug.width}×${ug.height})`);

const cx = Math.floor(ug.width / 2);
const cy = Math.floor(ug.height / 2);
const queenId = createQueen(world, cx + 0.5, cy + 0.5);
const queenPos = world.getComponent<PositionComponent>(queenId, COMPONENT.POSITION)!;

// Carve a corridor from the chamber edge to a distant corner + throne area there
const tx = cx + 25;
const ty = cy + 15;
for (let x = cx; x <= tx; x++) {
  const t = ug.getTile(x, cy)!;
  if (!t.walkable) { t.terrain = UndergroundTerrainType.Tunnel; t.walkable = true; }
}
for (let y = cy; y <= ty; y++) {
  const t = ug.getTile(tx, y)!;
  if (!t.walkable) { t.terrain = UndergroundTerrainType.Tunnel; t.walkable = true; }
}
// 3x3 throne (replicates GameManager.designateThrone toggles)
for (let dy = -1; dy <= 1; dy++) {
  for (let dx = -1; dx <= 1; dx++) {
    const t = ug.getTile(tx + dx, ty + dy)!;
    t.terrain = UndergroundTerrainType.Chamber;
    t.walkable = true;
    t.chamberType = ChamberType.Queen;
  }
}
ug.invalidateChamberCache();

// Replicate moveQueenToThrone: farthest Queen tile + findPath
let best: { x: number; y: number } | null = null;
let bestDist = -1;
for (let y = 0; y < ug.height; y++) {
  for (let x = 0; x < ug.width; x++) {
    const tile = ug.getTile(x, y);
    if (!tile || !tile.walkable || tile.chamberType !== ChamberType.Queen) continue;
    const d = Math.hypot(x + 0.5 - queenPos.x, y + 0.5 - queenPos.y);
    if (d > bestDist) { bestDist = d; best = { x, y }; }
  }
}
console.log('throne target:', best, 'dist:', bestDist.toFixed(1));

const path = world.getComponent<PathComponent>(queenId, COMPONENT.PATH)!;
const route = ug.findPath(queenPos.x, queenPos.y, best!.x, best!.y);
console.log('route found:', !!route, 'waypoints:', route?.length ?? 0);
path.waypoints = route!;
path.currentIndex = 0;

world.addSystem(new MovementSystem(world, surface, modifiers, ug));

const startDist = Math.hypot(queenPos.x - (tx + 0.5), queenPos.y - (ty + 0.5));
for (let f = 0; f < 60 * 180; f++) {
  world.update(1 / 60);
  if (Math.hypot(queenPos.x - (tx + 0.5), queenPos.y - (ty + 0.5)) < 1.5) {
    console.log(`queen ARRIVED at the throne in ${(f / 60).toFixed(0)}s (start dist ${startDist.toFixed(0)} tiles)`);
    break;
  }
}
const endDist = Math.hypot(queenPos.x - (tx + 0.5), queenPos.y - (ty + 0.5));
console.log('final distance to throne:', endDist.toFixed(1), endDist < 1.5 ? '✅' : '❌ DID NOT ARRIVE');
