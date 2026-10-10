// Crystal Hive units: hovering geometric crystal beings, NOT insects.
// No legs, antennae, mandibles or segmented bodies: every unit is a faceted
// crystal form around a glowing cyan energy core, trimmed with gold filigree,
// bobbing above a soft dithered ground shadow.
//
// Frames are baked into plain pixel grids (no canvas needed), so they are
// deterministic, testable in node, and blit onto any 2D context at one art
// pixel = UNIT_ART_PX screen px. The grid helpers here are shared with
// `humanUnits.ts`.

import { PAL } from './pixelart/palette';
import { PixelPainter } from './pixelart/PixelPainter';

/** Screen px per art pixel for every unit sprite (art direction: 1 art px = 2 screen px). */
export const UNIT_ART_PX = 2;

/** One baked animation frame on an art-pixel grid; `null` is transparent. */
export interface UnitFrame {
  readonly width: number;
  readonly height: number;
  /** Row-major palette colors, `width × height` long. */
  readonly pixels: readonly (string | null)[];
}

/** A looping animation: every frame shares the sheet's grid size. */
export interface UnitSheet {
  readonly width: number;
  readonly height: number;
  readonly frameMs: number;
  readonly frames: readonly UnitFrame[];
}

/** A layer under construction (row-major, `null` = transparent). */
export type UnitLayer = (string | null)[];

type Pt = readonly [number, number];

// ── Shared grid helpers ─────────────────────────────────────

/**
 * Paints with the regular PixelPainter API (scale 1) into a pixel layer
 * instead of a canvas: the painter only ever calls `fillStyle` + `fillRect`.
 */
export function paintLayer(width: number, height: number, paint: (p: PixelPainter) => void): UnitLayer {
  const layer: UnitLayer = new Array<string | null>(width * height).fill(null);
  const target = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number): void {
      const x0 = Math.round(x);
      const y0 = Math.round(y);
      const x1 = x0 + Math.round(w);
      const y1 = y0 + Math.round(h);
      for (let iy = Math.max(0, y0); iy < Math.min(height, y1); iy++) {
        for (let ix = Math.max(0, x0); ix < Math.min(width, x1); ix++) layer[iy * width + ix] = target.fillStyle;
      }
    },
  };
  paint(new PixelPainter(target as unknown as CanvasRenderingContext2D, 1));
  return layer;
}

/** Adds a 1 art-px outline (4-neighbour) around everything painted on the layer. */
export function withOutline(layer: UnitLayer, width: number, height: number, color: string): UnitLayer {
  const out = layer.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (layer[i] !== null) continue;
      const touches =
        (x > 0 && layer[i - 1] !== null) ||
        (x < width - 1 && layer[i + 1] !== null) ||
        (y > 0 && layer[i - width] !== null) ||
        (y < height - 1 && layer[i + width] !== null);
      if (touches) out[i] = color;
    }
  }
  return out;
}

/** Stacks layers back to front into one frame. */
export function composeFrame(width: number, height: number, layers: readonly (UnitLayer | null)[]): UnitFrame {
  const pixels: UnitLayer = new Array<string | null>(width * height).fill(null);
  for (const layer of layers) {
    if (!layer) continue;
    for (let i = 0; i < pixels.length; i++) if (layer[i] !== null) pixels[i] = layer[i];
  }
  return { width, height, pixels };
}

/**
 * Scanline polygon fill in continuous art coordinates: a pixel (x, y) covers
 * [x, x+1) × [y, y+1) and is filled when its center lies inside.
 */
export function fillPolygon(p: PixelPainter, pts: readonly Pt[], color: string): void {
  const ys = pts.map((q) => q[1]);
  const minY = Math.floor(Math.min(...ys));
  const maxY = Math.ceil(Math.max(...ys));
  for (let y = minY; y <= maxY; y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= cy && y1 > cy) || (y1 <= cy && y0 > cy)) xs.push(x0 + ((cy - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.ceil(xs[k] - 0.5);
      const to = Math.ceil(xs[k + 1] - 0.5) - 1;
      if (to >= from) p.hline(from, y, to - from + 1, color);
    }
  }
}

/** Checker-dithered ellipse in continuous coordinates: the soft ground shadow. */
export function ditherShadow(p: PixelPainter, cx: number, cy: number, rx: number, ry: number, color: string): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1 && (x + y) % 2 === 0) p.px(x, y, color);
    }
  }
}

