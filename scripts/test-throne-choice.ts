// Headless test: with THREE throne areas, the queen goes to the CLICKED one.
// Replicates GameManager.sendQueenToThroneAt's logic (region lookup + centroid
// target + pathing) against the real grid/regions/movement.
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { createQueen } from '../src/game/entities/factories';
import { COMPONENT, type PositionComponent, type PathComponent } from '../src/game/components/components';
import { ChamberType, UndergroundTerrainType } from '../src/simulation/world/types';

const world = new World();
const ug = new UndergroundGrid();
const surface = new TileGrid();
const modifiers = createDefaultModifiers();

const cx = Math.floor(ug.width / 2);
const cy = Math.floor(ug.height / 2);
const queenId = createQueen(world, cx + 0.5, cy + 0.5);
const queenPos = world.getComponent<PositionComponent>(queenId, COMPONENT.POSITION)!;

// Carve corridors to 3 throne sites in different directions + 2x2 thrones
const sites = [
  { name: 'NORTE', x: cx, y: cy - 18 },
  { name: 'ESTE', x: cx + 20, y: cy },
  { name: 'SUR', x: cx, y: cy + 16 },
];
for (const s of sites) {
  const dx = Math.sign(s.x - cx);
  const dy = Math.sign(s.y - cy);
  let x = cx;
  let y = cy;
  while (x !== s.x || y !== s.y) {
    if (x !== s.x) x += dx;
    else y += dy;
    const t = ug.getTile(x, y)!;
    if (!t.walkable) { t.terrain = UndergroundTerrainType.Tunnel; t.walkable = true; }
  }
  for (let oy = 0; oy < 2; oy++) {
    for (let ox = 0; ox < 2; ox++) {
      const t = ug.getTile(s.x + ox, s.y + oy)!;
      t.terrain = UndergroundTerrainType.Chamber;
      t.walkable = true;
      t.chamberType = ChamberType.Queen;
    }
  }
}
ug.invalidateChamberCache();
const queenRegions = ug.getChamberRegions().filter((r) => r.type === ChamberType.Queen);
console.log(`throne regions: ${queenRegions.length} (expect 4: original chamber + 3 new)`);

// Replicate sendQueenToThroneAt: the player CLICKS the EAST throne
const clickX = sites[1].x;
const clickY = sites[1].y;
const clicked = queenRegions.find((r) => r.tiles.some((t) => t.x === clickX && t.y === clickY))!;
let target = clicked.tiles[0];
let bestD = Infinity;
for (const t of clicked.tiles) {
  const d = Math.hypot(t.x + 0.5 - clicked.cx, t.y + 0.5 - clicked.cy);
  if (d < bestD) { bestD = d; target = t; }
}
const path = world.getComponent<PathComponent>(queenId, COMPONENT.PATH)!;
const route = ug.findPath(queenPos.x, queenPos.y, target.x, target.y);
path.waypoints = route!;
path.currentIndex = 0;

world.addSystem(new MovementSystem(world, surface, modifiers, ug));
for (let f = 0; f < 60 * 120; f++) world.update(1 / 60);

const distEast = Math.hypot(queenPos.x - (sites[1].x + 0.5), queenPos.y - (sites[1].y + 0.5));
const distNorth = Math.hypot(queenPos.x - (sites[0].x + 0.5), queenPos.y - (sites[0].y + 0.5));
console.log(`queen → EAST throne dist: ${distEast.toFixed(1)} (expect < 2.5)`);
console.log(`queen NOT at north throne: ${distNorth > 10} (the CLICKED one wins, not the farthest)`);
console.log(`VERDICT: ${distEast < 2.5 && distNorth > 10 ? 'PLAYER CHOOSES ✅' : '❌'}`);
