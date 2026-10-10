/**
 * Resource art on the one art-pixel scale (ART_PX world px per art px, never
 * a fractional scale): the crystal cluster of a mineral node, the soft halo
 * in each resource's own color that lifts it off the terrain, the amount bar
 * that shrinks as it is used up, the pulse that hints at a node nobody mines,
 * and the "+5" that floats up when ore is banked.
 */
import { PAL } from '../../engine/renderer/pixelart/palette';
import { PixelPainter } from '../../engine/renderer/pixelart/PixelPainter';
import { ART_PX, SPRITE_GRID } from '../../engine/renderer/sprites/spriteScale';

export const MINERAL_SPRITE_GRID = SPRITE_GRID.mineral;

/** Each resource's own color: the halo, the amount bar and the order marker. */
export const RESOURCE_COLOR = {
  leaf: '#7ee08a',
  fungus: '#b49cf0',
  meat: '#ec6a52',
  crystal: '#7fe8f0',
} as const;
export type ResourceTone = keyof typeof RESOURCE_COLOR;

/** The tone of a food type (leaf, fungus, meat). */
export function foodTone(type: string | undefined): ResourceTone {
  if (type === 'mushroom' || type === 'giant_mushroom') return 'fungus';
  if (type === 'beetle_meat' || type === 'cricket_meat') return 'meat';
  return 'leaf';
}

type Ctx = CanvasRenderingContext2D;

/** Shards of the cluster: x offset, width and full height (art px), back row first. */
const SHARDS: ReadonlyArray<readonly [number, number, number]> = [
  [-8, 3, 7], [4, 3, 9], [-4, 4, 13], [0, 4, 16], [-10, 3, 4], [7, 3, 5],
];

/**
 * A mineral node: a cluster of cyan crystal shards on a dark rubble base,
 * centered on (px, py) world px. The shards shrink with the ore `left` (0..1).
 * The art spans MINERAL_SPRITE_GRID art px; the base sits 7 art px below the center.
 */
export function drawMineralCluster(ctx: Ctx, px: number, py: number, left: number, seed: number): void {
  const p = new PixelPainter(ctx, ART_PX, Math.round(px / ART_PX) * ART_PX, Math.round(py / ART_PX) * ART_PX + 7 * ART_PX);
  const shell = PAL.crystal.shell;
  const out = PAL.crystal.outline;
  const scale = 0.35 + 0.65 * Math.max(0, Math.min(1, left));
  // Rubble base the shards grow from
  p.ellipse(0, 0, 9, 2, out);
  p.ellipse(0, 0, 8, 1, PAL.stone[1]);
  SHARDS.forEach(([x, w, h], i) => {
    const height = Math.max(2, Math.round(h * scale));
    const lean = (seed + i) % 3 === 0 ? 1 : 0;
    // 1-px outline around the shard, then its faces: lit left, deep right, a bright tip
    p.rect(x - 1, -height - 1, w + 2, height + 1, out);
    p.rect(x, -height, w, height, shell[2]);
    p.vline(x, -height, height, shell[4]);
    if (w > 3) p.vline(x + 1, -height + 1, height - 1, shell[3]);
    p.vline(x + w - 1, -height + 2, height - 2, shell[1]);
    p.px(x + Math.floor(w / 2) + lean - 1, -height - 1, out);
    p.px(x + Math.floor(w / 2) + lean, -height - 2, out);
    p.px(x + Math.floor(w / 2) + lean, -height - 1, shell[4]);
    if (height > 6) p.px(x + 1, -height + 2, shell[4]); // glint
  });
}

/** Rasterized filled ellipse in art px, alpha already set on the context. */
function fillEllipse(p: PixelPainter, rx: number, ry: number, color: string): void {
  p.ellipse(0, 0, rx, ry, color);
}

/** 1-art-px ellipse outline: pixels inside (rx, ry) but not inside (rx - 1, ry - 1). */
function ellipseRing(p: PixelPainter, rx: number, ry: number, color: string): void {
  const inside = (x: number, y: number, a: number, b: number) => (x / (a + 0.25)) ** 2 + (y / (b + 0.25)) ** 2 <= 1;
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
      if (inside(x, y, rx, ry) && !inside(x, y, rx - 1, ry - 1)) p.px(x, y, color);
    }
  }
}

const stampCache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

/** Paint once into an offscreen stamp, then blit it: halos are drawn for every resource every frame. */
function stamp(key: string, w: number, h: number, paint: (ctx: Ctx) => void): HTMLCanvasElement | OffscreenCanvas | null {
  let c = stampCache.get(key);
  if (!c) {
    const made = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null;
    if (!made) return null;
    const ctx = made.getContext('2d') as Ctx | null;
    if (!ctx) return null;
    paint(ctx);
    c = made;
    stampCache.set(key, c);
  }
  return c;
}