/** Blits a frame as horizontal color runs, `artPx` screen px per art pixel. */
export function drawUnitFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  frame: UnitFrame,
  x: number,
  y: number,
  artPx = UNIT_ART_PX,
): void {
  const { width, height, pixels } = frame;
  for (let row = 0; row < height; row++) {
    let col = 0;
    while (col < width) {
      const color = pixels[row * width + col];
      if (color === null) {
        col++;
        continue;
      }
      let end = col + 1;
      while (end < width && pixels[row * width + end] === color) end++;
      ctx.fillStyle = color;
      ctx.fillRect(x + col * artPx, y + row * artPx, (end - col) * artPx, artPx);
      col = end;
    }
  }
}

// ── Crystal Hive units ──────────────────────────────────────

export type CrystalUnitKind = 'drone' | 'sentinel' | 'queen';

export const CRYSTAL_UNIT_KINDS: readonly CrystalUnitKind[] = ['drone', 'sentinel', 'queen'];

/** Frames in one hover cycle (the bob, the orbits and the core pulse all loop on it). */
export const CRYSTAL_FRAME_COUNT = 8;
export const CRYSTAL_FRAME_MS = 140;

/** Art-pixel grids: bigger tiers get bigger grids, never a bigger scale. */
export const CRYSTAL_UNIT_SIZE: Readonly<Record<CrystalUnitKind, { width: number; height: number }>> = {
  drone: { width: 20, height: 26 },
  sentinel: { width: 24, height: 46 },
  queen: { width: 52, height: 56 },
};

/** Peak hover lift in art px. */
export const CRYSTAL_BOB_AMPLITUDE: Readonly<Record<CrystalUnitKind, number>> = {
  drone: 1,
  sentinel: 2,
  queen: 2,
};

/** Vertical body offset in art px for a frame (negative = up); one sine cycle per CRYSTAL_FRAME_COUNT. */
export function crystalBobOffset(frame: number, amplitude: number): number {
  const i = ((frame % CRYSTAL_FRAME_COUNT) + CRYSTAL_FRAME_COUNT) % CRYSTAL_FRAME_COUNT;
  return 0 - Math.round(Math.sin((2 * Math.PI * i) / CRYSTAL_FRAME_COUNT) * amplitude);
}

const S = PAL.crystal.shell;
const G = PAL.crystal.gold;
const SHIELD = PAL.crystal.shield;
const OUTLINE = PAL.crystal.outline;

/** Everything one frame needs: the bob, the orbit angle and whether the core is at its bright beat. */
interface FrameState {
  readonly bob: number;
  readonly frame: number;
  readonly bright: boolean;
}

interface CrystalLayers {
  /** Energy behind the body (back half of rings): no outline. */
  readonly backGlow?: (p: PixelPainter, s: FrameState) => void;
  /** Solid crystal behind the body (orbiters on the far side): outlined. */
  readonly back?: (p: PixelPainter, s: FrameState) => void;
  readonly body: (p: PixelPainter, s: FrameState) => void;
  readonly front?: (p: PixelPainter, s: FrameState) => void;
  readonly frontGlow?: (p: PixelPainter, s: FrameState) => void;
  readonly shadow: (p: PixelPainter, s: FrameState) => void;
}

/** Orbit angle for a frame: `step` radians per frame, so the loop closes on the cycle. */
function orbitAngle(frame: number, step: number, offset = 0): number {
  return offset + frame * step;
}

/** A thin 1×3 shard: bright tip, lit middle, shaded foot. */
function shard(p: PixelPainter, x: number, y: number): void {
  p.px(x, y - 1, S[4]);
  p.px(x, y, S[3]);
  p.px(x, y + 1, S[2]);
}

/** A 3-wide, 5-tall orbiting crystal lit from the top-left. */
function bigShard(p: PixelPainter, x: number, y: number): void {
  p.px(x, y - 2, S[4]);
  p.px(x - 1, y - 1, S[3]);
  p.px(x, y - 1, S[4]);
  p.px(x + 1, y - 1, S[2]);
  p.px(x - 1, y, S[2]);
  p.px(x, y, S[3]);
  p.px(x + 1, y, S[1]);
  p.px(x, y + 1, S[1]);
  p.px(x, y + 2, G[1]);
}

/** Small cyan energy core: a 2×2 white-hot heart in a shield-glow ring (pulses with `bright`). */
function smallCore(p: PixelPainter, x: number, y: number, bright: boolean): void {
  const ring = bright ? SHIELD : S[3];
  p.hline(x, y - 1, 2, ring);
  p.hline(x, y + 2, 2, ring);
  p.vline(x - 1, y, 2, ring);
  p.vline(x + 2, y, 2, ring);
  p.rect(x, y, 2, 2, bright ? S[4] : SHIELD);
  if (!bright) p.px(x, y, S[4]);
}

