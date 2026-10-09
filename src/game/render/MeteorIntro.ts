import type { Camera } from '../../engine/camera/Camera';
import { PAL, hash2 } from '../../engine/renderer/pixelart/palette';
import { PixelPainter } from '../../engine/renderer/pixelart/PixelPainter';
import { drawPixelText, textWidth, GLYPH_H } from '../../engine/renderer/pixelart/PixelFont';
import { CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE } from '../../shared/constants';
import type { TilePos } from '../run/craterSite';
import type { CrystalShard } from '../../engine/renderer/alienDecor';
import {
  INTRO_TIMELINE,
  INTRO_TITLE_LINES,
  SPORE_COUNT,
  crackPulseStep,
  flashAlpha,
  impactGlowAlpha,
  meteorProgress,
  meteorScreenPath,
  pointOnPath,
  shakeOffset,
  shockwaveProgress,
  sporeMote,
  titleAlpha,
  type MeteorPath,
  type Vec2,
} from './introTimeline';

/** One art pixel = 2 world px at zoom 1 (art direction). */
const ART = 2;
/** Crater bowl radii and the debris skirt around it, in art px. */
const CR_RX = 26;
const CR_RY = 18;
const CR_PAD = 8;
const CR_CX = CR_RX + CR_PAD;
const CR_CY = CR_RY + CR_PAD;
const CRACK_COLORS = [PAL.crystal.shell[2], PAL.crystal.shell[3], PAL.crystal.shield] as const;
const SCREEN = { w: CANVAS_WIDTH, h: CANVAS_HEIGHT };
const NO_SHAKE: Vec2 = { x: 0, y: 0 };
const SPARKS = 48;
/** Title font pixel = 10 screen px: two lines, each nearly the screen's width */
const TITLE_SCALE = 10;
const TITLE_TOP = 150;
const TITLE_LINE_GAP = 16;
/** Bevel-like stepped shading down the glyph rows: highlight, chartreuse, shade */
const titleRowColor = (row: number): string =>
  row === 0 ? PAL.white : row >= 5 ? PAL.glowGreen : PAL.swarm.vein[1];

const even = (v: number): number => Math.round(v / 2) * 2;

/** Dithered disc at one quantized alpha — the game's stand-in for a soft glow. */
function makeHalo(color: string, rArt: number): OffscreenCanvas {
  const size = (rArt * 2 + 1) * ART;
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext('2d')!;
  g.globalAlpha = 0.35;
  new PixelPainter(g, ART).shadow(rArt, rArt, rArt, rArt, color);
  return c;
}

/**
 * The run's opening, drawn. Timing lives in introTimeline.ts; this class only
 * keeps the clock, the skip flag and the pre-rendered crater art.
 *
 * Draw order (wired by RenderSystem): crater with the terrain, shockwave and
 * spores after the fog, then meteor, edge ping, flash and title card in
 * screen space after the sky tint. The crater outlives the intro.
 */
export class MeteorIntro {
  private elapsed = 0;
  private skipped = false;
  /** Rendered frames since the impact; -1 until it lands */
  private framesSinceImpact = -1;
  private readonly impact: Vec2;
  private readonly nest: Vec2;
  private readonly seed: TilePos;
  private craterBase: OffscreenCanvas | null = null;
  private crackLayers: OffscreenCanvas[] = [];
  private meteorHalo: OffscreenCanvas | null = null;
  private meteorCore: OffscreenCanvas | null = null;
  private crystalHalo: OffscreenCanvas | null = null;
  /** Crystal shards around the crater (the Hive's corruption) and their tips */
  private readonly shards: readonly CrystalShard[];
  private shardLayer: OffscreenCanvas | null = null;
  private shardGlints: OffscreenCanvas | null = null;
  private shardReach = 0;

  constructor(impactTile: TilePos, nestTile: TilePos, shards: readonly CrystalShard[] = []) {
    this.shards = shards;
    this.seed = { x: impactTile.x, y: impactTile.y };
    this.impact = { x: impactTile.x * TILE_SIZE + TILE_SIZE / 2, y: impactTile.y * TILE_SIZE + TILE_SIZE / 2 };
    this.nest = { x: nestTile.x * TILE_SIZE + TILE_SIZE / 2, y: nestTile.y * TILE_SIZE + TILE_SIZE / 2 };
  }

