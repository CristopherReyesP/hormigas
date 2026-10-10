/**
 * Paints the CombatVfx pool in pixel art: 2×2 screen-px blocks on the art
 * grid, palette colors only, fades by dithering (never alpha).
 *
 * Two passes so the ground stays under the units:
 *  - 'ground': acid puddles, Swarm goo and wildlife carcasses (draw over food,
 *    under units: a carcass hides its meat drop, then fades to reveal it)
 *  - 'air': droplets, cross flashes, chips, shards, death flashes, dust rings
 *    (draw after units, before fog)
 *
 * Effects draw only on the layer they happened on and, when a fog grid is
 * given, only on tiles the colony sees right now (the same rule that hides
 * wildlife, see fogVisibility.ts). The underground has no fog: pass null.
 */
import type { LayerValue } from '../components/components';
import { PAL, hash2 } from '../../engine/renderer/pixelart/palette';
import { isTileVisible, type VisibilityReader } from '../../engine/renderer/fogVisibility';
import { ART_PER_TILE, ART_PX, type CombatVfx, type DebrisStyle, type VfxSlot } from './CombatVfx';

/** The slice of a 2D context the effects need (lets tests count pixels) */
export type VfxCanvas = Pick<CanvasRenderingContext2D, 'fillStyle' | 'fillRect' | 'getTransform' | 'setTransform'>;
export type VfxPass = 'ground' | 'air';

let ink = '';
// The camera transform of the current draw call (scale + translate only).
// Art pixels are snapped to whole device pixels with it: the camera's
// 0.85 perspective squash would otherwise leave hairline seams between rows.
let scaleX = 1;
let scaleY = 1;
let offsetX = 0;
let offsetY = 0;

function setInk(ctx: VfxCanvas, color: string): void {
  if (color !== ink) {
    ctx.fillStyle = color;
    ink = color;
  }
}

/** One art pixel at art-grid (gx, gy), as a whole-device-pixel block */
function px(ctx: VfxCanvas, gx: number, gy: number, color: string): void {
  const x0 = Math.round(gx * ART_PX * scaleX + offsetX);
  const y0 = Math.round(gy * ART_PX * scaleY + offsetY);
  const x1 = Math.round((gx + 1) * ART_PX * scaleX + offsetX);
  const y1 = Math.round((gy + 1) * ART_PX * scaleY + offsetY);
  if (x1 === x0 || y1 === y0) return;
  setInk(ctx, color);
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}

/**
 * Dithered fade, anchored to the world grid so the pattern never swims:
 * step 0 keeps every pixel, step 1 a checkerboard, step 2 one in four.
 */
function keep(step: number, gx: number, gy: number): boolean {
  if (step <= 0) return true;
  if (step === 1) return ((gx + gy) & 1) === 0;
  return (gx & 1) === 0 && (gy & 1) === 0;
}

/** Art-grid column of a tile-space x (entities are drawn at tile * 32 + 16) */
function artGrid(tile: number): number {
  return Math.round(tile * ART_PER_TILE + ART_PER_TILE / 2);
}

function visibleAt(fog: VisibilityReader | null, s: VfxSlot, offX: number, offY: number): boolean {
  if (!fog) return true;
  return isTileVisible(fog, Math.round(s.x + offX / ART_PER_TILE), Math.round(s.y + offY / ART_PER_TILE));
}

export function drawCombatVfx(
  ctx: VfxCanvas,
  vfx: CombatVfx,
  pass: VfxPass,
  layer: LayerValue,
  fog: VisibilityReader | null,
): void {
  ink = '';
  const camera = ctx.getTransform();
  scaleX = camera.a;
  scaleY = camera.d;
  offsetX = camera.e;
  offsetY = camera.f;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const slots = pass === 'ground' ? vfx.decals : vfx.particles;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.alive || s.age < 0 || s.layer !== layer) continue;
    switch (s.kind) {
      case 'droplet': drawDroplet(ctx, s, fog); break;
      case 'debris': drawDebris(ctx, s, fog); break;
      case 'cross': if (visibleAt(fog, s, 0, 0)) drawCross(ctx, s); break;
      case 'flash': if (visibleAt(fog, s, 0, 0)) drawFlash(ctx, s); break;
      case 'ring': if (visibleAt(fog, s, 0, 0)) drawRing(ctx, s); break;
      case 'puddle': if (visibleAt(fog, s, s.ox, s.oy)) drawPuddle(ctx, s); break;
      case 'goo': if (visibleAt(fog, s, 0, 0)) drawGoo(ctx, s); break;
      case 'carcass': if (visibleAt(fog, s, 0, 0)) drawCarcass(ctx, s); break;
    }
  }
  ctx.setTransform(camera);
}

