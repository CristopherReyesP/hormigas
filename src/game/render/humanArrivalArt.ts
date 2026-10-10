// The Humans' dropship for the opening cinematic: a boxy steel lander in the
// Human palette (steel hull, olive band and engine pod, the dull amber visor
// as the cockpit glass and hazard stripes), seen side-on like every unit.
// Baked once as pixel grids (no canvas), so tests can read the art.

import { PAL } from '../../engine/renderer/pixelart/palette';
import { composeFrame, fillPolygon, paintLayer, withOutline, type UnitFrame } from '../../engine/renderer/crystalUnits';

const ST = PAL.human.steel;
const OL = PAL.human.olive;
const VISOR = PAL.human.visor;
const OUTLINE = PAL.human.outline;

/** The dropship's art grid (art px), nose to the right. */
export const DROPSHIP_SIZE = { width: 62, height: 32 } as const;
/** Art px: where its feet touch the ground (row) and its middle (column); its ground shadow is drawn apart, under it */
export const DROPSHIP_GROUND_Y = 29;
export const DROPSHIP_CENTER_X = 30;
/** Art px of the two down-facing nozzles under the pod (their centers) and of the rear engine, from the top-left. */
export const DROPSHIP_NOZZLES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 19, y: 25 },
  { x: 38, y: 25 },
];
export const DROPSHIP_REAR_NOZZLE = { x: 3, y: 15 } as const;

/**
 * One dropship frame. `gearDown` lowers the landing struts for the last
 * stretch of the descent and on the ground; with them up it flies clean.
 */
export function paintDropship(gearDown: boolean): UnitFrame {
  const { width: w, height: h } = DROPSHIP_SIZE;
  const body = paintLayer(w, h, (p) => {
    // Swept tail fin over the rear
    fillPolygon(p, [[6, 3], [11, 3], [19, 11], [9, 11]], OL[2]);
    p.hline(7, 4, 4, OL[3]);
    p.px(12, 6, VISOR); // tail beacon
    // Hull: a long box that tapers into the nose, flat underside
    fillPolygon(p, [[5, 10], [48, 10], [58, 15], [58, 19], [52, 21], [5, 21]], ST[2]);
    p.hline(6, 10, 42, ST[3]);
    p.hline(6, 11, 42, ST[3]);
    for (let x = 48; x <= 56; x++) p.px(x, 10 + Math.round((x - 48) * 0.5), ST[3]);
    p.hline(6, 20, 46, ST[1]);
    // Olive band down its flank, panel seams
    p.rect(6, 15, 42, 2, OL[2]);
    p.hline(6, 15, 42, OL[3]);
    for (const x of [16, 27, 38]) p.vline(x, 12, 3, ST[1]);
    // Cockpit glass, with a glint
    fillPolygon(p, [[46, 12], [51, 12], [56, 15], [46, 15]], VISOR);
    p.hline(47, 12, 3, ST[4]);
    p.vline(49, 13, 2, ST[1]); // window frame
    // Side hatch (the troop door)
    p.rect(26, 12, 9, 7, ST[1]);
    p.hline(26, 12, 9, ST[3]);
    p.vline(30, 13, 6, ST[0]);
    // Rear engine block and its nozzle
    p.rect(2, 12, 4, 7, ST[0]);
    p.vline(2, 13, 5, ST[1]);
    // Engine pod slung under the hull, with hazard stripes at both ends
    p.rect(12, 21, 33, 3, OL[1]);
    p.hline(12, 21, 33, OL[3]);
    for (let x = 12; x < 16; x++) if (x % 2 === 0) p.vline(x, 22, 2, VISOR);
    for (let x = 41; x < 45; x++) if (x % 2 === 1) p.vline(x, 22, 2, VISOR);
    // Down-facing nozzles
    for (const n of DROPSHIP_NOZZLES) {
      p.rect(n.x - 2, 24, 5, 1, ST[1]);
      p.rect(n.x - 1, 25, 3, 1, ST[0]);
    }
    if (gearDown) {
      // Landing struts out to wide feet
      for (const x of [10, 49]) {
        p.vline(x, 21, 7, ST[3]);
        p.vline(x + 1, 21, 7, ST[1]);
        p.rect(x - 2, 28, 6, 1, ST[2]);
      }
    }
  });
  return composeFrame(w, h, [withOutline(body, w, h, OUTLINE)]);
}