  /** Game time (0 while paused). The flash counts frames, not seconds. */
  advance(dt: number): void {
    if (this.framesSinceImpact >= 0 && this.framesSinceImpact < 2) this.framesSinceImpact++;
    const before = this.elapsed;
    this.elapsed += dt;
    if (!this.skipped && before < INTRO_TIMELINE.impact && this.elapsed >= INTRO_TIMELINE.impact) {
      this.framesSinceImpact = 0;
    }
  }

  /** Drop every remaining effect; the crater stays. */
  skip(): void {
    this.skipped = true;
  }

  isPlaying(): boolean {
    return !this.skipped && this.elapsed < INTRO_TIMELINE.end;
  }

  hasCrater(): boolean {
    return this.skipped || this.elapsed >= INTRO_TIMELINE.impact;
  }

  getShake(): Vec2 {
    return this.skipped ? NO_SHAKE : shakeOffset(this.elapsed);
  }

  /** World space, right after the terrain: the decal with its pulsing cracks. */
  drawCrater(ctx: CanvasRenderingContext2D, time: number): void {
    if (!this.hasCrater()) return;
    this.ensureCraterArt();
    const x = Math.round(this.impact.x) - CR_CX * ART;
    const y = Math.round(this.impact.y) - CR_CY * ART;
    ctx.drawImage(this.craterBase!, x, y);
    ctx.drawImage(this.crackLayers[crackPulseStep(time)], x, y);
    if (this.shardLayer) ctx.drawImage(this.shardLayer, this.shardOrigin().x, this.shardOrigin().y);
  }

  /** World px of the shard layer's top-left corner (it is centered on the impact tile). */
  private shardOrigin(): Vec2 {
    return {
      x: (this.seed.x - this.shardReach) * TILE_SIZE,
      y: (this.seed.y - this.shardReach) * TILE_SIZE,
    };
  }

  /** World space, post-tint, additive: the cracks shine through the night. */
  drawCrackGlow(ctx: CanvasRenderingContext2D, time: number): void {
    if (!this.hasCrater() || !this.crystalHalo) return;
    const x = Math.round(this.impact.x) - CR_CX * ART;
    const y = Math.round(this.impact.y) - CR_CY * ART;
    ctx.drawImage(this.crackLayers[crackPulseStep(time)], x, y);
    if (this.shardGlints) ctx.drawImage(this.shardGlints, this.shardOrigin().x, this.shardOrigin().y);
    const h = this.crystalHalo.width / 2;
    ctx.drawImage(this.crystalHalo, Math.round(this.impact.x - h), Math.round(this.impact.y - h));
  }

  /** World space, after the fog: the shockwave ring and the spore stream. */
  drawWorldFx(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.skipped) return;
    const view = camera.getViewRectTiles();
    const minX = view.x * TILE_SIZE - 8;
    const minY = view.y * TILE_SIZE - 8;
    const maxX = (view.x + view.w) * TILE_SIZE + 8;
    const maxY = (view.y + view.h) * TILE_SIZE + 8;