// ── Air pass ────────────────────────────────────────────────

/** Reused scratch points: the air pass allocates nothing per frame */
const HEAD = { x: 0, y: 0 };
const TRAIL = { x: 0, y: 0 };

/** Where a droplet is at flight progress `p`: along the line, lifted by its arc */
function dropletAt(s: VfxSlot, p: number, out: { x: number; y: number }): void {
  const q = Math.max(0, p);
  out.x = s.ox + (s.tx - s.ox) * q;
  out.y = s.oy + (s.ty - s.oy) * q - s.arc * 4 * q * (1 - q);
}

/** A chartreuse bead arcing from the attacker: hot head, glowing body, dark tail */
function drawDroplet(ctx: VfxCanvas, s: VfxSlot, fog: VisibilityReader | null): void {
  const p = s.age / s.life;
  dropletAt(s, p, HEAD);
  if (!visibleAt(fog, s, HEAD.x, HEAD.y)) return;
  const ax = artGrid(s.x);
  const ay = artGrid(s.y);
  // A streak along the arc behind it, then the bead
  dropletAt(s, p - 0.1, TRAIL);
  line(ctx, ax + Math.round(TRAIL.x), ay + Math.round(TRAIL.y), ax + Math.round(HEAD.x), ay + Math.round(HEAD.y), 0, PAL.acid[1]);
  // A 2×2 bead: hot core up-left, glowing body around it
  const hx = ax + Math.round(HEAD.x);
  const hy = ay + Math.round(HEAD.y);
  px(ctx, hx + 1, hy, PAL.acid[2]);
  px(ctx, hx, hy + 1, PAL.acid[2]);
  px(ctx, hx + 1, hy + 1, PAL.acid[1]);
  px(ctx, hx, hy, PAL.acid[3]);
}

/** The 4 px cross on impact: a tight plus, then its tips sparkle out to 4 px */
function drawCross(ctx: VfxCanvas, s: VfxSlot): void {
  const acid = s.style === 'acid';
  const core = acid ? PAL.acid[3] : PAL.vfxFlash;
  const arm = acid ? PAL.acid[2] : PAL.white;
  const tip = acid ? PAL.acid[1] : PAL.glowAmber;
  const cx = artGrid(s.x);
  const cy = artGrid(s.y);
  const early = s.age < s.life * 0.5;
  px(ctx, cx, cy, early ? core : arm);
  for (let k = 0; k < 4; k++) {
    const dx = k === 0 ? 1 : k === 1 ? -1 : 0;
    const dy = k === 2 ? 1 : k === 3 ? -1 : 0;
    if (early) {
      px(ctx, cx + dx, cy + dy, arm);
      px(ctx, cx + dx * 2, cy + dy * 2, arm);
    } else {
      px(ctx, cx + dx, cy + dy, arm);
      px(ctx, cx + dx * 3, cy + dy * 3, tip);
      px(ctx, cx + dx * 4, cy + dy * 4, tip);
    }
  }
}

const DEBRIS_COLORS: Record<DebrisStyle, readonly string[]> = {
  chitin: [PAL.beetle[1], PAL.beetle[2], PAL.beetleEye], // olive shell, amber glints
  straw: [PAL.cricket[0], PAL.cricket[1], PAL.cricket[2]],
  flesh: [PAL.swarm.flesh[3], PAL.swarm.flesh[4], PAL.swarm.vein[1]],
  goo: [PAL.acid[1], PAL.acid[2], PAL.acid[2]],
  shard: [PAL.crystal.shell[2], PAL.crystal.shell[3], PAL.crystal.shield],
  soil: [PAL.soil[2], PAL.soil[4], PAL.wood[2]],
};

