// Human buildings, drawn as stacked floors (the Humans build upward): steel
// walls with lit windows, an olive trim between floors and a roof that says
// what the building is. Drawn straight onto a canvas in whole art pixels, so
// the same art serves the map (2 world px per art px) and the UI portrait.

import { PAL } from '../../engine/renderer/pixelart/palette';
import { HUMAN_BUILDING_STATS, type HumanBuildingKind } from './humanBase';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const ST = PAL.human.steel;
const OL = PAL.human.olive;
const VISOR = PAL.human.visor;
const OUTLINE = PAL.human.outline;

/** Art px per tile at the map scale (TILE_SIZE 32 world px, 2 world px per art px) */
const ART_PER_TILE = 16;
/** Art px per floor */
export const FLOOR_ART = 10;

/** A building's art size in art px: footprint width and full height with the roof */
export function humanBuildingArtSize(kind: HumanBuildingKind): { width: number; height: number } {
  const stats = HUMAN_BUILDING_STATS[kind];
  const width = Math.round(stats.halfWidth * 2 * ART_PER_TILE);
  return { width, height: stats.floors * FLOOR_ART + ROOF_ART[kind] + 3 };
}

const ROOF_ART: Record<HumanBuildingKind, number> = {
  command_center: 12,
  barracks: 10,
  bunker: 4,
  supply_depot: 4,
  factory: 8,
};

export interface HumanBuildingLook {
  /** 0..1 built; below 1 the frame shows scaffolding and only the floors raised so far */
  progress?: number;
  /** Seconds, for blinking lights */
  time?: number;
  /** Facing left (toward smaller x): the bunker's gun points that way */
  faceLeft?: boolean;
}

/**
 * Draw a `kind` building whose footprint is centered on `cx` and whose
 * ground line is `groundY` (canvas px), at `s` canvas px per art px.
 */
export function drawHumanBuilding(
  ctx: Ctx,
  kind: HumanBuildingKind,
  cx: number,
  groundY: number,
  s: number,
  look: HumanBuildingLook = {},
): void {
  const progress = Math.max(0, Math.min(1, look.progress ?? 1));
  const time = look.time ?? 0;
  const { width: W } = humanBuildingArtSize(kind);
  const floors = HUMAN_BUILDING_STATS[kind].floors;
  const left = Math.round(cx - (W * s) / 2);
  const ground = Math.round(groundY);
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(left + x * s, ground + y * s, w * s, h * s);
  };

  // Dithered ground shadow under the footprint
  for (let x = -2; x < W + 4; x++) {
    for (let y = 0; y < 3; y++) if ((x + y) % 2 === 0) r(x, y, 1, 1, OUTLINE);
  }

  const built = progress >= 1;
  // Floors raised so far (the top one may be half done while building)
  const height = built ? floors * FLOOR_ART : Math.max(2, Math.round(floors * FLOOR_ART * progress));
  const top = -height;

  if (kind === 'bunker') {
    drawBunkerBody(r, W, top, height, look.faceLeft ?? true, built);
  } else {
    // Outline, then the walls
    r(-1, top - 1, W + 2, height + 1, OUTLINE);
    r(0, top, W, height, kind === 'supply_depot' ? OL[1] : ST[1]);
    r(0, top, 1, height, kind === 'supply_depot' ? OL[2] : ST[2]);
    r(W - 1, top, 1, height, ST[0]);
    for (let f = 0; f < floors; f++) {
      const floorTop = -(f + 1) * FLOOR_ART;
      if (floorTop < top) break;
      // Olive trim on every floor line
      r(0, floorTop, W, 1, OL[2]);
      if (kind === 'supply_depot') {
        drawCrateBracing(r, W, floorTop);
        continue;
      }
      // A row of windows; a few lights blink as the crew moves
      for (let x = 3, i = 0; x + 3 < W - 1; x += 6, i++) {
        const lit = built && ((i * 7 + f * 3 + Math.floor(time * 0.7)) % 5) !== 0;
        r(x, floorTop + 3, 3, 3, lit ? VISOR : ST[0]);
        r(x, floorTop + 3, 3, 1, lit ? ST[3] : OUTLINE);
      }
    }
    if (kind === 'factory') {
      // A tall vehicle bay with a striped hazard lintel
      const bay = Math.max(8, Math.round(W / 3));
      const bx = Math.round((W - bay) / 2);
      r(bx, -9, bay, 9, OUTLINE);
      for (let x = 0; x < bay; x += 2) r(bx + x, -10, 1, 1, VISOR);
      r(bx + 1, -8, bay - 2, 1, ST[2]);
    }
    if (kind === 'barracks') {
      // A wide door on the ground floor
      const door = Math.max(6, Math.round(W / 4));
      r(Math.round((W - door) / 2), -7, door, 7, OUTLINE);
      r(Math.round((W - door) / 2) + 1, -6, door - 2, 1, ST[2]);
    }
    if (kind === 'command_center') {
      // Blast doors
      r(Math.round(W / 2) - 4, -8, 8, 8, ST[0]);
      r(Math.round(W / 2) - 4, -8, 8, 1, ST[3]);
      r(Math.round(W / 2), -7, 1, 7, OUTLINE);
    }
  }

  if (!built) {
    drawScaffold(r, W, top);
    return;
  }
  drawRoof(r, kind, W, top, time);
}