// ── Drone: a small floating prism with one orbiting shard ──

const DRONE: CrystalLayers = {
  body(p, { bob, bright }) {
    const T: Pt = [10, 2 + bob];
    const L: Pt = [5, 10 + bob];
    const F: Pt = [10, 12 + bob];
    const R: Pt = [15, 10 + bob];
    const B: Pt = [10, 19 + bob];
    fillPolygon(p, [T, L, F], S[2]);
    fillPolygon(p, [T, F, R], S[1]);
    fillPolygon(p, [L, B, F], S[1]);
    fillPolygon(p, [F, B, R], S[0]);
    // Lit top-left edge and the front ridge catch the light
    p.line(9, 3 + bob, 6, 9 + bob, S[3]);
    p.vline(9, 4 + bob, 4, S[3]);
    // Gold filigree: the equator band, the cap and the keel tip
    p.line(5, 10 + bob, 9, 12 + bob, G[2]);
    p.line(10, 12 + bob, 14, 10 + bob, G[1]);
    p.px(9, 3 + bob, G[2]);
    p.px(10, 3 + bob, G[1]);
    p.px(9, 17 + bob, G[1]);
    p.px(10, 17 + bob, G[0]);
    smallCore(p, 9, 8 + bob, bright);
  },
  back(p, { bob, frame }) {
    const a = orbitAngle(frame, (2 * Math.PI) / CRYSTAL_FRAME_COUNT, Math.PI / 8);
    if (Math.sin(a) <= 0) shard(p, Math.round(9.5 + 8 * Math.cos(a)), Math.round(11 + bob + 2.5 * Math.sin(a)));
  },
  front(p, { bob, frame }) {
    const a = orbitAngle(frame, (2 * Math.PI) / CRYSTAL_FRAME_COUNT, Math.PI / 8);
    if (Math.sin(a) > 0) shard(p, Math.round(9.5 + 8 * Math.cos(a)), Math.round(11 + bob + 2.5 * Math.sin(a)));
  },
  shadow(p, { bob }) {
    ditherShadow(p, 10, 23.5, 4.5 + Math.sign(bob), 1.3, OUTLINE);
  },
};

// ── Sentinel: a tall hovering obelisk with a shield ring ──

/** Hexagonal shield ring around the shaft; `front` picks the near or the far edges. */
function shieldRing(p: PixelPainter, { bob, frame }: FrameState, front: boolean): void {
  const cx = 11.5;
  const cy = 24 + bob;
  const rx = 10.5;
  const ry = 3.5;
  const rot = orbitAngle(frame, Math.PI / 3 / CRYSTAL_FRAME_COUNT);
  const vertex = (k: number): Pt => {
    const a = rot + (k * Math.PI) / 3;
    return [Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a))];
  };
  for (let k = 0; k < 6; k++) {
    const mid = Math.sin(rot + ((k + 0.5) * Math.PI) / 3);
    if (mid > 0 !== front) continue;
    const [x0, y0] = vertex(k);
    const [x1, y1] = vertex(k + 1);
    p.line(x0, y0, x1, y1, front ? SHIELD : S[2]);
    p.px(x0, y0, S[4]);
    p.px(x1, y1, S[4]);
  }
}

