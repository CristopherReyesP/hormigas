// Standalone simulation: does FungusFarmSystem actually convert leaves → mushrooms?
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { FungusFarmSystem } from '../src/game/systems/FungusFarmSystem';
import { ChamberType } from '../src/simulation/world/types';

const grid = new UndergroundGrid();

// Designate a 3x3 farm next to the queen chamber (walkable tiles)
const cx = Math.floor(grid.width / 2);
const cy = Math.floor(grid.height / 2);
let farmTiles = 0;
for (let y = 1; y < grid.height - 1 && farmTiles < 9; y++) {
  for (let x = 1; x < grid.width - 1 && farmTiles < 9; x++) {
    const t = grid.getTile(x, y);
    if (t && t.walkable && t.chamberType === null) {
      t.chamberType = ChamberType.FungusFarm;
      farmTiles++;
    }
  }
}
console.log('farm tiles designated:', farmTiles, '(center:', cx, cy, ')');

// Put leaves in the pantry like a porter would
let deposited = 0;
for (let i = 0; i < 10; i++) {
  const tile = grid.findDepositTile('leaf');
  if (!tile) break;
  const acc = grid.depositFood(tile.x, tile.y, 'leaf', 30);
  if (acc <= 0) break;
  deposited += acc;
}
console.log('leaves deposited in pantry:', deposited);
console.log('pantry capacity:', grid.getPantryCapacity());
console.log('before:', JSON.stringify(grid.getPantryStored()));

const fakeWorld = { pushNotification: (...args: unknown[]) => console.log('[notif]', ...args) } as never;
const farm = new FungusFarmSystem(fakeWorld, grid);

// Simulate 60 seconds at 60fps
for (let i = 0; i < 60 * 60; i++) {
  farm.update(1 / 60);
}

console.log('after 60s:', JSON.stringify(grid.getPantryStored()));
console.log('farm tile count seen by system:', farm.getFarmTileCount());
