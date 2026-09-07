// Headless check for multiple nest entrances.
//
// Contract: an entrance is a contiguous run of walkable tiles on ENTRANCE_ROW.
// Digging a column up to that row opens one — no build mode. Extra entrances
// shorten the walk to the shaft and spread arrivals, but each is also a place
// where an invasion wave can breach.
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { UndergroundTerrainType } from '../src/simulation/world/types';
import { World } from '../src/engine/ecs/World';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { createAnt } from '../src/game/entities/factories';
import {
  COMPONENT, AntRole, Layer,
  type LayerComponent, type PositionComponent, type PathComponent,
} from '../src/game/components/components';
import { ENTRANCE_ROW, UNDERGROUND_WIDTH } from '../src/shared/constants';

const results: Array<[string, boolean, string]> = [];
const check = (n: string, ok: boolean, d: string) => results.push([n, ok, d]);

const grid = new UndergroundGrid();
const dig = (x: number, y: number) => {
  const t = grid.getTile(x, y);
  if (!t) return;
  t.terrain = UndergroundTerrainType.Tunnel;
  t.walkable = true;
};

// 1) The 2-wide starting shaft must count as ONE entrance, not two
const start = grid.getEntrances();
check('shaft inicial = 1 entrada', start.length === 1, `${start.length} en x=${start.map((e) => e.x).join(',')}`);

// 2) Widening the existing shaft must NOT invent a second entrance
dig(start[0].x + 2, ENTRANCE_ROW);
grid.markLayoutChanged();
const widened = grid.getEntrances();
check('ensanchar NO crea otra', widened.length === 1, `${widened.length}`);

// 3) A separate column up to the row DOES open a second entrance
const EAST = 70;
for (let y = ENTRANCE_ROW; y <= 30; y++) { dig(EAST, y); dig(EAST + 1, y); }
for (let x = 53; x <= EAST; x++) { dig(x, 30); dig(x, 31); }
grid.markLayoutChanged();
const two = grid.getEntrances();
check('columna nueva = 2 entradas', two.length === 2, `${two.length} en x=${two.map((e) => e.x).join(',')}`);

// 4) An ant deep in the east must be routed to the EAST entrance, not the old one
const world = new World();
const transit = new TransitSystem(world, grid);
const antId = createAnt(world, EAST + 0.5, 29.5, AntRole.Worker);
world.getComponent<LayerComponent>(antId, COMPONENT.LAYER)!.layer = Layer.Underground;
const apos = world.getComponent<PositionComponent>(antId, COMPONENT.POSITION)!;
apos.x = EAST + 0.5; apos.y = 29.5;
transit.requestTransit(antId, 'exit');
const path = world.getComponent<PathComponent>(antId, COMPONENT.PATH)!;
const last = path.waypoints[path.waypoints.length - 1];
const nearest = grid.findNearestEntrance(apos.x, apos.y)!;
const westEntrance = two.reduce((a, b) => (a.x < b.x ? a : b));
check('sale por la entrada cercana', nearest.x >= EAST - 2 && nearest.x !== westEntrance.x, `elegida x=${nearest.x}, lejana x=${westEntrance.x}`);
check('el path apunta ahi', last !== undefined && Math.abs(last.x - nearest.x) <= 2, last ? `ultimo waypoint x=${last.x.toFixed(1)}` : 'sin path');

// 5) Arrivals must alternate between entrances (round-robin), not stack on one
const arrivals: number[] = [];
for (let i = 0; i < 4; i++) {
  const id = createAnt(world, 0, 0, AntRole.Worker);
  transit.requestTransit(id, 'enter');
  for (let f = 0; f < 60 * 3; f++) transit.update(1 / 60);
  arrivals.push(Math.floor(world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!.x));
}
check('las llegadas se reparten', new Set(arrivals).size === 2, `x de llegada: [${arrivals.join(', ')}]`);

// 6) Sanity: entrances are inside the map and on the entrance row
const sane = grid.getEntrances().every((e) => e.y === ENTRANCE_ROW && e.x > 0 && e.x < UNDERGROUND_WIDTH - 1);
check('entradas bien formadas', sane, JSON.stringify(grid.getEntrances()));

let failed = 0;
for (const [n, ok, d] of results) {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${n.padEnd(30)} ${d}`);
  if (!ok) failed++;
}
console.log(failed === 0 ? '\nTodo OK.' : `\n${failed} fallas.`);
process.exit(failed === 0 ? 0 : 1);
