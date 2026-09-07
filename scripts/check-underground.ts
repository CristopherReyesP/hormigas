// Headless check: the underground layout version must change on every mutation
// the cached light map / minimap depend on, and must NOT churn on dig orders
// (those are drawn live, and bumping would force a full light BFS per marker).
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { UndergroundTerrainType, ChamberType } from '../src/simulation/world/types';

const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail: string) => results.push([name, ok, detail]);

const grid = new UndergroundGrid();

// Find an Earth tile we can designate + excavate
let target: { x: number; y: number } | null = null;
for (let y = 0; y < grid.height && !target; y++) {
  for (let x = 0; x < grid.width; x++) {
    const t = grid.getTile(x, y)!;
    if (t.terrain === UndergroundTerrainType.Earth && !t.walkable) { target = { x, y }; break; }
  }
}
if (!target) throw new Error('no Earth tile found');

// 1) designate must NOT bump — dig markers are drawn per frame, never cached
const v0 = grid.getLayoutVersion();
grid.designate(target.x, target.y);
const v1 = grid.getLayoutVersion();
check('designate no bumpea', v1 === v0, `${v0} -> ${v1}`);

// 2) excavate MUST bump — walkable changed, light must re-propagate
grid.excavate(target.x, target.y);
const v2 = grid.getLayoutVersion();
check('excavate bumpea', v2 !== v1, `${v1} -> ${v2}`);
check('excavate abrio el tile', grid.isWalkable(target.x, target.y), `walkable=${grid.isWalkable(target.x, target.y)}`);

// 3) player chamber designation (GameManager mutates chamberType then calls this)
const tile = grid.getTile(target.x, target.y)!;
tile.chamberType = ChamberType.FungusFarm;
grid.invalidateChamberCache();
const v3 = grid.getLayoutVersion();
check('invalidateChamberCache bumpea', v3 !== v2, `${v2} -> ${v3}`);

// 4) a no-op frame must be stable — this is the whole point of the change
const v4 = grid.getLayoutVersion();
check('sin mutaciones queda estable', v4 === v3, `${v3} -> ${v4}`);

// 5) the starting chambers must be reachable by the minimap's terrain pass
let queen = 0, pantry = 0, incub = 0;
for (let y = 0; y < grid.height; y++) {
  for (let x = 0; x < grid.width; x++) {
    const t = grid.getTile(x, y)!;
    if (t.chamberType === ChamberType.Queen) queen++;
    else if (t.chamberType === ChamberType.FoodStorage) pantry++;
    else if (t.chamberType === ChamberType.Incubation) incub++;
  }
}
check('camaras iniciales visibles', queen > 0 && pantry > 0 && incub > 0, `reina=${queen} despensa=${pantry} incubacion=${incub}`);

let failed = 0;
for (const [name, ok, detail] of results) {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${name.padEnd(34)} ${detail}`);
  if (!ok) failed++;
}
console.log(failed === 0 ? '\nTodo OK.' : `\n${failed} fallas.`);
process.exit(failed === 0 ? 0 : 1);
