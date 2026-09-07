import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { UndergroundTerrainType, ChamberType } from '../../simulation/world/types';
import { UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT } from '../../shared/constants';

// Brightness budget of the underground light flood. Chambers and daylight
// shafts are full-strength sources; every excavated tunnel is a weak source of
// its own, which is what keeps a large colony readable instead of dissolving
// into black past the last room.
export const UG_LIGHT_CHAMBER = 12;
export const UG_LIGHT_ENTRANCE = 12;
export const UG_LIGHT_TUNNEL = 6;

/** Lowest light level whose neighbouring walls still catch a colored rim */
export const UG_LIGHT_RIM = 3;

/** Highest light level: no darkness overlay is drawn at all */
export const UG_LIGHT_FULL = 4;

// Glow color indices — the renderer maps these to palette entries
export const UG_COLOR_DEFAULT = 0;
export const UG_COLOR_AMBER = 1;
export const UG_COLOR_GREEN = 2;
export const UG_COLOR_WARM = 3;
export const UG_COLOR_DAYLIGHT = 4;

/**
 * Build the per-tile underground light map: `level` 0 (pitch dark) to 4 (fully
 * lit) plus a glow color index per tile.
 *
 * Sources: chambers (queen = amber, food/fungus = green, incubation = warm),
 * surface entrances (daylight shaft) and every excavated tunnel, which is
 * faintly self-lit. Brightness floods through walkable tiles and leaks one tile
 * into walls so dig faces and rims stay readable.
 *
 * Pure and allocation-light: the three output arrays are written in place, and
 * `bright` is scratch space the levels are quantized from.
 */
export function computeUndergroundLight(
  grid: UndergroundGrid,
  level: Uint8Array,
  color: Uint8Array,
  bright: Uint8Array,
): void {
  const W = UNDERGROUND_WIDTH;
  const H = UNDERGROUND_HEIGHT;
  bright.fill(0);
  color.fill(0);

  const qx: number[] = [];
  const qy: number[] = [];
  const seed = (x: number, y: number, b: number, c: number) => {
    const i = y * W + x;
    if (bright[i] >= b) return;
    bright[i] = b;
    color[i] = c;
    qx.push(x);
    qy.push(y);
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = grid.getTile(x, y)!;
      // A designated room keeps its Tunnel terrain, so terrain alone would miss
      // every pantry, farm and defense post the player carves out of a corridor.
      if (t.terrain === UndergroundTerrainType.Chamber || t.chamberType !== null) {
        let c = UG_COLOR_AMBER; // queen + general
        if (t.chamberType === ChamberType.FoodStorage || t.chamberType === ChamberType.FungusFarm) {
          c = UG_COLOR_GREEN;
        } else if (t.chamberType === ChamberType.Incubation || t.chamberType === ChamberType.Egg) {
          c = UG_COLOR_WARM;
        }
        seed(x, y, UG_LIGHT_CHAMBER, c);
      } else if (t.walkable) {
        // Dug tunnels carry their own dim light. Without this, every tunnel more
        // than a few tiles from a room rendered as solid black, so expanding the
        // colony literally erased what you had just dug.
        seed(x, y, UG_LIGHT_TUNNEL, UG_COLOR_DEFAULT);
      }
    }
  }

  // Surface entrances — a daylight shaft, and the player's anchor point
  for (const e of grid.getEntrances()) {
    seed(e.x, e.y, UG_LIGHT_ENTRANCE, UG_COLOR_DAYLIGHT);
  }

  // Flood: brightness decays 1 per step through walkable tiles. Walls receive
  // light (so rims and dig faces read) but never pass it along.
  let head = 0;
  while (head < qx.length) {
    const x = qx[head];
    const y = qy[head];
    head++;
    const i = y * W + x;
    const b = bright[i];
    if (b <= 1) continue;
    if (!grid.getTile(x, y)!.walkable) continue; // walls absorb
    const next = b - 1;
    const tryN = (nx: number, ny: number) => {
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) return;
      const ni = ny * W + nx;
      if (bright[ni] >= next) return;
      bright[ni] = next;
      color[ni] = color[i];
      qx.push(nx);
      qy.push(ny);
    };
    tryN(x - 1, y);
    tryN(x + 1, y);
    tryN(x, y - 1);
    tryN(x, y + 1);
  }

  // Quantize brightness → light level (4 = fully lit, 0 = pitch dark)
  for (let i = 0; i < W * H; i++) {
    const b = bright[i];
    level[i] = b >= 11 ? 4 : b >= 9 ? 3 : b >= 7 ? 2 : b >= 5 ? 1 : 0;
  }
}