const SENTINEL: CrystalLayers = {
  backGlow(p, s) {
    shieldRing(p, s, false);
  },
  body(p, { bob, bright }) {
    const A: Pt = [12, 4 + bob];
    const PL: Pt = [8, 10 + bob];
    const PF: Pt = [12, 11 + bob];
    const PR: Pt = [16, 10 + bob];
    const SL: Pt = [9, 30 + bob];
    const SF: Pt = [12, 31 + bob];
    const SR: Pt = [15, 30 + bob];
    const TB: Pt = [12, 38 + bob];
    // Pyramidion cap, shaft faces and the floating keel
    fillPolygon(p, [A, PL, PF], S[3]);
    fillPolygon(p, [A, PF, PR], S[2]);
    fillPolygon(p, [PL, PF, SF, SL], S[2]);
    fillPolygon(p, [PF, PR, SR, SF], S[1]);
    fillPolygon(p, [SL, SF, TB], S[1]);
    fillPolygon(p, [SF, SR, TB], S[0]);
    // Light runs down the lit edge and the front ridge
    p.line(11, 5 + bob, 9, 9 + bob, S[4]);
    p.line(8, 11 + bob, 9, 29 + bob, S[3]);
    p.vline(11, 12 + bob, 18, S[3]);
    // Gold filigree: collar under the cap, inlaid glyphs, foot band
    p.line(8, 10 + bob, 11, 11 + bob, G[2]);
    p.line(12, 11 + bob, 15, 10 + bob, G[1]);
    p.line(8, 11 + bob, 11, 12 + bob, G[1]);
    p.line(12, 12 + bob, 15, 11 + bob, G[0]);
    for (const gy of [14, 26]) {
      p.px(10, gy + bob, G[2]);
      p.px(9, gy + 1 + bob, G[1]);
      p.px(10, gy + 2 + bob, G[1]);
    }
    p.line(9, 29 + bob, 11, 30 + bob, G[1]);
    p.line(12, 30 + bob, 14, 29 + bob, G[0]);
    // Energy core: a white-hot slit in the ridge, haloed in shield cyan
    const top = bright ? 16 : 17;
    const len = bright ? 8 : 6;
    p.rect(11, top + bob, 2, len, S[4]);
    p.vline(10, top + 1 + bob, len - 2, SHIELD);
    p.vline(13, top + 1 + bob, len - 2, SHIELD);
    p.hline(11, top - 1 + bob, 2, SHIELD);
    p.hline(11, top + len + bob, 2, SHIELD);
  },
  frontGlow(p, s) {
    shieldRing(p, s, true);
  },
  shadow(p, { bob }) {
    ditherShadow(p, 12, 42.5, 6 + Math.sign(bob), 1.3, OUTLINE);
  },
};

// ── Crystal Queen: a large floating crown ringed by orbiting crystals ──

interface SpikeTones {
  readonly lit: string;
  readonly litTop: string;
  readonly dark: string;
  readonly darkTop: string;
}

const FRONT_SPIKE: SpikeTones = { lit: S[3], litTop: S[4], dark: S[1], darkTop: S[2] };
const BACK_SPIKE: SpikeTones = { lit: S[2], litTop: S[3], dark: S[0], darkTop: S[1] };

/** One faceted crown spike: a pointed hexagonal prism, optionally leaning outward. */
function spike(
  p: PixelPainter,
  x: number,
  apexY: number,
  baseY: number,
  hw: number,
  lean: number,
  tones: SpikeTones,
  goldBand: boolean,
): void {
  const apex: Pt = [x + lean, apexY];
  const shoulderY = apexY + hw * 1.6;
  const t = (shoulderY - apexY) / (baseY - apexY);
  const ridge: Pt = [x + lean * (1 - t), shoulderY + 1];
  const sl: Pt = [x - hw + lean * (1 - t), shoulderY];
  const sr: Pt = [x + hw + lean * (1 - t), shoulderY];
  const bl: Pt = [x - hw, baseY];
  const bc: Pt = [x, baseY + 1];
  const br: Pt = [x + hw, baseY];
  fillPolygon(p, [ridge, sl, bl, bc], tones.lit);
  fillPolygon(p, [ridge, bc, br, sr], tones.dark);
  fillPolygon(p, [apex, sl, ridge], tones.litTop);
  fillPolygon(p, [apex, ridge, sr], tones.darkTop);
  if (goldBand) {
    const y = Math.round(baseY - 3);
    const left = Math.ceil(x - hw);
    const width = Math.floor(x + hw) - left;
    p.hline(left, y, Math.ceil(width / 2), G[2]);
    p.hline(left + Math.ceil(width / 2), y, Math.floor(width / 2), G[1]);
  }
}

const QUEEN_ORBITERS = 6;
const QUEEN_ORBIT_STEP = (2 * Math.PI) / QUEEN_ORBITERS / CRYSTAL_FRAME_COUNT;

function queenOrbiters(p: PixelPainter, { bob, frame }: FrameState, front: boolean): void {
  for (let k = 0; k < QUEEN_ORBITERS; k++) {
    const a = orbitAngle(frame, QUEEN_ORBIT_STEP, (k * 2 * Math.PI) / QUEEN_ORBITERS + 0.3);
    if (Math.sin(a) > 0 !== front) continue;
    const x = Math.round(25.5 + 21 * Math.cos(a));
    const y = Math.round(30 + bob + 5.5 * Math.sin(a));
    if (k % 2 === 0) bigShard(p, x, y);
    else shard(p, x, y);
  }
}

