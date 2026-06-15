// Headless test: consumption policy protects the farm's leaf supply.
// Scenario: pantry with leaves, farm producing, colony constantly spending food
// (breeding-style drains). With 'leaf' priority the farm starves; with
// 'mushroom' priority the leaves survive and production continues.
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { FungusFarmSystem } from '../src/game/systems/FungusFarmSystem';
import { ChamberType } from '../src/simulation/world/types';

function runScenario(priority: 'leaf' | 'mushroom'): { leaf: number; mushroom: number; produced: number } {
  const grid = new UndergroundGrid();
  grid.setConsumptionPriority(priority);

  let farmTiles = 0;
  for (let y = 1; y < grid.height - 1 && farmTiles < 6; y++) {
    for (let x = 1; x < grid.width - 1 && farmTiles < 6; x++) {
      const t = grid.getTile(x, y);
      if (t && t.walkable && t.chamberType === null) { t.chamberType = ChamberType.FungusFarm; farmTiles++; }
    }
  }

  const fakeWorld = { pushNotification: () => {} } as never;
  const farm = new FungusFarmSystem(fakeWorld, grid);

  // Seed pantry with leaves
  for (let i = 0; i < 6; i++) {
    const tile = grid.findDepositTile('leaf');
    if (tile) grid.depositFood(tile.x, tile.y, 'leaf', 40);
  }

  const dt = 1 / 60;
  let producedStart = 0;
  for (let f = 0; f < 60 * 120; f++) { // 2 minutes
    farm.update(dt);
    // Colony pressure: ~0.8 food/s spent on breeding/feeding via the policy-aware drain
    if (f % 60 === 0) grid.drainFood(0.8);
    // Porters keep some leaves flowing in (slow trickle, like a real game)
    if (f % 180 === 0) {
      const tile = grid.findDepositTile('leaf');
      if (tile) grid.depositFood(tile.x, tile.y, 'leaf', 2);
    }
    if (f === 60 * 30) producedStart = grid.getFarmStored(); // checkpoint at 30s
  }

  const stored = grid.getPantryStored();
  return {
    leaf: Math.round(stored.leaf),
    mushroom: Math.round(stored.mushroom),
    produced: Math.round(grid.getFarmStored() - producedStart), // growth after 30s checkpoint
  };
}

const leafFirst = runScenario('leaf');
const mushroomFirst = runScenario('mushroom');

console.log('Policy 🍃 leaf-first   →', JSON.stringify(leafFirst));
console.log('Policy 🍄 mushroom-first →', JSON.stringify(mushroomFirst));
console.log('---');
// Final leaf is 0 in both: the farm converts every leaf that arrives (good).
// What the policy changes is WHO gets them: under mushroom-first the colony's
// spending hits mushroom piles, so the farm converts more.
console.log('mushroom-first produced more:', mushroomFirst.produced > leafFirst.produced,
  `(${mushroomFirst.produced} vs ${leafFirst.produced})`);
console.log('mushroom-first ended richer:', mushroomFirst.mushroom > leafFirst.mushroom,
  `(${mushroomFirst.mushroom} vs ${leafFirst.mushroom})`);