/** Chips, goo beads and crystal shards: a 1-2 px bit and its ground shadow */
function drawDebris(ctx: VfxCanvas, s: VfxSlot, fog: VisibilityReader | null): void {
  if (!visibleAt(fog, s, s.ox, s.oy)) return;
  const gx = artGrid(s.x) + Math.round(s.ox);
  const ground = artGrid(s.y) + Math.round(s.oy);
  const gy = ground - Math.round(s.z);
  if (s.z > 3) px(ctx, gx, ground, PAL.outline);

  const colors = DEBRIS_COLORS[s.style as DebrisStyle];
  if (s.style === 'shard') {
    // 1×2 shard tumbling: flips between upright and flat as it spins
    const upright = (Math.floor(s.age / 0.06) + s.seed) % 2 === 0;
    px(ctx, gx, gy, PAL.crystal.shell[4]);
    px(ctx, upright ? gx : gx + 1, upright ? gy + 1 : gy, colors[s.seed % colors.length]);
    return;
  }
  const color = colors[s.seed % colors.length];
  px(ctx, gx, gy, color);
  if (s.style === 'goo') px(ctx, gx, gy + 1, PAL.acid[0]);
  else if (s.seed % 3 === 0) px(ctx, gx + 1, gy, colors[(s.seed + 1) % colors.length]);
}

/** Flash sizes (art px half-axes) roughly covering each body's sprite */
const BODY_RADII: Record<string, readonly [number, number]> = {
  ant: [8, 3.5],
  beetle: [9, 7],
  cricket: [14, 5],
};

const paintFlashSolid = (): string => PAL.vfxFlash;
const paintFlashRim = (r: number): string | null => (r > 0.72 ? PAL.vfxFlash : null);

/** The death pop: the body goes white for a frame, then a white rim */
function drawFlash(ctx: VfxCanvas, s: VfxSlot): void {
  const [rx, ry] = BODY_RADII[s.style] ?? BODY_RADII.ant;
  const paint = s.age < s.life * 0.5 ? paintFlashSolid : paintFlashRim;
  rotEllipse(ctx, artGrid(s.x), artGrid(s.y), s.angle, 0, 0, rx, ry, 0, paint);
}

/** A den's dust ring rolling out in 3 steps, thinning as it goes */
function drawRing(ctx: VfxCanvas, s: VfxSlot): void {
  const step = Math.min(2, Math.floor((s.age / s.life) * 3));
  const r = 8 + step * 6;
  const cx = artGrid(s.x);
  const cy = artGrid(s.y);
  const color = step === 0 ? PAL.dust[2] : PAL.dust[1];
  // Midpoint circle, two px thick on the first step
  for (let t = 0; t <= (step === 0 ? 1 : 0); t++) {
    let x = r - t;
    let y = 0;
    let err = 1 - x;
    while (x >= y) {
      ring8(ctx, cx, cy, x, y, step, color);
      y++;
      if (err < 0) err += 2 * y + 1;
      else { x--; err += 2 * (y - x) + 1; }
    }
  }
}

/** The 8 symmetric octant points of a midpoint circle */
function ring8(ctx: VfxCanvas, cx: number, cy: number, x: number, y: number, step: number, color: string): void {
  plot(ctx, cx + x, cy + y, step, color); plot(ctx, cx - x, cy + y, step, color);
  plot(ctx, cx + x, cy - y, step, color); plot(ctx, cx - x, cy - y, step, color);
  plot(ctx, cx + y, cy + x, step, color); plot(ctx, cx - y, cy + x, step, color);
  plot(ctx, cx + y, cy - x, step, color); plot(ctx, cx - y, cy - x, step, color);
}

// ── Ground pass ─────────────────────────────────────────────

/** Acid puddle: rim, body, a glint; full → checker → sparse over its life */
function drawPuddle(ctx: VfxCanvas, s: VfxSlot): void {
  const step = Math.min(2, Math.floor((s.age / s.life) * 3));
  const rx = 3.5 + (s.seed % 3) * 0.5;
  rotEllipse(ctx, artGrid(s.x) + s.ox, artGrid(s.y) + s.oy, 0, 0, 0, rx, 2.6, step, paintPuddle);
}