    const wave = shockwaveProgress(this.elapsed);
    if (wave !== null) {
      // Ease-out growth: it bursts from the crater and sweeps past the colony
      const reach = Math.hypot(this.nest.x - this.impact.x, this.nest.y - this.impact.y) + 900;
      const r = reach * (1 - (1 - wave) ** 2);
      const a = wave < 0.25 ? 1 : wave < 0.5 ? 0.8 : wave < 0.75 ? 0.55 : 0.3;
      const bands: Array<[number, string, number, number]> = [
        // offset behind the front, color, square size, alpha factor
        [0, PAL.meteor[0], 8, 1],
        [8, PAL.sand[2], 6, 0.85],
        [18, PAL.sand[1], 6, 0.7],
        [30, PAL.sand[0], 4, 0.55],
        [46, PAL.soil[2], 4, 0.4],
      ];
      for (const [behind, color, size, k] of bands) {
        const rr = r - behind;
        if (rr <= 0) continue;
        const n = Math.ceil((Math.PI * 2 * rr) / 5);
        ctx.globalAlpha = a * k;
        ctx.fillStyle = color;
        for (let i = 0; i < n; i++) {
          if (behind >= 30 && i % 2 === 1) continue; // the trailing dust is dithered
          const th = (i / n) * Math.PI * 2;
          const x = this.impact.x + Math.cos(th) * rr;
          const y = this.impact.y + Math.sin(th) * rr;
          if (x < minX || x > maxX || y < minY || y > maxY) continue;
          ctx.fillRect(even(x) - size / 2, even(y) - size / 2, size, size);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Spores: 1-art-px magenta motes with an additive halo, funnelling toward the colony
    for (let i = 0; i < SPORE_COUNT; i++) {
      const m = sporeMote(i, this.elapsed, this.nest, this.impact);
      if (!m || m.x < minX || m.x > maxX || m.y < minY || m.y > maxY) continue;
      const x = even(m.x);
      const y = even(m.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = m.alpha * 0.5;
      ctx.fillStyle = PAL.swarm.flesh[2];
      ctx.fillRect(x - ART, y - ART, ART * 3, ART * 3);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = m.alpha;
      ctx.fillStyle = m.bright ? PAL.swarm.flesh[4] : PAL.swarm.flesh[3];
      ctx.fillRect(x, y, ART, ART);
      if (m.bright) {
        // Bright motes twinkle as a 1-art-px cross
        ctx.fillRect(x - ART, y, ART, ART);
        ctx.fillRect(x + ART, y, ART, ART);
        ctx.fillRect(x, y - ART, ART, ART);
        ctx.fillRect(x, y + ART, ART, ART);
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Screen space, after the sky tint. `camera` is null on the underground
   * layer, which only gets the flash and the title card.
   */
  drawScreenFx(ctx: CanvasRenderingContext2D, camera: Camera | null): void {
    if (this.skipped) return;
    ctx.save();
    if (camera) {
      const p = meteorProgress(this.elapsed);
      if (p !== null) {
        const end = camera.worldToScreen(this.impact.x, this.impact.y);
        this.drawMeteor(ctx, meteorScreenPath(end, SCREEN), p);
      }
      this.drawEdgePing(ctx, camera);
    }

    // Full white for two frames, then a warm fireball wash steps out
    const flash = flashAlpha(this.framesSinceImpact);
    const glow = impactGlowAlpha(this.elapsed);
    if (flash > 0 || glow > 0) {
      ctx.globalAlpha = flash > 0 ? flash : glow;
      ctx.fillStyle = flash > 0 ? PAL.white : PAL.meteor[1];
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    const title = titleAlpha(this.elapsed);
    if (title > 0) this.drawTitle(ctx, title);
    ctx.restore();
  }

  private drawMeteor(ctx: CanvasRenderingContext2D, path: MeteorPath, p: number): void {
    const T = INTRO_TIMELINE;
    const head = pointOnPath(path, p);
    const len = Math.hypot(path.end.x - path.start.x, path.end.y - path.start.y) || 1;
    const ux = (path.end.x - path.start.x) / len;
    const uy = (path.end.y - path.start.y) / len;

    // Sparks shed along the flight line, thrown sideways and falling
    for (let j = 0; j < SPARKS; j++) {
      const born = T.meteorStart + (j / SPARKS) * (T.impact - T.meteorStart);
      const age = this.elapsed - born;
      if (age < 0 || age >= 0.55) continue;
      const base = pointOnPath(path, meteorProgress(born) ?? 0);
      const side = (hash2(j, 61) - 0.5) * 380;
      const x = base.x - ux * 120 * age - uy * side * age;
      const y = base.y - uy * 120 * age + ux * side * age + 320 * age * age;
      ctx.fillStyle = age < 0.15 ? PAL.meteor[0] : age < 0.32 ? PAL.meteor[1] : PAL.meteor[2];
      const s = age < 0.12 ? 6 : age < 0.3 ? 4 : 2;
      ctx.fillRect(even(x) - s / 2, even(y) - s / 2, s, s);
    }

    // Trail: an additive glow band that widens and fades toward the tail,
    // over a hot core that tapers white → orange → dark red and flickers
    const L = 320;
    const flicker = Math.floor(this.elapsed * 30);
    const step = 4;
    ctx.globalCompositeOperation = 'lighter';
    for (let d = 0; d < L; d += step) {
      const f = d / L;
      const w = even(16 + 40 * f);
      const wob = (hash2(d, flicker) - 0.5) * 10 * f;
      ctx.globalAlpha = f < 0.33 ? 0.45 : f < 0.66 ? 0.28 : 0.14;
      ctx.fillStyle = f < 0.4 ? PAL.meteor[1] : PAL.meteor[2];
      ctx.fillRect(even(head.x - ux * d - uy * wob - w / 2), even(head.y - uy * d + ux * wob - w / 2), w, w);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let d = 0; d < L * 0.75; d += step) {
      const f = d / (L * 0.75);
      const size = even(20 * (1 - f)) + 2;
      const wob = (hash2(d, flicker + 7) - 0.5) * 6 * f;
      ctx.globalAlpha = f > 0.7 ? 0.6 : 1;
      ctx.fillStyle = f < 0.15 ? PAL.white : f < 0.35 ? PAL.meteor[0] : f < 0.65 ? PAL.meteor[1] : PAL.meteor[2];
      ctx.fillRect(even(head.x - ux * d - uy * wob - size / 2), even(head.y - uy * d + ux * wob - size / 2), size, size);
    }
    ctx.globalAlpha = 1;

    // Head: two additive halos, then a pixel fireball — dark-red rim to a white-hot core
    if (!this.meteorHalo) this.meteorHalo = makeHalo(PAL.meteor[1], 28);
    if (!this.meteorCore) this.meteorCore = makeHalo(PAL.meteor[0], 12);
    ctx.globalCompositeOperation = 'lighter';
    for (const halo of [this.meteorHalo, this.meteorCore]) {
      const h = halo.width / 2;
      ctx.drawImage(halo, even(head.x - h), even(head.y - h));
    }
    ctx.globalCompositeOperation = 'source-over';
    const hp = new PixelPainter(ctx, ART);
    const hx = Math.round(head.x / ART);
    const hy = Math.round(head.y / ART);
    hp.disc(hx, hy, 8, PAL.meteor[2]);
    hp.disc(hx, hy, 6, PAL.meteor[1]);
    hp.disc(hx, hy, 4, PAL.meteor[0]);
    hp.disc(hx, hy, 2, PAL.white);
  }

  /** A blinking crystal diamond on the screen edge, pointing at an off-screen crater. */
  private drawEdgePing(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.elapsed < INTRO_TIMELINE.impact || this.elapsed >= INTRO_TIMELINE.end) return;
    if (Math.floor(this.elapsed * 4) % 2 === 1) return;
    const s = camera.worldToScreen(this.impact.x, this.impact.y);
    if (s.x >= 0 && s.x <= CANVAS_WIDTH && s.y >= 0 && s.y <= CANVAS_HEIGHT) return;
    const m = 18;
    const x = Math.round(Math.max(m, Math.min(CANVAS_WIDTH - m, s.x)) / ART);
    const y = Math.round(Math.max(m, Math.min(CANVAS_HEIGHT - m, s.y)) / ART);
    const p = new PixelPainter(ctx, ART);
    for (const [dy, half] of [[-3, 0], [-2, 1], [-1, 2], [0, 3], [1, 2], [2, 1], [3, 0]] as const) {
      p.hline(x - half - 1, y + dy, half * 2 + 3, PAL.crystal.outline);
    }
    for (const [dy, half] of [[-2, 0], [-1, 1], [0, 2], [1, 1], [2, 0]] as const) {
      p.hline(x - half, y + dy, half * 2 + 1, PAL.crystal.shield);
    }
    p.px(x, y, PAL.crystal.shell[4]);
  }

  /**
   * The title card: two lines of the pixel font at 10× on a dark plate with
   * chartreuse and magenta rules; each glyph gets a magenta drop, a dark
   * outline and a stepped chartreuse fill so it pops over day or night.
   */
  private drawTitle(ctx: CanvasRenderingContext2D, alpha: number): void {
    const S = TITLE_SCALE;
    const lineH = GLYPH_H * S;
    const blockH = INTRO_TITLE_LINES.length * lineH + (INTRO_TITLE_LINES.length - 1) * TITLE_LINE_GAP;
    const plateY = TITLE_TOP - 28;
    const plateH = blockH + 56;

    ctx.globalAlpha = alpha * 0.78;
    ctx.fillStyle = PAL.swarm.outline;
    ctx.fillRect(0, plateY, CANVAS_WIDTH, plateH);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = PAL.swarm.vein[1];
    ctx.fillRect(0, plateY, CANVAS_WIDTH, 4);
    ctx.fillRect(0, plateY + plateH - 4, CANVAS_WIDTH, 4);
    ctx.fillStyle = PAL.swarm.flesh[3];
    ctx.fillRect(0, plateY + 8, CANVAS_WIDTH, 2);
    ctx.fillRect(0, plateY + plateH - 10, CANVAS_WIDTH, 2);

    INTRO_TITLE_LINES.forEach((line, i) => {
      const x = Math.round((CANVAS_WIDTH - textWidth(line, S)) / 2);
      const y = TITLE_TOP + i * (lineH + TITLE_LINE_GAP);
      drawPixelText(ctx, line, x + 8, y + 8, S, PAL.swarm.flesh[2]);
      for (const [ox, oy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-4, -4], [4, -4], [-4, 4], [4, 4]]) {
        drawPixelText(ctx, line, x + ox, y + oy, S, PAL.swarm.outline);
      }
      drawPixelText(ctx, line, x, y, S, titleRowColor);
    });
  }

  /** Pre-render the crater once: debris skirt, rim, bowl, meteorite core, and three crack layers. */
  private ensureCraterArt(): void {
    if (this.craterBase) return;
    const w = CR_CX * 2 * ART;
    const h = CR_CY * 2 * ART;
    const base = new OffscreenCanvas(w, h);
    const p = new PixelPainter(base.getContext('2d')!, ART);
    const { x: sx, y: sy } = this.seed;

    // Scorched ground: a dithered dark skirt, then debris thrown past it
    p.shadow(CR_CX, CR_CY, CR_RX + 6, CR_RY + 5, PAL.crater[0]);
    for (let i = 0; i < 170; i++) {
      const th = hash2(sx * 31 + i, sy) * Math.PI * 2;
      const r = 1.02 + hash2(i, sx + sy * 17) ** 2 * 0.45;
      const color = i % 3 === 0 ? PAL.stone[1] : i % 3 === 1 ? PAL.soil[0] : PAL.crater[1];
      p.px(CR_CX + Math.round(Math.cos(th) * CR_RX * r), CR_CY + Math.round(Math.sin(th) * CR_RY * r), color);
    }
    // Raised rim, lit on its upper-left slope, with a dark outer edge
    p.ellipse(CR_CX, CR_CY, CR_RX + 1, CR_RY + 1, PAL.outline);
    p.ellipse(CR_CX, CR_CY, CR_RX, CR_RY, PAL.crater[1]);
    for (let i = 0; i < 40; i++) {
      const th = Math.PI * (1.05 + (i / 40) * 0.55); // upper-left arc
      p.px(CR_CX + Math.round(Math.cos(th) * (CR_RX - 1)), CR_CY + Math.round(Math.sin(th) * (CR_RY - 1)), PAL.stone[1]);
    }
    // Bowl, its far (upper-left) wall in dithered shade
    p.ellipse(CR_CX, CR_CY + 1, CR_RX - 3, CR_RY - 3, PAL.crater[0]);
    p.shadow(CR_CX - 3, CR_CY - 3, CR_RX - 8, CR_RY - 9, PAL.black);
    // The meteorite: a dark faceted crystal lump, lit facets up-left
    p.disc(CR_CX, CR_CY + 1, 5, PAL.crystal.outline);
    p.disc(CR_CX, CR_CY + 1, 4, PAL.crystal.shell[0]);
    p.rect(CR_CX - 3, CR_CY - 2, 3, 3, PAL.crystal.shell[1]);
    p.rect(CR_CX + 1, CR_CY - 1, 2, 3, PAL.crystal.shell[1]);
    p.line(CR_CX - 3, CR_CY - 2, CR_CX - 1, CR_CY - 2, PAL.crystal.shell[3]);
    p.px(CR_CX - 2, CR_CY - 1, PAL.crystal.shell[2]);
    p.px(CR_CX + 1, CR_CY - 1, PAL.crystal.shell[3]);
    p.px(CR_CX - 3, CR_CY - 2, PAL.crystal.shell[4]);
    this.craterBase = base;

    // Cracks: jagged radial lines, some running out past the rim
    const segments: Array<[number, number, number, number]> = [];
    const count = 7;
    for (let k = 0; k < count; k++) {
      // Jagged but radial: each joint jitters around the crack's own heading
      const heading = (k / count) * Math.PI * 2 + (hash2(sx * 7 + k, sy) - 0.5) * 0.6;
      const reach = 0.55 + hash2(sx + k * 13, sy * 3 + k) * 0.6;
      let px = Math.round(Math.cos(heading) * 5);
      let py = Math.round(Math.sin(heading) * 4);
      const steps = 5;
      for (let s = 1; s <= steps; s++) {
        const t = 0.2 + (reach - 0.2) * (s / steps);
        const a = heading + (hash2(k * 31 + s, sx * 3 + sy) - 0.5) * 0.45;
        const nx = Math.round(Math.cos(a) * t * CR_RX);
        const ny = Math.round(Math.sin(a) * t * CR_RY);
        segments.push([px, py, nx, ny]);
        // A short fork off the middle joints of every other crack
        if (s === 3 && k % 2 === 0) {
          const fa = a + (hash2(k, sx + 5) > 0.5 ? 0.6 : -0.6);
          segments.push([nx, ny, Math.round(nx + Math.cos(fa) * 6), Math.round(ny + Math.sin(fa) * 4)]);
        }
        px = nx;
        py = ny;
      }
    }
    this.crackLayers = CRACK_COLORS.map((color) => {
      const layer = new OffscreenCanvas(w, h);
      const lp = new PixelPainter(layer.getContext('2d')!, ART);
      for (const [x0, y0, x1, y1] of segments) lp.line(CR_CX + x0, CR_CY + y0, CR_CX + x1, CR_CY + y1, color);
      return layer;
    });
    this.crystalHalo = makeHalo(PAL.crystal.shield, 10);
    this.buildShardArt();
  }

  /**
   * One shard: a 2-px faceted column (lit left, shaded right) narrowing to a
   * 1-px white tip, outlined dark, seated in the ground. Its tip also goes on
   * the glint layer for the night glow.
   */
  private paintShard(p: PixelPainter, g: PixelPainter, bx: number, by: number, height: number, lean: number): void {
    const body: Array<[number, number]> = [];
    for (let k = 0; k < height; k++) body.push([bx + (k >= height / 2 ? lean : 0), by - k]);
    const [tx, ty] = body[body.length - 1];
    p.hline(bx - 1, by + 1, 4, PAL.crystal.outline);
    for (const [x, y] of body) p.hline(x - 1, y, 4, PAL.crystal.outline);
    p.hline(tx - 1 + (lean > 0 ? 1 : 0), ty - 1, 3, PAL.crystal.outline);
    p.px(tx + (lean > 0 ? 1 : 0), ty - 2, PAL.crystal.outline);
    for (const [x, y] of body) {
      p.px(x, y, PAL.crystal.shell[3]); // lit facet
      p.px(x + 1, y, PAL.crystal.shell[1]); // shaded facet
    }
    p.px(bx + 1, by, PAL.crystal.shell[0]);
    const tipX = tx + (lean > 0 ? 1 : 0);
    p.px(tipX, ty - 1, PAL.crystal.shell[4]); // pointed tip
    p.px(tx, ty, PAL.crystal.shell[3]);
    g.px(tipX, ty - 1, PAL.crystal.shell[4]);
    g.px(tx, ty, PAL.crystal.shell[2]);
  }

  /**
   * Crystal shards poking out of the ground: faceted columns (lit left facet,
   * shaded right facet, white tip) with a dark outline, plus a tips-only
   * layer the night glow replays additively.
   */
  private buildShardArt(): void {
    if (this.shards.length === 0) return;
    const TILE_ART = TILE_SIZE / ART;
    let reach = 0;
    for (const s of this.shards) reach = Math.max(reach, Math.abs(s.tileX - this.seed.x), Math.abs(s.tileY - this.seed.y));
    this.shardReach = reach;
    const size = (reach * 2 + 1) * TILE_SIZE;
    this.shardLayer = new OffscreenCanvas(size, size);
    this.shardGlints = new OffscreenCanvas(size, size);
    const p = new PixelPainter(this.shardLayer.getContext('2d')!, ART);
    const g = new PixelPainter(this.shardGlints.getContext('2d')!, ART);
    for (const s of this.shards) {
      const bx = (s.tileX - this.seed.x + reach) * TILE_ART + s.ax;
      const by = (s.tileY - this.seed.y + reach) * TILE_ART + s.ay;
      // A smaller upright twin beside the main shard, drawn first (behind)
      if (s.twin) this.paintShard(p, g, bx + (s.lean > 0 ? -2 : 2), by, Math.max(2, Math.floor(s.height * 0.6)), 0);
      this.paintShard(p, g, bx, by, s.height, s.lean);
    }
  }
}
