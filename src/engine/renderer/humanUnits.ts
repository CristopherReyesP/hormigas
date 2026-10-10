// Human units: simple Terran-like silhouettes in muted steel and olive drab.
// A soldier with a rifle across the chest, a hooded marksman with a long
// scoped rifle, and a tank with scrolling treads. They stand on the ground
// (no hover), over the same soft dithered shadow as every unit, and share the
// baked pixel-grid format of `crystalUnits.ts`.

import { PAL } from './pixelart/palette';
import type { PixelPainter } from './pixelart/PixelPainter';
import {
  composeFrame,
  ditherShadow,
  fillPolygon,
  paintLayer,
  withOutline,
  type UnitFrame,
  type UnitSheet,
} from './crystalUnits';

export type HumanUnitKind = 'soldier' | 'marksman' | 'tank';

export const HUMAN_UNIT_KINDS: readonly HumanUnitKind[] = ['soldier', 'marksman', 'tank'];

/** Frames in one idle loop (breathing, cape flutter, tread scroll). */
export const HUMAN_FRAME_COUNT = 4;
export const HUMAN_FRAME_MS = 200;

/** Art-pixel grids at the shared unit scale (1 art px = 2 screen px). */
export const HUMAN_UNIT_SIZE: Readonly<Record<HumanUnitKind, { width: number; height: number }>> = {
  soldier: { width: 20, height: 30 },
  marksman: { width: 20, height: 32 },
  tank: { width: 40, height: 30 },
};

const ST = PAL.human.steel;
const OL = PAL.human.olive;
const VISOR = PAL.human.visor;
const OUTLINE = PAL.human.outline;

interface HumanArt {
  readonly shadow: (p: PixelPainter) => void;
  readonly body: (p: PixelPainter, frame: number) => void;
}

// ── Soldier: helmet, plate carrier, rifle across the chest ──

const SOLDIER: HumanArt = {
  shadow(p) {
    ditherShadow(p, 10, 27.5, 6, 1.3, OUTLINE);
  },
  body(p, frame) {
    const br = frame === 1 || frame === 2 ? -1 : 0; // the upper body breathes
    const sway = frame === 2 ? 1 : 0; // and the muzzle dips
    // Legs, knee pads and boots stay planted
    p.rect(6, 19, 3, 6, OL[1]);
    p.vline(6, 19, 6, OL[2]);
    p.rect(11, 19, 3, 6, OL[1]);
    p.hline(6, 21, 3, ST[2]);
    p.hline(11, 21, 3, ST[1]);
    p.rect(5, 25, 4, 2, ST[0]);
    p.rect(11, 25, 4, 2, ST[0]);
    p.hline(5, 25, 4, ST[1]);
    // Torso with a steel chest plate and belt
    p.rect(5, 11 + br, 10, 9, OL[2]);
    p.vline(5, 11 + br, 9, OL[3]);
    p.vline(14, 11 + br, 9, OL[1]);
    p.rect(7, 12 + br, 6, 4, ST[2]);
    p.hline(7, 12 + br, 6, ST[3]);
    p.hline(7, 15 + br, 6, ST[1]);
    p.hline(5, 19, 10, ST[1]);
    p.px(8, 19, ST[3]);
    // Arms and shoulder pads
    p.rect(3, 13 + br, 2, 6, OL[1]);
    p.vline(3, 13 + br, 6, OL[2]);
    p.rect(15, 13 + br, 2, 6, OL[1]);
    p.rect(3, 10 + br, 3, 3, ST[2]);
    p.hline(3, 10 + br, 3, ST[3]);
    p.rect(14, 10 + br, 3, 3, ST[1]);
    p.hline(14, 10 + br, 3, ST[2]);
    // Helmet with a dull amber visor slit
    p.hline(7, 3 + br, 6, OL[3]);
    p.rect(6, 4 + br, 8, 3, OL[2]);
    p.px(7, 4 + br, OL[3]);
    p.vline(13, 4 + br, 3, OL[1]);
    p.hline(6, 7 + br, 8, ST[0]);
    p.hline(7, 7 + br, 6, VISOR);
    p.hline(7, 8 + br, 6, ST[1]);
    p.hline(8, 9 + br, 4, ST[0]);
    // Rifle held across the chest
    p.line(2, 19 + br, 16, 11 + br + sway, ST[0]);
    p.line(3, 19 + br, 17, 11 + br + sway, ST[1]);
    p.px(18, 10 + br + sway, ST[3]);
    p.px(4, 17 + br, OL[3]);
  },
};

// ── Marksman: hooded cape, long scoped rifle held upright ──