type Rect = (x: number, y: number, w: number, h: number, color: string) => void;

function drawCrateBracing(r: Rect, W: number, floorTop: number): void {
  // Steel X bracing across the crate wall
  for (let i = 1; i < FLOOR_ART - 1; i++) {
    const x = Math.round(((W - 3) * i) / (FLOOR_ART - 1)) + 1;
    r(x, floorTop + i, 1, 1, ST[2]);
    r(W - 1 - x, floorTop + i, 1, 1, ST[2]);
  }
}

function drawBunkerBody(r: Rect, W: number, top: number, height: number, faceLeft: boolean, built: boolean): void {
  // Sloped concrete shell over a sandbag skirt
  r(-1, top - 1, W + 2, height + 1, OUTLINE);
  r(0, top, W, height, ST[2]);
  r(0, top, W, 1, ST[3]);
  for (let x = 0; x < W; x += 4) r(x, -3, 3, 3, OL[2]);
  r(0, -3, W, 1, OL[3]);
  if (!built) return;
  // Gun slit and barrel
  r(3, top + 3, W - 6, 2, OUTLINE);
  const barrelY = top + 3;
  if (faceLeft) r(-6, barrelY, 8, 2, ST[0]);
  else r(W - 2, barrelY, 8, 2, ST[0]);
}

function drawScaffold(r: Rect, W: number, top: number): void {
  // Steel lattice around the frame while the builder works
  r(-2, top - 4, 1, -top + 4, ST[3]);
  r(W + 1, top - 4, 1, -top + 4, ST[3]);
  for (let y = top - 4; y < 0; y += 4) r(-2, y, W + 4, 1, ST[3]);
  r(Math.round(W / 2) - 1, top - 7, 2, 3, VISOR); // a hazard lamp on the crane
}

function drawRoof(r: Rect, kind: HumanBuildingKind, W: number, top: number, time: number): void {
  const blink = Math.floor(time * 2) % 2 === 0;
  switch (kind) {
    case 'command_center': {
      // A roof slab with a landing pad, a radar dish and a blinking mast
      r(-2, top - 4, W + 4, 4, OUTLINE);
      r(-1, top - 3, W + 2, 3, OL[2]);
      r(-1, top - 3, W + 2, 1, OL[3]);
      const pad = Math.round(W / 2) - 6;
      r(pad, top - 4, 12, 1, VISOR);
      r(pad + 3, top - 4, 1, 1, OUTLINE);
      r(pad + 8, top - 4, 1, 1, OUTLINE);
      r(W - 8, top - 10, 1, 6, ST[3]);
      r(W - 10, top - 11, 5, 2, ST[2]);
      r(5, top - 12, 1, 8, ST[2]);
      r(4, top - 13, 3, 1, blink ? PAL.dangerRed : ST[0]);
      break;
    }
    case 'barracks': {
      r(-2, top - 3, W + 4, 3, OUTLINE);
      r(-1, top - 2, W + 2, 2, OL[2]);
      // Flagpole with an olive pennant that flaps
      r(W - 5, top - 10, 1, 8, ST[3]);
      r(W - 9, top - 10, 4, blink ? 3 : 2, OL[3]);
      break;
    }
    case 'bunker':
      r(2, top - 2, W - 4, 2, OL[1]);
      break;
    case 'factory': {
      // A sawtooth workshop roof and a smoking stack
      r(-2, top - 2, W + 4, 2, OUTLINE);
      for (let x = 0; x < W; x += 6) {
        r(x, top - 5, 3, 3, ST[2]);
        r(x + 3, top - 4, 3, 2, ST[3]);
      }
      r(W - 6, top - 12, 3, 10, ST[0]);
      r(W - 7, top - 13, 5, 1, blink ? PAL.healthYellow : OL[3]);
      break;
    }
    case 'supply_depot': {
      // Crops on the roof: the rations grow up there
      r(-1, top - 2, W + 2, 2, OUTLINE);
      for (let x = 1; x < W - 1; x += 3) r(x, top - 3, 2, 2, x % 2 === 0 ? PAL.healthGreen : OL[3]);
      break;
    }
  }
}