function paintPuddle(r: number, u: number, v: number): string {
  if (r > 0.78) return PAL.acid[0];
  if (u < -0.8 && v < -0.4 && r < 0.6) return PAL.acid[2];
  return PAL.acid[1];
}

/** Decals linger at full strength, then fade in 3 dithered steps */
function lingerStep(s: VfxSlot): number {
  const p = s.age / s.life;
  return p < 0.6 ? 0 : p < 0.8 ? 1 : 2;
}

/** Swarm goo: a glowing splat with satellite drops, streaks and bits of flesh */
function drawGoo(ctx: VfxCanvas, s: VfxSlot): void {
  const step = lingerStep(s);
  const cx = artGrid(s.x);
  const cy = artGrid(s.y);
  rotEllipse(ctx, cx, cy, 0, 0, 0, 6, 4.5, step, paintGoo);
  for (let i = 0; i < 8; i++) {
    const a = (i + hash2(s.seed, i) * 0.8) * (Math.PI / 4);
    const dist = 7 + hash2(i + 11, s.seed) * 6;
    const dx = Math.cos(a);
    const dy = Math.sin(a) * 0.8;
    const sx = cx + Math.round(dx * dist);
    const sy = cy + Math.round(dy * dist);
    // Streak back toward the splat, then the drop itself
    plot(ctx, cx + Math.round(dx * (dist - 2)), cy + Math.round(dy * (dist - 2)), step, PAL.acid[0]);
    plot(ctx, sx, sy, step, PAL.acid[1]);
    if (i % 2 === 0) {
      plot(ctx, sx + 1, sy, step, PAL.acid[1]);
      plot(ctx, sx, sy - 1, step, PAL.acid[2]);
    }
  }
  // Bits of the dead ant in the goo
  for (let i = 0; i < 3; i++) {
    const fx = cx + Math.round((hash2(s.seed + i, 7) - 0.5) * 6);
    const fy = cy + Math.round((hash2(3, s.seed + i) - 0.5) * 4);
    plot(ctx, fx, fy, step, PAL.swarm.flesh[i === 0 ? 2 : 3]);
    if (i === 0) plot(ctx, fx + 1, fy, step, PAL.swarm.flesh[1]);
  }
}

function paintGoo(r: number, u: number, v: number): string {
  if (r > 0.8) return PAL.acid[0];
  if (u < -1 && v < -0.5 && r < 0.65) return PAL.acid[2];
  return PAL.acid[1];
}

function plot(ctx: VfxCanvas, gx: number, gy: number, step: number, color: string): void {
  if (keep(step, gx, gy)) px(ctx, gx, gy, color);
}

/** Wildlife left belly-up: a stain, curled legs, the shell, the head */
function drawCarcass(ctx: VfxCanvas, s: VfxSlot): void {
  const step = lingerStep(s);
  const cx = artGrid(s.x);
  const cy = artGrid(s.y);
  const a = s.angle;
  if (s.style === 'cricket') {
    rotEllipse(ctx, cx + 1, cy + 2, a, -1, 0, 10, 4, shadowStep(step), paintShadow);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      rotLine(ctx, cx, cy, a, 12, side, 17, side * 4, step, PAL.cricket[0]); // antennae
      rotLine(ctx, cx, cy, a, 17, side * 4, 21, side * 5, step, PAL.cricket[0]);
      rotLine(ctx, cx, cy, a, -2, side * 2.5, -8, side * 8, step, PAL.cricket[1]); // hind thigh
      rotLine(ctx, cx, cy, a, -1, side * 2.5, -7, side * 8, step, PAL.cricket[1]);
      rotLine(ctx, cx, cy, a, -8, side * 8, -15, side * 5, step, PAL.cricket[0]); // hind shin
      rotLine(ctx, cx, cy, a, 5, side * 2.5, 7, side * 5.5, step, PAL.cricket[0]); // front legs
      rotLine(ctx, cx, cy, a, 7, side * 5.5, 9, side * 5, step, PAL.outline);
      rotLine(ctx, cx, cy, a, 1, side * 2.5, 0, side * 6, step, PAL.cricket[0]);
    }
    rotEllipse(ctx, cx, cy, a, -1, 0, 9.5, 3.2, step, paintCricketBody);
    rotEllipse(ctx, cx, cy, a, 10, 0, 2.6, 2.4, step, paintCricketHead);
    return;
  }
  rotEllipse(ctx, cx + 1, cy + 2, a, 0, 0, 7.5, 5.5, shadowStep(step), paintShadow);
  rotEllipse(ctx, cx, cy, a, 0, 0, 7, 5, step, paintBeetleBody);
  rotEllipse(ctx, cx, cy, a, 8, 0, 2.5, 2.5, step, paintBeetleHead);
  // Legs curled up over the belly, drawn last: dark shins, pale tips
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    for (let k = -3.5; k <= 3.5; k += 3.5) {
      rotLine(ctx, cx, cy, a, k - 1, side * 4, k, side * 7.5, step, PAL.outline);
      rotLine(ctx, cx, cy, a, k + 0.5, side * 7.5, k + 2.5, side * 5.5, step, PAL.beetle[2]);
    }
  }
}