const MARKSMAN: HumanArt = {
  shadow(p) {
    ditherShadow(p, 10, 29.5, 6, 1.3, OUTLINE);
  },
  body(p, frame) {
    const flap = frame % 2;
    const glint = frame < 2;
    // Boots under the cape
    p.rect(6, 27, 3, 2, ST[0]);
    p.rect(11, 27, 3, 2, ST[0]);
    // Cape with a lit left fold and a ragged, fluttering hem
    fillPolygon(p, [[5, 11], [15, 11], [17, 27], [3, 27]], OL[1]);
    fillPolygon(p, [[5, 11], [8, 11], [6, 27], [3, 27]], OL[2]);
    p.vline(9, 14, 13, OL[0]);
    p.vline(12, 15, 12, OL[0]);
    for (let x = 3; x <= 16; x++) if ((x + flap) % 3 !== 0) p.px(x, 27, x < 7 ? OL[2] : OL[1]);
    p.line(6, 12, 13, 20, ST[1]); // bandolier strap
    // Hood and a shadowed face with goggles
    p.hline(7, 3, 6, OL[2]);
    p.rect(6, 4, 8, 7, OL[1]);
    p.vline(6, 4, 7, OL[2]);
    p.px(7, 3, OL[3]);
    p.rect(8, 6, 4, 4, ST[0]);
    p.px(8, 7, VISOR);
    p.px(10, 7, VISOR);
    // Long rifle upright at the right side, scope glinting
    p.vline(16, 1, 25, ST[1]);
    p.vline(16, 1, 5, ST[3]);
    p.hline(15, 1, 3, ST[2]);
    p.rect(17, 9, 2, 4, ST[2]);
    p.px(18, 9, glint ? VISOR : ST[3]);
    p.rect(15, 22, 3, 3, ST[0]);
    p.px(15, 16, OL[3]); // gloved hand on the stock
  },
};

// ── Tank: olive hull, turret and barrel over scrolling treads ──

const TANK: HumanArt = {
  shadow(p) {
    ditherShadow(p, 20, 26.5, 18, 1.5, OUTLINE);
  },
  body(p, frame) {
    const r = frame % 2 === 1 ? -1 : 0; // engine rumble lifts the hull
    // Treads: fixed band, links scroll one art px per frame
    p.rect(3, 19, 34, 6, ST[0]);
    p.hline(4, 19, 32, ST[1]);
    for (let x = 4 + frame; x < 36; x += HUMAN_FRAME_COUNT) {
      p.px(x, 19, ST[2]);
      p.px(39 - x, 24, ST[1]);
    }
    for (const wx of [7, 13, 19, 25, 31]) {
      p.disc(wx, 22, 1, ST[1]);
      p.px(wx + (frame % 2 === 0 ? -1 : 0), 21, ST[3]);
    }
    // Hull: lit deck, shaded glacis, side skirt with rivets
    fillPolygon(p, [[2, 19 + r], [6, 13 + r], [34, 13 + r], [38, 19 + r]], OL[2]);
    fillPolygon(p, [[33, 13 + r], [34, 13 + r], [38, 19 + r], [35, 19 + r]], OL[1]);
    p.hline(6, 13 + r, 28, OL[3]);
    p.rect(3, 17 + r, 34, 2, OL[1]);
    p.hline(3, 17 + r, 34, OL[0]);
    for (let x = 6; x < 34; x += 5) p.px(x, 18 + r, ST[2]);
    p.hline(9, 15 + r, 3, ST[4]); // faded unit marking
    p.px(36, 16 + r, VISOR); // headlight
    // Turret, hatch and barrel
    fillPolygon(p, [[13, 13 + r], [15, 8 + r], [25, 8 + r], [27, 13 + r]], OL[2]);
    p.hline(15, 8 + r, 10, OL[3]);
    p.vline(14, 10 + r, 3, OL[3]);
    p.rect(17, 7 + r, 4, 1, ST[2]);
    p.px(18, 6 + r, ST[3]);
    p.rect(26, 10 + r, 11, 2, ST[1]);
    p.hline(26, 10 + r, 11, ST[3]);
    p.rect(36, 9 + r, 2, 4, ST[2]);
    // Antenna whip sways
    p.line(16, 7 + r, frame === 1 || frame === 2 ? 13 : 14, 1 + r, ST[2]);
  },
};

const HUMAN_ART: Readonly<Record<HumanUnitKind, HumanArt>> = {
  soldier: SOLDIER,
  marksman: MARKSMAN,
  tank: TANK,
};

/** Bakes the idle loop of a Human unit. */
export function bakeHumanUnit(kind: HumanUnitKind): UnitSheet {
  const { width, height } = HUMAN_UNIT_SIZE[kind];
  const art = HUMAN_ART[kind];
  const frames: UnitFrame[] = [];
  for (let frame = 0; frame < HUMAN_FRAME_COUNT; frame++) {
    frames.push(
      composeFrame(width, height, [
        paintLayer(width, height, (p) => art.shadow(p)),
        withOutline(paintLayer(width, height, (p) => art.body(p, frame)), width, height, OUTLINE),
      ]),
    );
  }
  return { width, height, frameMs: HUMAN_FRAME_MS, frames };
}
