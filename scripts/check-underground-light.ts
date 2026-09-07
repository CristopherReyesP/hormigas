// Headless check for the underground light map.
//
// The failure this pins down is invisible in a screenshot of the starting nest
// and obvious 200 tiles later: light used to be seeded ONLY by Chamber-terrain
// tiles, so any tunnel more than 4 tiles from a room quantized to level 0 and
// was painted solid black. Expanding the colony erased what you had just dug.
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { ChamberType } from '../src/simulation/world/types';
import { computeUndergroundLight, UG_LIGHT_RIM } from '../src/game/systems/undergroundLight';
import { UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT } from '../src/shared/constants';

const N = UNDERGROUND_WIDTH * UNDERGROUND_HEIGHT;
const level = new Uint8Array(N);
const color = new Uint8Array(N);
const bright = new Uint8Array(N);

const results: Array<[string, boolean, string]> = [];
const check = (n: string, ok: boolean, d: string) => results.push([n, ok, d]);

const dig = (grid: UndergroundGrid, x: number, y: number) => {
  if (!grid.designate(x, y)) return false;
  return grid.excavate(x, y);
};

// A colony that has expanded: one long corridor running away from the rooms.
const grid = new UndergroundGrid();
const cx = Math.floor(UNDERGROUND_WIDTH / 2);
const cy = Math.floor(UNDERGROUND_HEIGHT / 2);
const corridor: Array<[number, number]> = [];
for (let y = cy + 3; y < UNDERGROUND_HEIGHT - 2; y++) {
  if (dig(grid, cx, y)) corridor.push([cx, y]);
}

check('el corredor de prueba se excavo', corridor.length >= 20, `${corridor.length} tiles excavados`);

computeUndergroundLight(grid, level, color, bright);

// 1) No excavated tile may be pitch dark, however far it runs from the rooms.
{
  let dark = 0;
  let farthest = 0;
  for (const [x, y] of corridor) {
    const l = level[y * UNDERGROUND_WIDTH + x];
    if (l === 0) dark++;
    farthest = l;
  }
  check('ningun tunel excavado queda en negro', dark === 0, `${dark} tiles en nivel 0; punta del corredor en nivel ${farthest}`);
}

// 2) Undug earth away from the colony STAYS dark — this is a gradient, not a
//    floodlight. Light leaks exactly one tile into the surrounding rock.
{
  const farX = 2;
  const farY = UNDERGROUND_HEIGHT - 3;
  check('la tierra sin excavar sigue oscura', level[farY * UNDERGROUND_WIDTH + farX] === 0, `nivel ${level[farY * UNDERGROUND_WIDTH + farX]} en (${farX}, ${farY})`);
  const wall = level[(cy + 6) * UNDERGROUND_WIDTH + (cx + 2)];
  check('la roca a 2 tiles del tunel sigue oscura', wall === 0, `nivel ${wall}`);
  const face = level[(cy + 6) * UNDERGROUND_WIDTH + (cx + 1)];
  check('la pared del tunel es visible', face > 0, `nivel ${face}`);
}

// 3) The gradient must actually fall off: rooms brighter than the far corridor.
{
  const room = level[cy * UNDERGROUND_WIDTH + cx];
  const near = level[(cy + 4) * UNDERGROUND_WIDTH + cx];
  const far = level[(UNDERGROUND_HEIGHT - 3) * UNDERGROUND_WIDTH + cx];
  check('la camara de la reina esta a full', room === 4, `nivel ${room}`);
  check('hay caida de luz sala -> corredor', room > near && near > far, `sala ${room} > cerca ${near} > lejos ${far}`);
  check('las paredes cerca de la sala reciben rim', near >= UG_LIGHT_RIM, `nivel ${near} (umbral ${UG_LIGHT_RIM})`);
}

// 4) A room DESIGNATED on tunnel terrain lights up. Player designations only
//    set chamberType and leave terrain as Tunnel, so a terrain-only seed left
//    every pantry and farm the player carved out of a corridor pitch black.
{
  const [px, py] = corridor[corridor.length - 5];
  const tile = grid.getTile(px, py)!;
  const before = level[py * UNDERGROUND_WIDTH + px];
  tile.chamberType = ChamberType.FoodStorage;
  grid.invalidateChamberCache();
  computeUndergroundLight(grid, level, color, bright);
  const after = level[py * UNDERGROUND_WIDTH + px];
  check('una despensa designada en tunel ilumina', after === 4 && after > before, `nivel ${before} -> ${after}`);
  check('la despensa tine su glow verde', color[py * UNDERGROUND_WIDTH + px] === 2, `indice de color ${color[py * UNDERGROUND_WIDTH + px]}`);
}

let failed = 0;
for (const [n, ok, d] of results) {
  if (!ok) failed++;
  console.log(`${ok ? '✅' : '❌'} ${n} — ${d}`);
}
console.log(failed === 0 ? '\nTodo OK' : `\n${failed} fallo(s)`);
process.exit(failed === 0 ? 0 : 1);
