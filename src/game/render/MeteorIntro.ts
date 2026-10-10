import type { Camera } from '../../engine/camera/Camera';
import { PAL, hash2 } from '../../engine/renderer/pixelart/palette';
import { PixelPainter } from '../../engine/renderer/pixelart/PixelPainter';
import { drawPixelText, textWidth, GLYPH_H } from '../../engine/renderer/pixelart/PixelFont';
import { CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE } from '../../shared/constants';
import type { TilePos } from '../run/craterSite';
import type { CrystalShard } from '../../engine/renderer/alienDecor';
import {
  buildDroneFrames,
  buildShardFrames,
  buildSpire,
  DRONE_CORE_OFFSET,
  DRONE_FRAME_SIZE,
  SHARD_CENTER_OFFSET,
  type ShardArt,
  type SpireArt,
} from './crystalDeployArt';
import {
  INTRO_TIMELINE,
  DRONE_COUNT,
  EJECTA_COUNT,
  IntroClock,
  INTRO_TITLE_LINES,
  SPIRE_COUNT,
  SPORE_COUNT,
  canSkipIntro,
  crackPulseStep,
  crystalPulseProgress,
  droneState,
  droneTrail,
  ejectaChunk,
  flashAlpha,
  impactGlowAlpha,
  letterboxAmount,
  meteorAltitude,
  meteorGround,
  meteorProgress,
  SHARD_COUNT,
  shakeOffset,
  shardOffset,
  shockwaveProgress,
  spireGrowth,
  sporeMote,
  titleAlpha,
  type DroneState,
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
const NO_SHAKE: Vec2 = { x: 0, y: 0 };
/** Glow of a drone's core per frame (dormant, waking, lit, bright), drawn additively */
const DRONE_GLOW = [0, 0.25, 0.45, 0.6] as const;
/** World px of lift above which a drone's shadow shrinks */
const DRONE_SHADOW_HIGH = 10;
const SPARKS = 56;
/** Seconds of flight history the trail is drawn from */
const TRAIL_SECONDS = 0.32;
const TRAIL_STEP = 0.004;
/** Letterbox bar height as a share of the visible view */
const LETTERBOX_SHARE = 0.11;
/** Title font pixel = 10 screen px: two lines, each nearly the screen's width */
const TITLE_SCALE = 10;
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

/** A spire's place on the crater rim: base offset from the impact (world px) and its art. */
interface PlacedSpire {
  dx: number;
  dy: number;
  art: SpireArt;
}

/**
 * The run's opening, drawn. Timing lives in introTimeline.ts and the camera
 * work in IntroDirector; this class keeps the clock, the flash frame count
 * and the pre-rendered crater, spire and drone art.
 *
 * Draw order (wired by RenderSystem): crater and spires with the terrain
 * (under the fog), then after the fog the meteor, ejecta, shockwave, cyan
 * pulse, drones and spores, then in screen space after the sky tint the
 * flash, letterbox bars, edge ping and title card. Crater and spires
 * outlive the intro.
 */
export class MeteorIntro {
  private readonly clock = new IntroClock();
  /** Rendered frames since the impact; -1 until it lands */
  private framesSinceImpact = -1;
  private readonly impact: Vec2;
  private readonly nest: Vec2;
  private readonly seed: TilePos;
  private craterBase: OffscreenCanvas | null = null;
  private crackLayers: OffscreenCanvas[] = [];
  private meteorHalo: OffscreenCanvas | null = null;
  private meteorCore: OffscreenCanvas | null = null;
  private groundGlows: OffscreenCanvas[] = [];
  private crystalHalo: OffscreenCanvas | null = null;
  private droneHalo: OffscreenCanvas | null = null;
  private droneFrames: OffscreenCanvas[] = [];
  private shardFrames: ShardArt[] = [];
  private spires: PlacedSpire[] = [];
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

  private get t(): number {
    return this.clock.elapsed;
  }

  /** Real frame time (0 while paused); the clock adds the slow motion. The flash counts frames. */
  advance(dt: number): void {
    if (this.framesSinceImpact >= 0 && this.framesSinceImpact < 2) this.framesSinceImpact++;
    const before = this.t;
    this.clock.advance(dt);
    if (before < INTRO_TIMELINE.impact && this.t >= INTRO_TIMELINE.impact) this.framesSinceImpact = 0;
  }

  /** Jump to the end state (crater and spires kept). Returns false while skipping is not allowed yet. */
  skip(): boolean {
    if (!canSkipIntro(this.t)) return false;
    this.clock.skip();
    this.framesSinceImpact = 2;
    return true;
  }

  isPlaying(): boolean {
    return this.clock.isPlaying();
  }

  hasCrater(): boolean {
    return this.t >= INTRO_TIMELINE.impact;
  }

  getShake(): Vec2 {
    return this.isPlaying() ? shakeOffset(this.t) : NO_SHAKE;
  }

  /** World space, right after the terrain: the decal with its pulsing cracks and the Hive's spires. */
  drawCrater(ctx: CanvasRenderingContext2D, time: number): void {
    if (!this.hasCrater()) return;
    this.ensureCraterArt();
    const x = Math.round(this.impact.x) - CR_CX * ART;
    const y = Math.round(this.impact.y) - CR_CY * ART;
    ctx.drawImage(this.craterBase!, x, y);
    // The cracks flare white-hot cyan while the pulse rings out
    const step = crystalPulseProgress(this.t) !== null ? 2 : crackPulseStep(time);
    ctx.drawImage(this.crackLayers[step], x, y);
    if (this.shardLayer) ctx.drawImage(this.shardLayer, this.shardOrigin().x, this.shardOrigin().y);
    this.spires.forEach((s, i) => this.drawSpire(ctx, s, spireGrowth(i, this.t), s.art.body));
  }

  /** The top `growth` of a spire, seated on its base: it pushes up out of the ground tip first. */
  private drawSpire(ctx: CanvasRenderingContext2D, s: PlacedSpire, growth: number, layer: OffscreenCanvas): void {
    if (growth <= 0) return;
    const shown = Math.max(ART, even(layer.height * growth));
    const bx = Math.round(this.impact.x + s.dx) - s.art.baseX;
    const by = Math.round(this.impact.y + s.dy);
    ctx.drawImage(layer, 0, 0, layer.width, shown, bx, by - shown + s.art.baseBelow, layer.width, shown);
  }

  /** World px of the shard layer's top-left corner (it is centered on the impact tile). */
  private shardOrigin(): Vec2 {
    return {
      x: (this.seed.x - this.shardReach) * TILE_SIZE,
      y: (this.seed.y - this.shardReach) * TILE_SIZE,
    };
  }

  /** World space, post-tint, additive: the cracks and spire tips shine through the night. */
  drawCrackGlow(ctx: CanvasRenderingContext2D, time: number): void {
    if (!this.hasCrater() || !this.crystalHalo) return;
    const x = Math.round(this.impact.x) - CR_CX * ART;
    const y = Math.round(this.impact.y) - CR_CY * ART;
    ctx.drawImage(this.crackLayers[crackPulseStep(time)], x, y);
    if (this.shardGlints) ctx.drawImage(this.shardGlints, this.shardOrigin().x, this.shardOrigin().y);
    this.spires.forEach((s, i) => this.drawSpire(ctx, s, spireGrowth(i, this.t), s.art.glint));
    const h = this.crystalHalo.width / 2;
    ctx.drawImage(this.crystalHalo, Math.round(this.impact.x - h), Math.round(this.impact.y - h));
  }

  /** World space, after the fog: everything that moves. */
  drawWorldFx(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (!this.isPlaying()) return;
    const view = camera.getViewRectTiles();
    const bounds = {
      minX: view.x * TILE_SIZE - 64,
      minY: view.y * TILE_SIZE - 64,
      maxX: (view.x + view.w) * TILE_SIZE + 64,
      maxY: (view.y + view.h) * TILE_SIZE + 64,
    };
    const inView = (x: number, y: number) => x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;

    if (meteorProgress(this.t) !== null) {
      // Start the fireball well above the top of the view, so it streaks in from the sky
      this.drawMeteor(ctx, view.h * TILE_SIZE * 0.55);
    }
    this.drawEjecta(ctx);
    this.drawShockwave(ctx, inView);
    this.drawDeployment(ctx, inView);
    this.drawSpores(ctx, inView);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Where the fireball is at intro time `t`: its ground point lifted by its altitude. */
  private headAt(t: number, alt0: number): Vec2 {
    const T = INTRO_TIMELINE;
    const clamped = Math.max(T.meteorStart, Math.min(T.impact - 1e-6, t));
    const g = meteorGround(clamped, this.nest, this.impact)!;
    return { x: g.x, y: g.y - meteorAltitude(clamped, alt0) };
  }

  private drawMeteor(ctx: CanvasRenderingContext2D, alt0: number): void {
    const T = INTRO_TIMELINE;
    const t = this.t;
    const p = meteorProgress(t) ?? 0;
    const ground = meteorGround(t, this.nest, this.impact)!;
    const alt = meteorAltitude(t, alt0);
    const near = 1 - alt / alt0; // 0 high in the sky → 1 at the ground
    const head = this.headAt(t, alt0);

    // The ground it is about to hit: a widening orange light pool and a shadow that sharpens
    if (this.groundGlows.length === 0) this.groundGlows = [16, 26, 38].map((r) => makeHalo(PAL.meteor[1], r));
    const glow = this.groundGlows[Math.min(2, Math.floor(near * 3))];
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.5 * near;
    ctx.drawImage(glow, even(ground.x - glow.width / 2), even(ground.y - glow.height / 2));
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.25 + 0.4 * near;
    const shadow = new PixelPainter(ctx, ART);
    const sr = Math.round(5 + 9 * (1 - near));
    shadow.shadow(Math.round(ground.x / ART), Math.round(ground.y / ART), sr, Math.round(sr * 0.5), PAL.outline);
    ctx.globalAlpha = 1;

    // Sparks shed along the flight, thrown sideways and falling
    for (let j = 0; j < SPARKS; j++) {
      const born = T.meteorStart + (j / SPARKS) * (T.impact - T.meteorStart);
      const age = t - born;
      if (age < 0 || age >= 0.6) continue;
      const base = this.headAt(born, alt0);
      const side = (hash2(j, 61) - 0.5) * 260;
      const x = base.x + side * age;
      const y = base.y + (hash2(j, 67) - 0.5) * 120 * age + 360 * age * age;
      ctx.fillStyle = age < 0.15 ? PAL.meteor[0] : age < 0.35 ? PAL.meteor[1] : PAL.meteor[2];
      const s = age < 0.12 ? 8 : age < 0.3 ? 6 : 4;
      ctx.fillRect(even(x) - s / 2, even(y) - s / 2, s, s);
    }

    // Trail: the fireball's own recent path. An additive glow band that widens
    // toward the tail, over a hot core that tapers white → orange → dark red
    const flicker = Math.floor(t * 30);
    const steps = Math.floor(TRAIL_SECONDS / TRAIL_STEP);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = steps; k >= 0; k--) {
      const f = k / steps;
      const q = this.headAt(t - k * TRAIL_STEP, alt0);
      const w = even(18 + 46 * f);
      const wob = (hash2(k, flicker) - 0.5) * 12 * f;
      ctx.globalAlpha = f < 0.33 ? 0.4 : f < 0.66 ? 0.24 : 0.12;
      ctx.fillStyle = f < 0.4 ? PAL.meteor[1] : PAL.meteor[2];
      ctx.fillRect(even(q.x + wob - w / 2), even(q.y - wob - w / 2), w, w);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let k = Math.floor(steps * 0.75); k >= 0; k--) {
      const f = k / (steps * 0.75);
      const q = this.headAt(t - k * TRAIL_STEP, alt0);
      const size = even(24 * (1 - f)) + 2;
      const wob = (hash2(k, flicker + 7) - 0.5) * 8 * f;
      ctx.globalAlpha = f > 0.7 ? 0.6 : 1;
      ctx.fillStyle = f < 0.15 ? PAL.white : f < 0.35 ? PAL.meteor[0] : f < 0.65 ? PAL.meteor[1] : PAL.meteor[2];
      ctx.fillRect(even(q.x + wob - size / 2), even(q.y - wob - size / 2), size, size);
    }
    ctx.globalAlpha = 1;

    // Head: two additive halos, then a pixel fireball — dark-red rim to a white-hot core.
    // It swells a little as it comes down.
    if (!this.meteorHalo) this.meteorHalo = makeHalo(PAL.meteor[1], 34);
    if (!this.meteorCore) this.meteorCore = makeHalo(PAL.meteor[0], 15);
    ctx.globalCompositeOperation = 'lighter';
    for (const halo of [this.meteorHalo, this.meteorCore]) {
      const h = halo.width / 2;
      ctx.drawImage(halo, even(head.x - h), even(head.y - h));
    }
    ctx.globalCompositeOperation = 'source-over';
    const hp = new PixelPainter(ctx, ART);
    const hx = Math.round(head.x / ART);
    const hy = Math.round(head.y / ART);
    const r = 9 + Math.round(3 * p);
    hp.disc(hx, hy, r, PAL.meteor[2]);
    hp.disc(hx, hy, r - 2, PAL.meteor[1]);
    hp.disc(hx, hy, r - 4, PAL.meteor[0]);
    hp.disc(hx - 1, hy - 1, r - 7, PAL.white);
  }

  /** Rock thrown out of the crater: hot chunks that cool as they arc, with a ground shadow. */
  private drawEjecta(ctx: CanvasRenderingContext2D): void {
    const p = new PixelPainter(ctx, ART);
    for (let i = 0; i < EJECTA_COUNT; i++) {
      const c = ejectaChunk(i, this.t, this.impact);
      if (!c) continue;
      const gx = Math.round(c.x / ART);
      const gy = Math.round(c.y / ART);
      if (c.alt > 6) {
        ctx.globalAlpha = 0.45;
        p.px(gx, gy, PAL.outline);
        ctx.globalAlpha = 1;
      }
      const s = 1 + Math.floor(hash2(i, 59) * 2);
      const color = c.age < 0.25 ? PAL.meteor[0] : c.age < 0.5 ? PAL.meteor[1] : i % 2 ? PAL.stone[2] : PAL.crater[1];
      p.rect(gx, Math.round((c.y - c.alt) / ART), s, s, color);
    }
  }

  /** Dust ring from the impact: ease-out growth sweeping past the colony. */
  private drawShockwave(ctx: CanvasRenderingContext2D, inView: (x: number, y: number) => boolean): void {
    const wave = shockwaveProgress(this.t);
    if (wave === null) return;
    const reach = Math.hypot(this.nest.x - this.impact.x, this.nest.y - this.impact.y) + 900;
    const r = reach * (1 - (1 - wave) ** 2);
    const a = wave < 0.25 ? 1 : wave < 0.5 ? 0.8 : wave < 0.75 ? 0.55 : 0.3;
    this.drawRing(ctx, inView, r, a, [
      // offset behind the front, color, square size, alpha factor
      [0, PAL.meteor[0], 8, 1],
      [8, PAL.sand[2], 6, 0.85],
      [18, PAL.sand[1], 6, 0.7],
      [30, PAL.sand[0], 4, 0.55],
      [46, PAL.soil[2], 4, 0.4],
    ]);
  }

  /** A ring of pixel squares around the impact; bands 30+ px behind the front are dithered. */
  private drawRing(
    ctx: CanvasRenderingContext2D,
    inView: (x: number, y: number) => boolean,
    r: number,
    alpha: number,
    bands: ReadonlyArray<readonly [number, string, number, number]>,
  ): void {
    for (const [behind, color, size, k] of bands) {
      const rr = r - behind;
      if (rr <= 0) continue;
      const n = Math.ceil((Math.PI * 2 * rr) / 5);
      ctx.globalAlpha = alpha * k;
      ctx.fillStyle = color;
      for (let i = 0; i < n; i++) {
        if (behind >= 30 && i % 2 === 1) continue;
        const th = (i / n) * Math.PI * 2;
        const x = this.impact.x + Math.cos(th) * rr;
        const y = this.impact.y + Math.sin(th) * rr;
        if (!inView(x, y)) continue;
        ctx.fillRect(even(x) - size / 2, even(y) - size / 2, size, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The Crystal Hive wakes: rubble at the growing spires, the cyan pulse, the crater glow and the drones. */
  private drawDeployment(ctx: CanvasRenderingContext2D, inView: (x: number, y: number) => boolean): void {
    const T = INTRO_TIMELINE;
    const t = this.t;
    if (t < T.spireStart || !inView(this.impact.x, this.impact.y)) return;
    this.ensureCraterArt();
    const p = new PixelPainter(ctx, ART);

    // Rubble chips hop off each spire while it pushes up
    this.spires.forEach((s, i) => {
      const g = spireGrowth(i, t);
      if (g <= 0 || g >= 1) return;
      const bx = (this.impact.x + s.dx) / ART;
      const by = (this.impact.y + s.dy) / ART;
      for (let k = 0; k < 7; k++) {
        const hop = Math.sin(Math.PI * ((g * 3 + hash2(i, k)) % 1)) * 5;
        const ox = (hash2(k, i + 3) - 0.5) * s.art.width * 2.4;
        p.px(Math.round(bx + ox), Math.round(by - hop), k % 2 ? PAL.stone[2] : PAL.crater[1]);
      }
    });

    // The crater glows from inside once the Hive stirs
    ctx.globalCompositeOperation = 'lighter';
    const cx = Math.round(this.impact.x) - CR_CX * ART;
    const cy = Math.round(this.impact.y) - CR_CY * ART;
    const pulse = crystalPulseProgress(t);
    ctx.globalAlpha = pulse !== null ? 1 : 0.55;
    ctx.drawImage(this.crackLayers[2], cx, cy);
    const h = this.crystalHalo!.width / 2;
    ctx.drawImage(this.crystalHalo!, Math.round(this.impact.x - h), Math.round(this.impact.y - h));

    if (pulse !== null) {
      const r = 560 * (1 - (1 - pulse) ** 2);
      const a = pulse < 0.25 ? 1 : pulse < 0.5 ? 0.75 : pulse < 0.75 ? 0.5 : 0.25;
      this.drawRing(ctx, inView, r, a, [
        [0, PAL.crystal.shell[4], 6, 1],
        [6, PAL.crystal.shield, 6, 0.9],
        [16, PAL.crystal.shell[2], 4, 0.6],
        [30, PAL.crystal.shell[1], 4, 0.45],
      ]);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Drones, back to front
    const drones: Array<[number, DroneState]> = [];
    for (let i = 0; i < DRONE_COUNT; i++) {
      const d = droneState(i, t, this.impact, this.nest);
      if (d) drones.push([i, d]);
    }
    drones.sort((a, b) => a[1].y - b[1].y);
    for (const [i, d] of drones) this.drawDrone(ctx, p, i, d);
  }

  /** World px of drone state `d`'s core art pixel: its frame stands on the ground point, `lift` above it. */
  private droneCore(d: { x: number; y: number; lift: number }): Vec2 {
    return { x: even(d.x), y: even(d.y) - d.lift - DRONE_FRAME_SIZE + DRONE_CORE_OFFSET.y };
  }

  /**
   * One hovering drone: a soft shadow on the ground, its faint light trail,
   * the shards on the far half of their orbit, the core's glow, the crystal,
   * the near shards, and the hex shield flash as it opens. While it is still
   * pushing up out of the crater floor, everything below the ground line is
   * cut off.
   */
  private drawDrone(ctx: CanvasRenderingContext2D, p: PixelPainter, i: number, d: DroneState): void {
    const gx = even(d.x);
    const gy = even(d.y);
    const sink = even((1 - d.emerge) * DRONE_FRAME_SIZE);
    const core = this.droneCore(d);
    core.y += sink;

    if (sink === 0) {
      // The core lights a pool on the ground; a soft shadow sits in it, smaller the higher it floats
      const high = d.lift > DRONE_SHADOW_HIGH;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.2;
      p.ellipse(gx / ART, gy / ART, 6, 2, PAL.crystal.shield);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = high ? 0.45 : 0.6;
      p.shadow(gx / ART, gy / ART, high ? 3 : 4, 1, PAL.crystal.outline);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const q of droneTrail(i, this.t, this.impact, this.nest)) {
      const c = this.droneCore(q);
      const young = q.age < 0.34;
      const size = young ? 6 : q.age < 0.67 ? 4 : 2;
      ctx.globalAlpha = young ? 0.55 : q.age < 0.67 ? 0.35 : 0.2;
      ctx.fillStyle = young ? PAL.crystal.shield : PAL.crystal.shell[3];
      ctx.fillRect(c.x + 1 - size / 2, c.y + 1 - size / 2, size, size);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    if (sink > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(gx - DRONE_FRAME_SIZE, gy - DRONE_FRAME_SIZE * 2, DRONE_FRAME_SIZE * 2, DRONE_FRAME_SIZE * 2);
      ctx.clip();
    }
    const shards = Array.from({ length: SHARD_COUNT }, (_, k) => shardOffset(k, d.spread, d.orbit));
    const drawShards = (behind: boolean) => {
      shards.forEach((o, k) => {
        if (o.behind !== behind) return;
        const art = this.shardFrames[k];
        ctx.drawImage(behind ? art.far : art.near, core.x + o.dx - SHARD_CENTER_OFFSET, core.y + o.dy - SHARD_CENTER_OFFSET);
      });
    };
    drawShards(true);
    if (d.frame > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = DRONE_GLOW[d.frame];
      const dh = this.droneHalo!.width / 2;
      ctx.drawImage(this.droneHalo!, core.x + 1 - dh, core.y + 1 - dh);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.droneFrames[d.frame], core.x - DRONE_CORE_OFFSET.x, core.y - DRONE_CORE_OFFSET.y);
    drawShards(false);
    if (sink > 0) ctx.restore();
    if (d.shieldFlash) this.drawHexShield(ctx, core.x + 1, core.y + 1);
  }

  /** 1-art-px cyan hexagon around a drone: the regenerating shell coming online. */
  private drawHexShield(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const p = new PixelPainter(ctx, ART);
    const cx = Math.round(x / ART);
    const cy = Math.round(y / ART);
    const R = 12;
    ctx.globalAlpha = 0.85;
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2;
      const a1 = ((k + 1) / 6) * Math.PI * 2;
      p.line(
        cx + Math.round(Math.cos(a0) * R), cy + Math.round(Math.sin(a0) * R * 0.8),
        cx + Math.round(Math.cos(a1) * R), cy + Math.round(Math.sin(a1) * R * 0.8),
        PAL.crystal.shield,
      );
    }
    ctx.globalAlpha = 1;
  }

  /** 1-art-px magenta motes with an additive halo, funnelling toward the colony. */
  private drawSpores(ctx: CanvasRenderingContext2D, inView: (x: number, y: number) => boolean): void {
    for (let i = 0; i < SPORE_COUNT; i++) {
      const m = sporeMote(i, this.t, this.nest, this.impact);
      if (!m || !inView(m.x, m.y)) continue;
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
   * layer, which only gets the flash, the bars and the title card.
   */
  drawScreenFx(ctx: CanvasRenderingContext2D, camera: Camera | null): void {
    if (!this.isPlaying()) return;
    const view = camera ? camera.getViewport() : { x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT };
    ctx.save();

    // Full white for two frames, then a warm fireball wash steps out
    const flash = flashAlpha(this.framesSinceImpact);
    const glow = impactGlowAlpha(this.t);
    if (flash > 0 || glow > 0) {
      ctx.globalAlpha = flash > 0 ? flash : glow;
      ctx.fillStyle = flash > 0 ? PAL.white : PAL.meteor[1];
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    // A cold cyan blink as the Hive's pulse goes off
    const pulse = crystalPulseProgress(this.t);
    if (pulse !== null && pulse < 0.12) {
      ctx.globalAlpha = pulse < 0.05 ? 0.3 : 0.15;
      ctx.fillStyle = PAL.crystal.shield;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    ctx.globalAlpha = 1;

    // Cinema bars, sliding in from the edges of the visible view
    const bar = even(view.h * LETTERBOX_SHARE * letterboxAmount(this.t));
    if (bar > 0) {
      ctx.fillStyle = PAL.black;
      ctx.fillRect(0, view.y, CANVAS_WIDTH, bar);
      ctx.fillRect(0, view.y + view.h - bar, CANVAS_WIDTH, bar);
    }

    if (camera) this.drawEdgePing(ctx, camera);
    const title = titleAlpha(this.t);
    if (title > 0) this.drawTitle(ctx, title, view.y + view.h / 2);
    ctx.restore();
  }

  /** A blinking crystal diamond on the view edge, pointing at an off-screen crater. */
  private drawEdgePing(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.t < INTRO_TIMELINE.impact) return;
    if (Math.floor(this.t * 4) % 2 === 1) return;
    const v = camera.getViewport();
    const s = camera.worldToScreen(this.impact.x, this.impact.y);
    if (s.x >= v.x && s.x <= v.x + v.w && s.y >= v.y && s.y <= v.y + v.h) return;
    const m = 18;
    const bar = even(v.h * LETTERBOX_SHARE * letterboxAmount(this.t));
    const x = Math.round(Math.max(v.x + m, Math.min(v.x + v.w - m, s.x)) / ART);
    const y = Math.round(Math.max(v.y + bar + m, Math.min(v.y + v.h - bar - m, s.y)) / ART);
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
   * chartreuse and magenta rules, centered on `centerY`; each glyph gets a
   * magenta drop, a dark outline and a stepped chartreuse fill so it pops
   * over day or night.
   */
  private drawTitle(ctx: CanvasRenderingContext2D, alpha: number, centerY: number): void {
    const S = TITLE_SCALE;
    const lineH = GLYPH_H * S;
    const blockH = INTRO_TITLE_LINES.length * lineH + (INTRO_TITLE_LINES.length - 1) * TITLE_LINE_GAP;
    const top = even(centerY - blockH / 2);
    const plateY = top - 28;
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
      const y = top + i * (lineH + TITLE_LINE_GAP);
      drawPixelText(ctx, line, x + 8, y + 8, S, PAL.swarm.flesh[2]);
      for (const [ox, oy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-4, -4], [4, -4], [-4, 4], [4, 4]]) {
        drawPixelText(ctx, line, x + ox, y + oy, S, PAL.swarm.outline);
      }
      drawPixelText(ctx, line, x, y, S, titleRowColor);
    });
  }

  /** Pre-render the crater once: debris skirt, rim, bowl, meteorite core, crack layers, spires and drones. */
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
    this.crystalHalo = makeHalo(PAL.crystal.shield, 14);
    this.droneHalo = makeHalo(PAL.crystal.shield, 7);
    this.buildShardArt();
    this.buildSpires();
    this.droneFrames = buildDroneFrames();
    this.shardFrames = buildShardFrames();
  }

  /**
   * The Hive's first spires on the crater rim, tallest at the back so the
   * silhouette reads as a crown; drawn back to front.
   */
  private buildSpires(): void {
    const { x: sx, y: sy } = this.seed;
    const placed: PlacedSpire[] = [];
    for (let i = 0; i < SPIRE_COUNT; i++) {
      const a = (i / SPIRE_COUNT) * Math.PI * 2 + (hash2(sx + i * 7, sy) - 0.5) * 0.5 - Math.PI / 2;
      const r = 1 + hash2(i, sx * 3 + sy) * 0.18;
      const back = Math.sin(a) < 0 ? 1 : 0; // upper rim = far side
      const height = 18 + Math.round(hash2(i, sy + 11) * 10) + back * 14;
      const width = back && hash2(i, sx + 29) > 0.4 ? 9 : hash2(i, sx + 29) > 0.5 ? 7 : 5;
      placed.push({
        dx: Math.cos(a) * CR_RX * r * ART,
        dy: Math.sin(a) * CR_RY * r * ART,
        art: buildSpire(width, height, hash2(i, 41) > 0.5 ? 1 : -1),
      });
    }
    // Back to front, so the near spires overlap the far ones
    this.spires = placed.sort((a, b) => a.dy - b.dy);
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