/** A drop shadow, offset down-right like every sprite's (light from the top-left) */
function paintShadow(): string {
  return PAL.outline;
}

/** Shadows are always at least a checkerboard, and thin out with the decal */
function shadowStep(step: number): number {
  return Math.min(2, step + 1);
}

function paintCricketBody(r: number, u: number, v: number): string {
  if (r > 0.82) return PAL.outline;
  if (v > 0 && ((Math.round(u) + 20) % 3) === 0) return PAL.cricket[0];
  if (v < -0.8) return PAL.cricket[2];
  return v > 1 ? PAL.cricket[0] : PAL.cricket[1];
}

function paintCricketHead(r: number): string {
  return r > 0.7 ? PAL.outline : PAL.cricket[0];
}

/** Belly up: pale plates split by dark seams, shaded away from the top-left light */
function paintBeetleBody(r: number, u: number, v: number): string {
  if (r > 0.8) return PAL.outline;
  if (((Math.round(u) + 8) % 3) === 0) return PAL.beetle[0];
  return v > 1.5 ? PAL.beetle[1] : PAL.beetle[2];
}

function paintBeetleHead(r: number): string {
  return r > 0.7 ? PAL.outline : PAL.beetle[0];
}

// ── Rotated pixel primitives ────────────────────────────────

/**
 * Filled ellipse in a frame rotated by `angle` (u along the facing, v across),
 * centered at local (u0, v0). `paint` gets the normalized radius and local
 * coords and returns a palette color, or null to leave the pixel empty.
 * Scanning the screen grid (not the shape) means rotation never leaves holes.
 */
function rotEllipse(
  ctx: VfxCanvas, cx: number, cy: number, angle: number,
  u0: number, v0: number, rx: number, ry: number, step: number,
  paint: (r: number, u: number, v: number) => string | null,
): void {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const ox = cx + Math.round(u0 * c - v0 * sn);
  const oy = cy + Math.round(u0 * sn + v0 * c);
  const R = Math.ceil(Math.max(rx, ry));
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const u = dx * c + dy * sn;
      const v = -dx * sn + dy * c;
      const nu = u / (rx + 0.25);
      const nv = v / (ry + 0.25);
      const r2 = nu * nu + nv * nv;
      if (r2 > 1) continue;
      const gx = ox + dx;
      const gy = oy + dy;
      if (!keep(step, gx, gy)) continue;
      const color = paint(Math.sqrt(r2), u, v);
      if (color) px(ctx, gx, gy, color);
    }
  }
}

/** Bresenham line on the art grid, faded by `step` */
function line(ctx: VfxCanvas, x: number, y: number, x1: number, y1: number, step: number, color: string): void {
  const dx = Math.abs(x1 - x);
  const dy = -Math.abs(y1 - y);
  const sx = x < x1 ? 1 : -1;
  const sy = y < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(ctx, x, y, step, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/** Bresenham line between two local (u, v) points of a rotated frame */
function rotLine(
  ctx: VfxCanvas, cx: number, cy: number, angle: number,
  u0: number, v0: number, u1: number, v1: number, step: number, color: string,
): void {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  line(
    ctx,
    cx + Math.round(u0 * c - v0 * sn), cy + Math.round(u0 * sn + v0 * c),
    cx + Math.round(u1 * c - v1 * sn), cy + Math.round(u1 * sn + v1 * c),
    step, color,
  );
}