const QUEEN: CrystalLayers = {
  back(p, s) {
    queenOrbiters(p, s, false);
  },
  body(p, { bob, bright }) {
    const b = bob;
    // Far spikes peek between the near ones
    spike(p, 21, 12 + b, 30 + b, 3, 0, BACK_SPIKE, false);
    spike(p, 31, 12 + b, 30 + b, 3, 0, BACK_SPIKE, false);
    // The crown's crystal floor
    p.ellipse(26, 31 + b, 15, 3, S[1]);
    p.ellipse(26, 31 + b, 11, 2, S[0]);
    // Ring of spikes, outermost first so the center one stands in front
    spike(p, 12, 20 + b, 32 + b, 3, -2, FRONT_SPIKE, true);
    spike(p, 40, 20 + b, 32 + b, 3, 2, FRONT_SPIKE, true);
    spike(p, 19, 11 + b, 32 + b, 3.5, -1, FRONT_SPIKE, true);
    spike(p, 33, 11 + b, 32 + b, 3.5, 1, FRONT_SPIKE, true);
    spike(p, 26, 4 + b, 32 + b, 4.5, 0, FRONT_SPIKE, true);
    // Hanging keel crystal under the crown
    fillPolygon(p, [[21, 34 + b], [26, 35 + b], [26, 46 + b]], S[2]);
    fillPolygon(p, [[26, 35 + b], [31, 34 + b], [26, 46 + b]], S[0]);
    p.line(22, 35 + b, 25, 43 + b, S[3]);
    // Gold circlet: the crown's rim, lit on the left
    for (let x = 11; x <= 40; x++) {
      const nx = (x + 0.5 - 26) / 15.5;
      const y = Math.round(31 + b + 3.5 * Math.sqrt(Math.max(0, 1 - nx * nx)));
      p.px(x, y, x < 26 ? G[2] : G[1]);
      p.px(x, y + 1, G[1]);
      p.px(x, y + 2, G[0]);
    }
    // Gems set in the circlet
    for (const gx of [15, 20, 31, 36]) {
      const nx = (gx + 0.5 - 26) / 15.5;
      const gy = Math.round(31 + b + 3.5 * Math.sqrt(1 - nx * nx)) + 1;
      p.px(gx, gy, bright ? S[4] : SHIELD);
    }
    // Energy core at the heart of the crown, set in a dark socket so it pops
    p.disc(26, 25 + b, 4, S[0]);
    p.disc(26, 25 + b, 3, SHIELD);
    p.disc(26, 25 + b, bright ? 2 : 1, S[4]);
    if (bright) {
      p.px(26, 20 + b, S[4]);
      p.px(21, 25 + b, S[4]);
      p.px(31, 25 + b, S[4]);
    }
  },
  front(p, s) {
    queenOrbiters(p, s, true);
  },
  shadow(p, { bob }) {
    ditherShadow(p, 26, 52.5, 12 + Math.sign(bob), 1.6, OUTLINE);
  },
};

const CRYSTAL_LAYERS: Readonly<Record<CrystalUnitKind, CrystalLayers>> = {
  drone: DRONE,
  sentinel: SENTINEL,
  queen: QUEEN,
};

/** Bakes the full hover cycle of a Crystal Hive unit. */
export function bakeCrystalUnit(kind: CrystalUnitKind): UnitSheet {
  const { width, height } = CRYSTAL_UNIT_SIZE[kind];
  const spec = CRYSTAL_LAYERS[kind];
  const amplitude = CRYSTAL_BOB_AMPLITUDE[kind];
  const frames: UnitFrame[] = [];
  for (let frame = 0; frame < CRYSTAL_FRAME_COUNT; frame++) {
    const state: FrameState = { bob: crystalBobOffset(frame, amplitude), frame, bright: frame % 4 < 2 };
    const glow = (paint?: (p: PixelPainter, s: FrameState) => void) =>
      paint ? paintLayer(width, height, (p) => paint(p, state)) : null;
    const solid = (paint?: (p: PixelPainter, s: FrameState) => void) =>
      paint ? withOutline(paintLayer(width, height, (p) => paint(p, state)), width, height, OUTLINE) : null;
    frames.push(
      composeFrame(width, height, [
        paintLayer(width, height, (p) => spec.shadow(p, state)),
        glow(spec.backGlow),
        solid(spec.back),
        solid(spec.body),
        solid(spec.front),
        glow(spec.frontGlow),
      ]),
    );
  }
  return { width, height, frameMs: CRYSTAL_FRAME_MS, frames };
}
