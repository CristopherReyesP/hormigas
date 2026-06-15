// Edge case: does the farm stall when the pantry is completely full of leaves?
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { FungusFarmSystem } from '../src/game/systems/FungusFarmSystem';
import { ChamberType } from '../src/simulation/world/types';

const grid = new UndergroundGrid();

let farmTiles = 0;
for (let y = 1; y < grid.height - 1 && farmTiles < 9; y++) {
  for (let x = 1; x < grid.width - 1 && farmTiles < 9; x++) {
    const t = grid.getTile(x, y);
    if (t && t.walkable && t.chamberType === null) { t.chamberType = ChamberType.FungusFarm; farmTiles++; }
  }
}

// Fill the pantry COMPLETELY with leaves (what porters do in a long game)
let deposited = 0;
for (;;) {
  const tile = grid.findDepositTile('leaf');
  if (!tile) break;
  const acc = grid.depositFood(tile.x, tile.y, 'leaf', 50);
  if (acc <= 0) break;
  deposited += acc;
}
console.log('pantry filled with leaves:', deposited, '/', grid.getPantryCapacity());

const fakeWorld = { pushNotification: () => {} } as never;
const farm = new FungusFarmSystem(fakeWorld, grid);

for (let i = 0; i < 60 * 120; i++) farm.update(1 / 60); // 2 minutes

const after = JSON.stringify(grid.getPantryStored());
console.log('after 2 min with', farmTiles, 'farm tiles:', after);