/**
 * The resource's halo on the ground: a faint fill and a brighter 1-art-px
 * rim in its own color, (rx, ry) art px around (px, py + drop).
 */
export function drawResourceHalo(ctx: Ctx, px: number, py: number, rx: number, ry: number, tone: ResourceTone): void {
  const w = (rx * 2 + 3) * ART_PX;
  const h = (ry * 2 + 3) * ART_PX;
  const color = RESOURCE_COLOR[tone];
  const c = stamp(`halo:${tone}:${rx}:${ry}`, w, h, (g) => {
    const p = new PixelPainter(g, ART_PX, (rx + 1) * ART_PX, (ry + 1) * ART_PX);
    g.globalAlpha = 0.16;
    fillEllipse(p, rx, ry, color);
    g.globalAlpha = 0.55;
    ellipseRing(p, rx, ry, color);
    g.globalAlpha = 1;
  });
  if (!c) return;
  ctx.drawImage(c, Math.round(px / ART_PX) * ART_PX - (rx + 1) * ART_PX, Math.round(py / ART_PX) * ART_PX - (ry + 1) * ART_PX);
}

/** The pulsing rim on a node nobody mines while the colony has no miners: a hint to send some. */
export function drawMineHint(ctx: Ctx, px: number, py: number, time: number): void {
  const step = Math.floor((time * 3) % 3); // 3 discrete sizes, no smooth tween
  const rx = 14 + step;
  const ry = 6 + step;
  ctx.globalAlpha = [0.85, 0.6, 0.35][step];
  const p = new PixelPainter(ctx, ART_PX, Math.round(px / ART_PX) * ART_PX, Math.round(py / ART_PX) * ART_PX);
  ellipseRing(p, rx, ry, RESOURCE_COLOR.crystal);
  ctx.globalAlpha = 1;
}

/**
 * A small bar under a resource: what is left of it (0..1) in its own color,
 * `width` art px wide, its top `below` art px under (px, py).
 */
export function drawAmountBar(ctx: Ctx, px: number, py: number, frac: number, tone: ResourceTone, width = 12, below = 9): void {
  const p = new PixelPainter(ctx, ART_PX, Math.round(px / ART_PX) * ART_PX, Math.round(py / ART_PX) * ART_PX);
  const x = -Math.floor(width / 2);
  const fill = Math.max(1, Math.round(width * Math.max(0, Math.min(1, frac))));
  p.rect(x - 1, below - 1, width + 2, 4, PAL.outline);
  p.rect(x, below, width, 2, '#2a2230');
  p.rect(x, below, fill, 2, RESOURCE_COLOR[tone]);
}

/** 3×5 digits and the plus sign for the ore float. */
const DIGITS: Record<string, string> = {
  '0': '111 101 101 101 111', '1': '010 110 010 010 111', '2': '111 001 111 100 111', '3': '111 001 111 001 111',
  '4': '101 101 111 001 001', '5': '111 100 111 001 111', '6': '111 100 111 101 111', '7': '111 001 010 010 010',
  '8': '111 101 111 101 111', '9': '111 101 111 001 111', '+': '000 010 111 010 000',
};

/** Seconds an ore float lasts */
export const ORE_FLOAT_SECONDS = 1.2;

/**
 * "+5" in cyan with a dark outline, rising from (px, py) as it ages
 * (0..ORE_FLOAT_SECONDS) and blinking out at the end.
 */
export function drawOreFloat(ctx: Ctx, px: number, py: number, amount: number, age: number): void {
  const t = age / ORE_FLOAT_SECONDS;
  if (t >= 1 || (t > 0.75 && Math.floor(age * 16) % 2 === 1)) return;
  const text = `+${Math.round(amount)}`;
  const rise = Math.floor(t * 10); // whole art px
  const width = text.length * 4 - 1;
  const p = new PixelPainter(ctx, ART_PX, Math.round(px / ART_PX) * ART_PX - Math.floor(width / 2) * ART_PX, Math.round(py / ART_PX) * ART_PX - (16 + rise) * ART_PX);
  const glyph = (ox: number, oy: number, color: string) => {
    [...text].forEach((ch, i) => {
      const rows = (DIGITS[ch] ?? DIGITS['0']).split(' ');
      rows.forEach((row, y) => [...row].forEach((bit, x) => {
        if (bit === '1') p.px(i * 4 + x + ox, y + oy, color);
      }));
    });
  };
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) glyph(ox, oy, PAL.crystal.outline);
  glyph(0, 0, RESOURCE_COLOR.crystal);
}
