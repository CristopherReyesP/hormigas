import type { World } from '../../engine/ecs/World';
import type { CanvasRenderer } from '../../engine/renderer/CanvasRenderer';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import type { Camera } from '../../engine/camera/Camera';
import type { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { TerrainRenderer } from '../../engine/renderer/TerrainRenderer';
import { FoliageOverlay } from '../../engine/renderer/FoliageOverlay';
import { PostProcessor, type ScreenLight } from '../../engine/renderer/PostProcessor';
import { SpriteAtlas } from '../../engine/renderer/SpriteAtlas';
import { computeUndergroundLight, UG_LIGHT_RIM, UG_LIGHT_FULL } from './undergroundLight';
import { FogRenderer } from '../../engine/renderer/FogRenderer';
import {
  COMPONENT,
  AntRole,
  AntState,
  FoodType,
  BeetleState,
  CricketState,
  Layer,
  type PositionComponent,
  type RenderComponent,
  type FacingComponent,
  type AntComponent,
  type CarryingComponent,
  type CombatComponent,
  type SelectableComponent,
  type FoodSourceComponent,
  type HealthComponent,
  type BeetleComponent,
  type CricketComponent,
  type LayerComponent,
  type EggComponent,
  type NestComponent,
} from '../components/components';
import { TILE_SIZE, PHEROMONE_MAX, CANVAS_WIDTH, CANVAS_HEIGHT, UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT } from '../../shared/constants';
import { UndergroundTerrainType, ChamberType } from '../../simulation/world/types';
import { AmbientParticleSystem } from '../particles';
import { PAL, hash2 } from '../../engine/renderer/pixelart/palette';
import { PixelPainter } from '../../engine/renderer/pixelart/PixelPainter';

// === Food pile rendering (nest stockpile + underground pantry) ===
// Max dots drawn per pile (perf cap — flat fills only, deterministic positions)
const NEST_PILE_MAX_ITEMS = 30;
// Stored food units represented by one dot at the surface nest (10 food → 1 dot, 360+ → full pile)
const NEST_PILE_UNITS_PER_ITEM = 12;
const STORAGE_PILE_MAX_ITEMS = 40;
// Two palette shades per food type for visual texture (picked deterministically per dot)
const PILE_COLORS: Record<'leaf' | 'mushroom' | 'meat', [string, string]> = {
  leaf: [PAL.leaf[1], PAL.leaf[0]],
  mushroom: [PAL.wood[2], PAL.wood[1]],
  meat: [PAL.meat[1], PAL.meat[0]],
};

// Precomputed unit offsets for segmented "rings" (replaces ctx.arc progress arcs)
const RING_TICKS_16: ReadonlyArray<readonly [number, number]> = Array.from(
  { length: 16 },
  (_, i) => {
    const a = -Math.PI / 2 + (i / 16) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)] as const;
  }
);
const RING_TICKS_8: ReadonlyArray<readonly [number, number]> = Array.from(
  { length: 8 },
  (_, i) => {
    const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)] as const;
  }
);

// Quantized alpha steps used across all FX compositing (pixel art = discrete levels)
const ALPHA_STEPS = [0.75, 0.5, 0.25] as const;

/** Deterministic pseudo-random in [0,1) from an integer seed (same technique as egg speckles). */
function pileRand(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * NOTE: this is deliberately NOT a world System. It is driven by the render
 * loop (GameManager.render -> renderInterpolated), once per animation frame,
 * NOT by world.update. It used to declare `implements System` with a priority,
 * which read as if the world ticked it — it never did, and the orphaned
 * update() method silently froze animationTime, the ambient particles and the
 * water shimmer for the entire life of the project.
 */
export class RenderSystem {
  readonly name = 'RenderSystem';
  private world: World;
  private renderer: CanvasRenderer;
  private grid: TileGrid;
  private terrainRenderer: TerrainRenderer;
  private foliageOverlay: FoliageOverlay;
  private postProcessor: PostProcessor;
  private spriteAtlas: SpriteAtlas;
  private fogRenderer: FogRenderer;
  private visibilityGrid: VisibilityGrid;
  private animationTime: number = 0;
  private camera: Camera | null = null;
  private ambientParticles: AmbientParticleSystem;
  private ugGrid: UndergroundGrid | null = null;
  private ugCamera: Camera | null = null;
  private getActiveLayer: (() => 'surface' | 'underground') | null = null;
  private ugParticles: Array<{x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; type: 'dust' | 'spore' | 'warmth'}> = [];
  private ugParticleTimer = 0;
  private ugTextureCanvas: OffscreenCanvas | null = null;
  private ugTextureReady = false;

  // === Pre-rendered pixel-art FX caches (built once in initFxCaches) ===
  private fxShadowSmall!: OffscreenCanvas;
  private fxShadowMedium!: OffscreenCanvas;
  private fxShadowLarge!: OffscreenCanvas;
  private fxBrackets = new Map<string, OffscreenCanvas>();
  private fxHealthFrame!: OffscreenCanvas;
  private fxPheroStamps!: Record<'home' | 'food' | 'danger', OffscreenCanvas[]>;
  private fxGlows = new Map<string, OffscreenCanvas>();
  /** Darkness dither tiles indexed by light level 1-3 (0 = solid, 4 = clear) */
  private fxDither: OffscreenCanvas[] = [];

  // === Underground light map cache (recomputed only when chambers/tunnels change) ===
  private ugLightLevel = new Uint8Array(UNDERGROUND_WIDTH * UNDERGROUND_HEIGHT);
  private ugLightColor = new Uint8Array(UNDERGROUND_WIDTH * UNDERGROUND_HEIGHT);
  /** Scratch brightness field the levels are quantized from (rebuilt with them) */
  private ugLightBright = new Uint8Array(UNDERGROUND_WIDTH * UNDERGROUND_HEIGHT);
  /** Layout version the cached light map was built from (-1 = never built) */
  private ugLightVersion = -1;

  constructor(
    world: World,
    renderer: CanvasRenderer,
    grid: TileGrid,
    visibilityGrid: VisibilityGrid
  ) {
    this.world = world;
    this.renderer = renderer;
    this.grid = grid;
    this.visibilityGrid = visibilityGrid;
    this.terrainRenderer = new TerrainRenderer(grid);
    this.foliageOverlay = new FoliageOverlay(grid);
    this.postProcessor = new PostProcessor();
    this.spriteAtlas = new SpriteAtlas();
    this.fogRenderer = new FogRenderer(visibilityGrid);
    this.ambientParticles = new AmbientParticleSystem(grid, world);
    this.initFxCaches();
  }

  /** Pre-render every repeated FX element once: dithered shadows (3 sizes),
   *  selection corner brackets (per accent color), the segmented health-bar frame,
   *  pheromone tile stamps (3 types × 3 intensity levels), dithered glow stamps,
   *  and the two darkness dither tiles used by the underground light map. */
  private initFxCaches(): void {
    // --- Dithered drop shadows in 3 sizes (drawImage-stretched to fit) ---
    const makeShadow = (w: number, h: number): OffscreenCanvas => {
      const c = new OffscreenCanvas(w, h);
      const sctx = c.getContext('2d')!;
      sctx.globalAlpha = 0.35; // single quantized shadow level
      const p = new PixelPainter(sctx, 2);
      p.shadow(w / 4, h / 4, w / 4 - 1, h / 4 - 1, PAL.outline);
      return c;
    };
    this.fxShadowSmall = makeShadow(20, 12);
    this.fxShadowMedium = makeShadow(32, 16);
    this.fxShadowLarge = makeShadow(96, 48);

    // --- Selection corner brackets (4 pixel L-shapes, 3 art-px arms) per accent ---
    const bracketColors: Record<string, string> = {
      worker: PAL.worker,
      soldier: PAL.soldier,
      scout: PAL.scout,
      nurse: PAL.nurse,
      amber: PAL.glowAmber,
      white: PAL.white,
    };
    for (const key of Object.keys(bracketColors)) {
      const color = bracketColors[key];
      const c = new OffscreenCanvas(32, 32);
      const p = new PixelPainter(c.getContext('2d')!, 2);
      const N = 16; // art px
      p.hline(0, 0, 3, color); p.vline(0, 0, 3, color);
      p.hline(N - 3, 0, 3, color); p.vline(N - 1, 0, 3, color);
      p.hline(0, N - 1, 3, color); p.vline(0, N - 3, 3, color);
      p.hline(N - 3, N - 1, 3, color); p.vline(N - 1, N - 3, 3, color);
      this.fxBrackets.set(key, c);
    }

    // --- Health bar frame: 1px outline border + dark inner (6 segments of 3×2, 1px gaps) ---
    const hb = new OffscreenCanvas(25, 4);
    const hp = new PixelPainter(hb.getContext('2d')!, 1);
    hp.rect(0, 0, 25, 4, PAL.outline);
    hp.rect(1, 1, 23, 2, PAL.uiBg);
    this.fxHealthFrame = hb;

    // --- Pheromone stamps: dithered diamond blobs, 3 intensity levels per type ---
    const makeStamp = (color: string, level: number): OffscreenCanvas => {
      const c = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
      const sctx = c.getContext('2d')!;
      const p = new PixelPainter(sctx, 2);
      const C = 8; // art-px center of a 16×16 art tile
      const r = level === 0 ? 3 : level === 1 ? 5 : 7;
      sctx.globalAlpha = 0.25;
      for (let iy = -r; iy <= r; iy++) {
        for (let ix = -r; ix <= r; ix++) {
          if (Math.abs(ix) + Math.abs(iy) > r) continue;
          const on = level === 0
            ? (ix & 1) === 0 && (iy & 1) === 0 // sparse: 1 of 4
            : ((ix + iy) & 1) === 0; // checker
          if (on) p.px(C + ix, C + iy, color);
        }
      }
      if (level === 2) {
        // solid core at a second quantized alpha level
        sctx.globalAlpha = 0.5;
        for (let iy = -3; iy <= 3; iy++) {
          for (let ix = -3; ix <= 3; ix++) {
            if (Math.abs(ix) + Math.abs(iy) <= 3) p.px(C + ix, C + iy, color);
          }
        }
      }
      return c;
    };
    this.fxPheroStamps = {
      home: [0, 1, 2].map((l) => makeStamp(PAL.pheroHome, l)),
      food: [0, 1, 2].map((l) => makeStamp(PAL.pheroFood, l)),
      danger: [0, 1, 2].map((l) => makeStamp(PAL.pheroDanger, l)),
    };

    // --- Dithered glow stamps (replace every radial-gradient glow) ---
    const makeGlow = (color: string): OffscreenCanvas => {
      const c = new OffscreenCanvas(64, 64);
      const gctx = c.getContext('2d')!;
      gctx.globalAlpha = 0.25; // single quantized glow level (stack two for a core)
      const p = new PixelPainter(gctx, 2);
      p.shadow(16, 16, 15, 15, color);
      return c;
    };
    this.fxGlows.set('danger', makeGlow(PAL.dangerRed));
    this.fxGlows.set('amber', makeGlow(PAL.glowAmber));
    this.fxGlows.set('yellow', makeGlow(PAL.healthYellow));
    this.fxGlows.set('green', makeGlow(PAL.glowGreen));

    // --- Underground darkness dither tiles, one per light level 1-3 ---
    // Three Bayer-style densities (3/4, 2/4, 1/4 of the pixels darkened) give the
    // falloff enough steps to read as a gradient across a big excavated colony,
    // while staying strictly quantized — no alpha ramps on the tiles themselves.
    const makeDither = (density: 3 | 2 | 1): OffscreenCanvas => {
      const c = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
      const dctx = c.getContext('2d')!;
      dctx.globalAlpha = 0.75; // same quantized level as solid darkness
      const p = new PixelPainter(dctx, 2);
      for (let iy = 0; iy < 16; iy++) {
        for (let ix = 0; ix < 16; ix++) {
          const even = (ix + iy) % 2 === 0;
          const on =
            density === 3 ? even || (ix % 2 === 1 && iy % 2 === 1) // 3 of 4
            : density === 2 ? even                                 // 2 of 4 (checker)
            : ix % 2 === 0 && iy % 2 === 0;                        // 1 of 4
          if (on) p.px(ix, iy, PAL.black);
        }
      }
      return c;
    };
    // Index by light level: 1 = darkest dither … 3 = faintest
    this.fxDither = [];
    this.fxDither[1] = makeDither(3);
    this.fxDither[2] = makeDither(2);
    this.fxDither[3] = makeDither(1);
  }

  /** Stamp a pre-rendered dithered shadow, stretched to the requested radii. */
  private drawShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
    const canvas = rx <= 11 ? this.fxShadowSmall : rx <= 22 ? this.fxShadowMedium : this.fxShadowLarge;
    ctx.drawImage(canvas, Math.round(cx - rx), Math.round(cy - ry), Math.round(rx * 2), Math.round(ry * 2));
  }

  /** Stamp a pre-rendered dithered glow (quantized alpha baked in). */
  private drawGlowStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, key: string): void {
    const c = this.fxGlows.get(key)!;
    const r = Math.round(radius);
    ctx.drawImage(c, Math.round(cx) - r, Math.round(cy) - r, r * 2, r * 2);
  }

  /** Selection feedback: 4 pixel corner brackets blinking on/off at ~3Hz. */
  private drawSelectionBrackets(ctx: CanvasRenderingContext2D, px: number, py: number, half: number, colorKey: string): void {
    if (Math.floor(this.animationTime * 6) % 2 === 1) return; // 2-state blink
    const c = this.fxBrackets.get(colorKey) ?? this.fxBrackets.get('white')!;
    const s = Math.round(half);
    ctx.drawImage(c, Math.round(px) - s, Math.round(py) - s, s * 2, s * 2);
  }

  private static readonly ROLE_BRACKET_KEY: Record<AntRole, string> = {
    [AntRole.Worker]: 'worker',
    [AntRole.Soldier]: 'soldier',
    [AntRole.Scout]: 'scout',
    [AntRole.Nurse]: 'nurse',
    [AntRole.Defender]: 'defender',
  };

  setCamera(camera: Camera): void {
    this.camera = camera;
  }

  setUndergroundContext(grid: UndergroundGrid, camera: Camera, getActiveLayer: () => 'surface' | 'underground'): void {
    this.ugGrid = grid;
    this.ugCamera = camera;
    this.getActiveLayer = getActiveLayer;
  }

  private getFarmStatus: (() => string) | null = null;

  /** Farm tiles pulse while the farm is converting — wired by GameManager */
  setFarmStatusProvider(fn: () => string): void {
    this.getFarmStatus = fn;
  }

  private getDayPhase: (() => { phase: 'day' | 'night'; progress: number }) | null = null;

  /** Surface tint follows the day/night cycle — wired by GameManager */
  setDayPhaseProvider(fn: () => { phase: 'day' | 'night'; progress: number }): void {
    this.getDayPhase = fn;
  }

  /** Pre-render earth texture tiles to offscreen canvas (called once) */
  private initUndergroundTextures(): void {
    // Layout: 4 columns × 8 rows of TILE_SIZE tiles
    // Row 0: earth (4 variants)
    // Row 1: tunnel (4 variants)
    // Row 2: chamber-queen (4 variants)
    // Row 3: chamber-food (4 variants)
    // Row 4: chamber-incubation (4 variants)
    // Row 5: chamber-general (4 variants)
    // Row 6: reinforced (4 variants)
    // Row 7: designated earth (4 variants)
    // Row 8: fungus farm bed (4 variants)
    // Row 9: defense floor (4 variants)
    const cols = 4;
    const rows = 10;
    const T = TILE_SIZE;
    const canvas = new OffscreenCanvas(cols * T, rows * T);
    const ctx = canvas.getContext('2d')!;

    // Pixel-art earth tile: flat palette base + grain px + 2×2 pebbles.
    // No arcs, no strokes, no rgb-mixing — palette ramps only.
    const renderTile = (
      col: number, row: number,
      base: string, grainA: string, grainB: string, speck: string | null
    ) => {
      const p = new PixelPainter(ctx, 2, col * T, row * T);
      p.rect(0, 0, 16, 16, base);
      const seed = col * 7 + row * 131;
      // Grain: ~14 single art pixels in the two ramp neighbors
      for (let i = 0; i < 14; i++) {
        const gx = Math.floor(hash2(seed, i * 3) * 16);
        const gy = Math.floor(hash2(seed, i * 3 + 1) * 16);
        p.px(gx, gy, hash2(seed, i * 3 + 2) < 0.5 ? grainA : grainB);
      }
      // Pebbles: 2-3 2×2 blocks with a top-left catch-light px
      const pebbles = 2 + Math.floor(hash2(seed, 99) * 2);
      for (let i = 0; i < pebbles; i++) {
        const bx = 1 + Math.floor(hash2(seed + 1, i * 5) * 13);
        const by = 1 + Math.floor(hash2(seed + 1, i * 5 + 1) * 13);
        p.rect(bx, by, 2, 2, grainA);
        p.px(bx, by, grainB);
      }
      // Chamber floors get sparse glow specks in their accent color
      if (speck) {
        for (let i = 0; i < 3; i++) {
          const sx = 2 + Math.floor(hash2(seed + 2, i * 7) * 12);
          const sy = 2 + Math.floor(hash2(seed + 2, i * 7 + 1) * 12);
          p.px(sx, sy, speck);
        }
      }
    };

    for (let i = 0; i < 4; i++) {
      renderTile(i, 0, PAL.earth[1], PAL.earth[0], PAL.earth[2], null); // earth
      renderTile(i, 1, PAL.tunnel[1], PAL.tunnel[0], PAL.tunnel[2], null); // tunnel
      renderTile(i, 5, PAL.tunnel[1], PAL.tunnel[0], PAL.tunnel[2], null); // general chamber
      renderTile(i, 6, PAL.earth[0], PAL.black, PAL.stone[0], null); // reinforced
      renderTile(i, 7, PAL.earth[2], PAL.earth[1], PAL.earth[3], null); // designated earth
    }

    // ── Chamber floors as MATERIAL SPRITES — you see leaves, you know it's the
    // larder; you see straw, it's the nursery. The material IS the label. ──

    // Full leaf sprite: oval blade with a darker center vein and a stem
    const paintLeaf = (p: PixelPainter, x: number, y: number, vertical: boolean, shade: number) => {
      const body = shade === 0 ? PAL.leaf[0] : PAL.leaf[1];
      const lit = shade === 0 ? PAL.leaf[1] : PAL.leaf[2];
      if (vertical) {
        p.rect(x + 1, y, 1, 5, lit);
        p.rect(x, y + 1, 3, 3, body);
        p.vline(x + 1, y + 1, 3, PAL.grass[0]); // vein
        p.px(x + 1, y + 5, PAL.wood[1]); // stem
      } else {
        p.rect(x, y + 1, 5, 1, lit);
        p.rect(x + 1, y, 3, 3, body);
        p.hline(x + 1, y + 1, 3, PAL.grass[0]); // vein
        p.px(x + 5, y + 1, PAL.wood[1]); // stem
      }
    };

    // Row 3 FOOD STORAGE: a carpet of stored LEAVES over packed earth.
    // Stratified placement (2×3 cells + jitter) — even coverage, shapes intact
    for (let i = 0; i < 4; i++) {
      const p = new PixelPainter(ctx, 2, i * T, 3 * T);
      const seed = i * 7 + 3 * 131;
      p.rect(0, 0, 16, 16, PAL.tunnel[1]);
      for (let k = 0; k < 6; k++) {
        const cellX = (k % 2) * 7;
        const cellY = Math.floor(k / 2) * 5;
        const lx = cellX + Math.floor(hash2(seed, k * 5) * 5);
        const ly = cellY + Math.floor(hash2(seed, k * 5 + 1) * 2);
        paintLeaf(p, lx, ly, hash2(seed, k * 5 + 2) < 0.5, k % 2);
      }
    }

    // Row 4 INCUBATION: STRAW bedding — golden strands crisscrossed in layers,
    // stratified rows so the whole tile reads as a nest lining
    for (let i = 0; i < 4; i++) {
      const p = new PixelPainter(ctx, 2, i * T, 4 * T);
      const seed = i * 7 + 4 * 131;
      p.rect(0, 0, 16, 16, PAL.tunnel[0]);
      // Bottom layer: darker straw, one strand per 2px band, alternating halves
      for (let k = 0; k < 8; k++) {
        const sx = (k % 2) * 6 + Math.floor(hash2(seed, k * 3) * 5);
        const sy = k * 2 + Math.floor(hash2(seed, k * 3 + 1) * 2);
        p.hline(sx, sy, 4 + Math.floor(hash2(seed, k * 3 + 2) * 3), PAL.sand[0]);
      }
      // Top layer: bright straw, stratified in both axes, mixed directions
      for (let k = 0; k < 6; k++) {
        const sx = ((k + 1) % 2) * 6 + Math.floor(hash2(seed + 17, k * 3) * 5);
        const sy = k * 2 + 1 + Math.floor(hash2(seed + 17, k * 3 + 1) * 2);
        if (k % 3 === 2) p.vline(sx, sy, 4, PAL.sand[1]);
        else p.hline(sx, sy, 5, PAL.sand[1]);
        p.px(sx, sy, PAL.sand[2]); // lit tip
      }
    }

    // Row 2 QUEEN: woven golden mat — the throne floor is DRESSED, not dug
    for (let i = 0; i < 4; i++) {
      const p = new PixelPainter(ctx, 2, i * T, 2 * T);
      const seed = i * 7 + 2 * 131;
      p.rect(0, 0, 16, 16, PAL.wood[1]);
      // Weave: alternating warp/weft bands every 4px
      for (let b = 0; b < 4; b++) {
        p.hline(0, b * 4 + 1, 16, PAL.wood[2]);
        p.vline(b * 4 + 2, 0, 16, PAL.wood[0]);
      }
      // Golden threads woven through + a catch-light
      for (let k = 0; k < 3; k++) {
        const gx = Math.floor(hash2(seed, k * 5) * 13);
        const gy = 1 + Math.floor(hash2(seed, k * 5 + 1) * 3) * 4;
        p.hline(gx, gy, 3, PAL.queen);
        p.px(gx, gy, PAL.glowAmber);
      }
    }

    // Row 9 DEFENSE: COBBLESTONE — fitted rock slabs, a floor built to hold a line
    for (let i = 0; i < 4; i++) {
      const p = new PixelPainter(ctx, 2, i * T, 9 * T);
      const seed = i * 7 + 9 * 131;
      p.rect(0, 0, 16, 16, PAL.black);
      // Fitted slabs in a staggered 2-row layout with mortar gaps
      for (let row = 0; row < 4; row++) {
        const offset = (row % 2) * 2;
        for (let col = 0; col < 4; col++) {
          const sx = col * 4 + offset - 2;
          const sy = row * 4;
          p.rect(sx + 1, sy + 1, 3, 3, PAL.stone[0]);
          p.px(sx + 1, sy + 1, PAL.stone[1]); // top-left light
          if (hash2(seed + row, col) < 0.25) p.rect(sx + 1, sy + 1, 3, 3, PAL.stone[1]); // worn slab
        }
      }
    }

    // Row 8: fungus farm bed — tilled soil with horizontal furrows + pale
    // mycelium threads. Must read as CULTIVATED ground, distinct from the
    // pantry floor (row 3) at a glance.
    for (let i = 0; i < 4; i++) {
      const p = new PixelPainter(ctx, 2, i * T, 8 * T);
      const seed = i * 7 + 8 * 131;
      p.rect(0, 0, 16, 16, PAL.earth[2]);
      // Furrows: three dark cultivation rows with a lit ridge above each
      for (const fy of [3, 8, 13]) {
        p.hline(0, fy, 16, PAL.earth[0]);
        p.hline(0, fy - 1, 16, PAL.earth[3]);
      }
      // Mycelium threads: pale fungal specks between the furrows
      for (let k = 0; k < 9; k++) {
        const gx = Math.floor(hash2(seed, k * 3) * 16);
        const gy = Math.floor(hash2(seed, k * 3 + 1) * 16);
        p.px(gx, gy, PAL.shroomStem);
      }
      // A couple of spore dots in cap color
      for (let k = 0; k < 2; k++) {
        const sx = 2 + Math.floor(hash2(seed + 5, k * 7) * 12);
        const sy = 2 + Math.floor(hash2(seed + 5, k * 7 + 1) * 12);
        p.px(sx, sy, PAL.shroomCapLight);
      }
    }

    this.ugTextureCanvas = canvas;
    this.ugTextureReady = true;
  }

  invalidateUndergroundTexture(): void {
    this.ugTextureReady = false;
  }

  /** Build/refresh the per-tile underground light map, only when the dig layout
   *  changes. The O(1) version check matters: this used to hash all 5400 tiles
   *  every frame just to decide whether to rebuild. */
  private ensureUgLightMap(grid: UndergroundGrid): void {
    const version = grid.getLayoutVersion();
    if (version === this.ugLightVersion) return;
    this.ugLightVersion = version;
    computeUndergroundLight(grid, this.ugLightLevel, this.ugLightColor, this.ugLightBright);
  }

  invalidateTerrain(): void {
    this.terrainRenderer.invalidate();
    this.foliageOverlay.invalidate();
  }

  /** The single render path. `dt` is real frame time (0 while paused). */
  renderInterpolated(interpolation: number, dt: number): void {
    this.animationTime += dt;
    this.terrainRenderer.update(dt);
    if (this.getDayPhase) this.ambientParticles.setNight(this.getDayPhase().phase === 'night');
    this.ambientParticles.update(dt);

    const ctx = this.renderer.getContext();
    this.renderer.clear();

    // Branch: underground or surface
    if (this.getActiveLayer && this.getActiveLayer() === 'underground') {
      this.renderUndergroundFrame(ctx, dt);
      return;
    }

    ctx.save();
    if (this.camera) this.camera.applyTransform(ctx);
    this.renderTerrain();
    this.foliageOverlay.draw(ctx, this.camera);
    this.renderPheromones();
    this.renderParticles();
    this.renderEntitiesInterpolated(interpolation);
    this.renderDeathEffects(ctx, dt);
    this.renderHitEffects(ctx, dt);
    this.fogRenderer.update();
    this.fogRenderer.draw(ctx);
    ctx.restore();
    if (this.getDayPhase) {
      const dp = this.getDayPhase();
      this.postProcessor.setDayPhase(dp.phase, dp.progress);
      this.postProcessor.setLights(dp.phase === 'night' ? this.collectSurfaceLights() : []);
    }
    this.postProcessor.apply(ctx);
  }


  private renderUndergroundFrame(ctx: CanvasRenderingContext2D, dt: number): void {
    if (!this.ugGrid || !this.ugCamera) return;

    const frameTime = Date.now();

    // Fill background with black (cave void — palette only)
    ctx.fillStyle = PAL.black;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();
    this.ugCamera.applyTransform(ctx);

    const grid = this.ugGrid;
    const zoom = this.ugCamera.getZoom();
    const viewW = CANVAS_WIDTH / zoom;
    const viewH = CANVAS_HEIGHT / zoom;
    const camX = this.ugCamera.x;
    const camY = this.ugCamera.y;

    const startX = Math.max(0, Math.floor(camX / TILE_SIZE) - 1);
    const startY = Math.max(0, Math.floor(camY / TILE_SIZE) - 1);
    const endX = Math.min(UNDERGROUND_WIDTH, Math.ceil((camX + viewW) / TILE_SIZE) + 1);
    const endY = Math.min(UNDERGROUND_HEIGHT, Math.ceil((camY + viewH) / TILE_SIZE) + 1);

    // Initialize texture cache on first call
    if (!this.ugTextureReady) {
      this.initUndergroundTextures();
    }

    const T = TILE_SIZE;
    const texCanvas = this.ugTextureCanvas!;

    // === PASS 1: Base terrain (textured tiles) ===
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const tile = grid.getTile(x, y);
        if (!tile) continue;

        const px = x * T;
        const py = y * T;

        // Pick texture variant based on tile position (deterministic)
        const col = ((x * 7 + y * 13) % 4 + 4) % 4;
        let row: number;

        switch (tile.terrain) {
          case UndergroundTerrainType.Earth:
            row = tile.designated ? 7 : 0;
            break;
          case UndergroundTerrainType.Reinforced:
            row = 6;
            break;
          case UndergroundTerrainType.Tunnel:
            row = 1;
            break;
          case UndergroundTerrainType.Chamber:
            if (tile.chamberType === ChamberType.Queen) row = 2;
            else if (tile.chamberType === ChamberType.FoodStorage) row = 3;
            else if (tile.chamberType === ChamberType.Egg || tile.chamberType === ChamberType.Incubation) row = 4;
            else row = 5;
            break;
          default:
            row = 0;
        }

        // The chamber-type FLOOR wins over the underlying terrain everywhere a
        // designation exists — the ground itself is the area's identity
        if (tile.walkable) {
          if (tile.chamberType === ChamberType.FungusFarm) row = 8;
          else if (tile.chamberType === ChamberType.Queen) row = 2;
          else if (tile.chamberType === ChamberType.FoodStorage) row = 3;
          else if (tile.chamberType === ChamberType.Incubation) row = 4;
          else if (tile.chamberType === ChamberType.Defense) row = 9;
        }

        // Draw pre-rendered texture tile
        ctx.drawImage(texCanvas, col * T, row * T, T, T, px, py, T, T);

        // Area identity comes from the FLOOR TEXTURES themselves (rows 2/3/4/8/9)
        // — no overlays, no icons: each chamber type has its own realistic ground

        // Fungus farm crop GROWS — mushroom count + size scale with this tile's
        // pile so the player SEES the harvest building up. While the farm is
        // converting, the caps shimmer (quantized 2-state, no smooth alpha).
        if (tile.chamberType === ChamberType.FungusFarm) {
          const producing = this.getFarmStatus !== null && this.getFarmStatus() === 'produciendo';
          const shimmer = producing && Math.floor(frameTime * 0.004 + x + y) % 2 === 0;
          const capColor = shimmer ? PAL.shroomCapLight : PAL.shroomCap;
          const fill = Math.min(1, (tile.food?.amount ?? 0) / this.ugGrid!.getPantryTileCapacity());
          const shrooms = 1 + Math.floor(fill * 5); // a sprout even when empty → up to a 6-shroom crop
          const seed = x * 31 + y * 17;
          for (let m = 0; m < shrooms; m++) {
            const mx = px + 4 + Math.floor(hash2(seed, m * 2) * ((T - 12) / 2)) * 2;
            const my = py + 6 + Math.floor(hash2(seed, m * 2 + 1) * ((T - 14) / 2)) * 2;
            // First mushrooms grow TALL once the pile passes half capacity
            const big = fill > 0.5 && m < 2;
            if (big) {
              ctx.fillStyle = PAL.shroomStem;
              ctx.fillRect(mx + 2, my + 3, 2, 5);
              ctx.fillStyle = capColor;
              ctx.fillRect(mx, my, 6, 3);
              ctx.fillStyle = PAL.shroomCapLight;
              ctx.fillRect(mx, my, 3, 1);
            } else {
              ctx.fillStyle = PAL.shroomStem;
              ctx.fillRect(mx + 1, my + 2, 2, 3);
              ctx.fillStyle = capColor;
              ctx.fillRect(mx, my, 4, 2);
              ctx.fillStyle = PAL.shroomCapLight;
              ctx.fillRect(mx, my, 2, 1);
            }
          }
        }

        // Designation overlay (dashed border, quantized alpha)
        if (tile.designated) {
          ctx.globalAlpha = 0.75;
          ctx.strokeStyle = PAL.glowAmber;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(px + 2, py + 2, T - 4, T - 4);
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      }
    }

    // === PASS 2: Wall edges / shadows ===
    // Where walkable meets unwalkable, draw shadow to create depth
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const tile = grid.getTile(x, y);
        if (!tile) continue;

        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        // (Wall cracks are baked into the pre-rendered tile textures now)
        if (!tile.walkable) continue;

        // Check each direction for wall edges
        const top = grid.getTile(x, y - 1);
        const bottom = grid.getTile(x, y + 1);
        const left = grid.getTile(x - 1, y);
        const right = grid.getTile(x + 1, y);

        // Two-step quantized edge shadows (4px @0.5 + 4px @0.25 — discrete bands)
        if (top && !top.walkable) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(px, py, TILE_SIZE, 4);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(px, py + 4, TILE_SIZE, 4);
        }
        if (bottom && !bottom.walkable) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(px, py + TILE_SIZE - 4, TILE_SIZE, 4);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(px, py + TILE_SIZE - 8, TILE_SIZE, 4);
        }
        if (left && !left.walkable) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(px, py, 4, TILE_SIZE);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(px + 4, py, 4, TILE_SIZE);
        }
        if (right && !right.walkable) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(px + TILE_SIZE - 4, py, 4, TILE_SIZE);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(px + TILE_SIZE - 8, py, 4, TILE_SIZE);
        }
      }
    }

    // === PASS 3: Underground lighting — per-tile quantized light map (0-3) ===
    // Darkness rendered as dithered black overlay; recomputed only on layout change.
    this.ensureUgLightMap(grid);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const tile = grid.getTile(x, y);
        if (!tile) continue;
        let level = this.ugLightLevel[y * UNDERGROUND_WIDTH + x];
        if (tile.designated && level < UG_LIGHT_RIM) level = UG_LIGHT_RIM; // keep dig orders readable
        if (level >= UG_LIGHT_FULL) continue;
        const dpx = x * T;
        const dpy = y * T;
        if (level === 0) {
          ctx.fillRect(dpx, dpy, T, T); // solid dark
        } else {
          ctx.drawImage(this.fxDither[level], dpx, dpy);
        }
      }
    }

    // Rim highlights: wall faces adjacent to well-lit tiles catch the glow color
    const RIM_COLORS = [PAL.glowAmber, PAL.glowAmber, PAL.glowGreen, PAL.shroomCapLight, PAL.skyNoon];
    ctx.globalAlpha = 0.5;
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const tile = grid.getTile(x, y);
        if (!tile || tile.walkable) continue;
        const wpx = x * T;
        const wpy = y * T;
        // Left neighbor lit → rim on this wall's left face (and so on per side)
        const ln = grid.getTile(x - 1, y);
        if (ln && ln.walkable) {
          const i = y * UNDERGROUND_WIDTH + (x - 1);
          if (this.ugLightLevel[i] >= UG_LIGHT_RIM) {
            ctx.fillStyle = RIM_COLORS[this.ugLightColor[i]];
            ctx.fillRect(wpx, wpy, 2, T);
          }
        }
        const rn = grid.getTile(x + 1, y);
        if (rn && rn.walkable) {
          const i = y * UNDERGROUND_WIDTH + (x + 1);
          if (this.ugLightLevel[i] >= UG_LIGHT_RIM) {
            ctx.fillStyle = RIM_COLORS[this.ugLightColor[i]];
            ctx.fillRect(wpx + T - 2, wpy, 2, T);
          }
        }
        const tn = grid.getTile(x, y - 1);
        if (tn && tn.walkable) {
          const i = (y - 1) * UNDERGROUND_WIDTH + x;
          if (this.ugLightLevel[i] >= UG_LIGHT_RIM) {
            ctx.fillStyle = RIM_COLORS[this.ugLightColor[i]];
            ctx.fillRect(wpx, wpy, T, 2);
          }
        }
        const bn = grid.getTile(x, y + 1);
        if (bn && bn.walkable) {
          const i = (y + 1) * UNDERGROUND_WIDTH + x;
          if (this.ugLightLevel[i] >= UG_LIGHT_RIM) {
            ctx.fillStyle = RIM_COLORS[this.ugLightColor[i]];
            ctx.fillRect(wpx, wpy + T - 2, T, 2);
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    // === PASS 3.5: Underground ambient particles ===
    // Update particle timer and spawn new particles
    this.ugParticleTimer += dt;

    if (this.ugParticleTimer >= 0.15) {
      this.ugParticleTimer = 0;

      // Spawn 1-2 particles at random walkable positions within camera view
      const spawnCount = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < spawnCount; i++) {
        const tileX = startX + Math.floor(Math.random() * (endX - startX));
        const tileY = startY + Math.floor(Math.random() * (endY - startY));
        const tile = grid.getTile(tileX, tileY);

        if (tile && tile.walkable) {
          const worldX = tileX * TILE_SIZE + Math.random() * TILE_SIZE;
          const worldY = tileY * TILE_SIZE + Math.random() * TILE_SIZE;

          // Determine particle type based on chamber type
          let type: 'dust' | 'spore' | 'warmth' = 'dust';
          if (tile.terrain === UndergroundTerrainType.Chamber) {
            if (tile.chamberType === ChamberType.FoodStorage && Math.random() < 0.4) {
              type = 'spore';
            } else if (tile.chamberType === ChamberType.Queen && Math.random() < 0.3) {
              type = 'warmth';
            }
          }

          // Set particle properties based on type
          let vx: number, vy: number, maxLife: number, size: number;
          if (type === 'dust') {
            vx = (Math.random() - 0.5) * 0.3;
            vy = -0.5 - Math.random() * 0.5; // float upward
            maxLife = 3 + Math.random() * 2;
            size = 0.8 + Math.random() * 0.5;
          } else if (type === 'spore') {
            vx = (Math.random() - 0.5) * 0.8;
            vy = (Math.random() - 0.5) * 0.8; // drift randomly
            maxLife = 2 + Math.random() * 2;
            size = 0.6 + Math.random() * 0.4;
          } else { // warmth
            vx = (Math.random() - 0.5) * 0.4;
            vy = -0.7 - Math.random() * 0.6; // rise slowly
            maxLife = 2 + Math.random() * 1;
            size = 0.7 + Math.random() * 0.4;
          }

          this.ugParticles.push({
            x: worldX,
            y: worldY,
            vx,
            vy,
            life: maxLife,
            maxLife,
            size,
            type
          });
        }
      }
    }

    // Update and render particles
    for (let i = this.ugParticles.length - 1; i >= 0; i--) {
      const p = this.ugParticles[i];

      // Update position and life
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;

      // Remove dead particles (swap-and-pop, O(1) instead of O(n))
      if (p.life <= 0) {
        this.ugParticles[i] = this.ugParticles[this.ugParticles.length - 1];
        this.ugParticles.pop();
        continue;
      }

      // Render particle — single square art pixel, 2-step quantized alpha
      const lifeT = p.life / p.maxLife;
      ctx.globalAlpha = lifeT > 0.5 ? 0.5 : 0.25;
      ctx.fillStyle = p.type === 'dust' ? PAL.stone[2] : p.type === 'spore' ? PAL.glowGreen : PAL.glowAmber;
      ctx.fillRect(Math.round(p.x / 2) * 2 - 1, Math.round(p.y / 2) * 2 - 1, 2, 2);
      ctx.globalAlpha = 1;
    }

    // Cap max particles at 30
    if (this.ugParticles.length > 30) {
      this.ugParticles.splice(0, this.ugParticles.length - 30);
    }

    // === PASS 3.7: Pantry tile piles (drawn under entities so ants walk over them) ===
    // Each FoodStorage tile renders its own physical pile — the grid is the source
    // of truth. Farm tiles draw their own growing mushrooms in the tile pass.
    const pantryTiles = grid.getPantryTiles();
    const tileCap = grid.getPantryTileCapacity();
    let pantryCx = 0;
    let pantryCy = 0;
    let pantryTotal = 0;
    for (const t of pantryTiles) {
      // Pantry tiles are corner-anchored: pixel center is at +0.5 tiles
      const spx = (t.x + 0.5) * TILE_SIZE;
      const spy = (t.y + 0.5) * TILE_SIZE;
      pantryCx += spx;
      pantryCy += spy;
      if (!t.food || t.food.amount <= 0) continue;
      pantryTotal += t.food.amount;

      const tileFill = Math.min(1, t.food.amount / tileCap);
      const items = Math.max(1, Math.round(tileFill * STORAGE_PILE_MAX_ITEMS));
      // Pile spreads across the tile as it fills up
      const pileRadius = TILE_SIZE * (0.2 + tileFill * 0.3);
      this.drawFoodPile(
        ctx, spx, spy,
        t.food.type === 'leaf' ? t.food.amount : 0,
        t.food.type === 'mushroom' ? t.food.amount : 0,
        t.food.type === 'meat' ? t.food.amount : 0,
        items, pileRadius
      );
    }

    // Capacity gauge — segmented pixel ring at the pantry centroid (16 ticks, lit count = fill ratio)
    if (pantryTiles.length > 0) {
      const fillRatio = Math.min(1, pantryTotal / Math.max(1, grid.getPantryCapacity()));
      const litTicks = Math.round(fillRatio * 16);
      const tickR = TILE_SIZE * 2.0;
      pantryCx /= pantryTiles.length;
      pantryCy /= pantryTiles.length;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = PAL.glowGreen;
      for (let t = 0; t < litTicks; t++) {
        const [ux, uy] = RING_TICKS_16[t];
        ctx.fillRect(Math.round(pantryCx + ux * tickR) - 1, Math.round(pantryCy + uy * tickR) - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    // === PASS 4: Underground entities ===
    const entities = this.world.query(COMPONENT.POSITION, COMPONENT.RENDER, COMPONENT.LAYER);
    for (const id of entities) {
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Underground) continue;

      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const render = this.world.getComponent<RenderComponent>(id, COMPONENT.RENDER)!;

      const px = pos.x * TILE_SIZE + TILE_SIZE / 2;
      const py = pos.y * TILE_SIZE + TILE_SIZE / 2;
      const r = render.radius * TILE_SIZE;

      if (render.shape === 'queen') {
        // Queen: same ant anatomy scaled 2x; halo = two stacked dithered glow stamps
        // Body pulse quantized to 2 discrete steps (no smooth sin-scaling)
        const bodyPulse = Math.sin(frameTime * 0.002) > 0 ? 1.04 : 1.0;

        // Outer + core glow (pre-rendered dither, quantized alpha baked in)
        this.drawGlowStamp(ctx, px, py, TILE_SIZE * 3.0, 'amber');
        this.drawGlowStamp(ctx, px, py, TILE_SIZE * 1.2, 'amber');

        // Read actual facing/movement data — angle tracks where she walks,
        // legPhase only advances when MovementSystem moves her (idle = frozen legs)
        const queenFacing = this.world.getComponent<FacingComponent>(id, COMPONENT.FACING);
        const queenAngle = queenFacing?.angle ?? 0;
        const queenLegPhase = queenFacing?.legPhase ?? 0;

        // Draw dedicated queen sprite — large gaster, short compact legs.
        // Using her own sprite (not a scaled Worker) ensures the legs never
        // bleed onto the chamber floor and look like moving ground.
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(2.2 * bodyPulse, 2.2 * bodyPulse);
        ctx.translate(-px, -py);
        this.spriteAtlas.drawQueenAnt(ctx, px, py, queenAngle, queenLegPhase);
        ctx.restore();

        // Pixel crown above queen (3 spikes + base, palette colors)
        const cp = new PixelPainter(ctx, 2);
        const ccx = Math.round(px / 2);
        const ccy = Math.round((py - TILE_SIZE * 0.75) / 2);
        cp.rect(ccx - 4, ccy + 1, 8, 2, PAL.queen); // base
        cp.hline(ccx - 4, ccy + 3, 8, PAL.outline); // base underline
        cp.rect(ccx - 4, ccy - 1, 2, 2, PAL.queen); // left spike
        cp.rect(ccx - 1, ccy - 2, 2, 3, PAL.queen); // center spike (taller)
        cp.rect(ccx + 2, ccy - 1, 2, 2, PAL.queen); // right spike
        cp.px(ccx - 1, ccy - 2, PAL.white); // catch-light
      } else if (render.shape === 'beetle') {
        // Underground invaders — same sprite as surface beetles (NOT a plain circle)
        const facing = this.world.getComponent<FacingComponent>(id, COMPONENT.FACING);
        const beetle = this.world.getComponent<BeetleComponent>(id, COMPONENT.BEETLE);
        const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
        const isAttacking = !!(combat && combat.targetEntityId !== null) ||
          !!(beetle && beetle.state === BeetleState.Attacking);
        this.drawBeetle(
          ctx,
          pos.x,
          pos.y,
          facing ? facing.angle : 0,
          facing ? facing.legPhase : 0,
          id,
          isAttacking
        );
      } else if (render.shape === 'food') {
        // Meat dropped by invaders killed inside the nest — same sprite as surface food
        this.drawFood(ctx, pos.x, pos.y, id);
      } else if (render.shape === 'ant') {
        // Regular ants underground — use same sprite as surface
        const facing = this.world.getComponent<FacingComponent>(id, COMPONENT.FACING);
        const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT);
        const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
        const angle = facing ? facing.angle : 0;
        const legPhase = facing ? facing.legPhase : 0;
        const role = ant ? ant.role : AntRole.Worker;
        const isCarrying = carrying ? carrying.amount > 0 : false;

        // Drop shadow (pre-rendered dither stamp)
        this.drawShadow(ctx, px + 2, py + 3, TILE_SIZE * 0.28, TILE_SIZE * 0.14);

        // Nurse activity indicators
        if (ant && ant.role === AntRole.Nurse) {
          const state = ant.state;

          if (state === AntState.MovingEgg) {
            // Pixel egg on nurse's back (3×2 art px white block + outline px)
            const eggOffsetX = Math.cos(angle + Math.PI) * 6;
            const eggOffsetY = Math.sin(angle + Math.PI) * 6;
            const ep = new PixelPainter(ctx, 2);
            const ex = Math.round((px + eggOffsetX) / 2);
            const ey = Math.round((py + eggOffsetY) / 2);
            ep.rect(ex - 1, ey - 1, 3, 2, PAL.white);
            ep.px(ex - 1, ey, PAL.sand[2]); // bottom shade px
          } else if (state === AntState.FeedingQueen) {
            // Food trail toward queen — 3 squares fading in 3 discrete alpha steps
            ctx.fillStyle = PAL.glowGreen;
            for (let i = 0; i < 3; i++) {
              const trailDist = 4 + i * 3;
              ctx.globalAlpha = ALPHA_STEPS[i];
              ctx.fillRect(
                Math.round(px + Math.cos(angle) * trailDist) - 1,
                Math.round(py + Math.sin(angle) * trailDist) - 1,
                2, 2
              );
            }
            ctx.globalAlpha = 1;
          }
        }

        // Carrying indicator (for any ant with food) — square pixel chunk
        if (isCarrying) {
          ctx.fillStyle = PAL.glowGreen;
          ctx.fillRect(Math.round(px) - 2, Math.round(py) - 8, 4, 4);
        }

        this.spriteAtlas.drawAnt(ctx, px, py, angle, legPhase, role, isCarrying);
      } else {
        // Check if it's an egg
        const eggComp = this.world.getComponent<EggComponent>(id, COMPONENT.EGG);
        if (eggComp) {
          // Pixel egg: dithered shell, 2-state pulse, segmented progress ticks
          const egg = eggComp as EggComponent;
          // hatchTimer counts DOWN — progress is the elapsed fraction
          const hatchProgress = Math.max(0, Math.min(1, 1 - egg.hatchTimer / egg.hatchTime));
          const isCloseToHatching = hatchProgress > 0.8;

          const ep = new PixelPainter(ctx, 2);
          const ecx = Math.round(px / 2);
          const ecy = Math.round(py / 2);
          // Pulse quantized to 2 discrete frames (grow 1 art px when "inhaling")
          const pulseStep = Math.sin(frameTime * 0.003 + id * 1.7) > 0 ? 1 : 0;
          const erx = Math.max(2, Math.round((r * 1.3) / 2)) + pulseStep;
          const ery = Math.max(2, Math.round((r * 0.8) / 2));

          // Warm glow stamp (brighter when close to hatching: stack two)
          this.drawGlowStamp(ctx, px, py, r * 1.8, 'amber');
          if (isCloseToHatching) this.drawGlowStamp(ctx, px, py, r * 1.8, 'amber');

          // Shell + dithered bottom shade
          ep.ellipse(ecx, ecy, erx, ery, PAL.white);
          ep.shadow(ecx, ecy + Math.ceil(ery / 2), erx - 1, Math.max(1, Math.floor(ery / 2)), PAL.sand[2]);

          // Speckles (deterministic from entity id)
          const speckleCount = 2 + (id % 3);
          for (let i = 0; i < speckleCount; i++) {
            const sx = ecx + Math.round((hash2(id * 31 + i, i * 17 + 1) - 0.5) * erx * 1.2);
            const sy = ecy + Math.round((hash2(i * 13 + 5, id * 7 + i) - 0.5) * ery * 1.2);
            ep.px(sx, sy, PAL.sand[0]);
          }

          // Role accent pixel (replaces the invisible 8% tint overlay)
          const roleAccent: Record<AntRole, string> = {
            [AntRole.Worker]: PAL.worker,
            [AntRole.Soldier]: PAL.soldier,
            [AntRole.Scout]: PAL.scout,
            [AntRole.Nurse]: PAL.nurse,
            [AntRole.Defender]: PAL.defender,
          };
          ep.px(ecx, ecy - 1, roleAccent[egg.role] ?? PAL.worker);

          // Cracks when close to hatching (pixel lines, 2 discrete stages)
          if (hatchProgress > 0.7) {
            ep.line(ecx, ecy - ery + 1, ecx + 1, ecy, PAL.outline);
            if (hatchProgress > 0.85) {
              ep.line(ecx + 1, ecy, ecx - 1, ecy + ery - 1, PAL.outline);
            }
          }

          // Incubation progress — 8 segmented ticks instead of a smooth arc
          const ringR = erx + 2;
          const litTicks = Math.round(hatchProgress * 8);
          for (let i = 0; i < litTicks; i++) {
            const [ux, uy] = RING_TICKS_8[i];
            ep.px(ecx + Math.round(ux * ringR), ecy + Math.round(uy * ringR), PAL.glowGreen);
          }

          // Feeding progress — amber ticks on an outer ring; disappears once the larva is full
          const isHungry = eggComp.fedAmount < eggComp.requiredFood;
          if (isHungry) {
            const fedProgress = Math.max(0, Math.min(1, eggComp.fedAmount / eggComp.requiredFood));
            const fedTicks = Math.round(fedProgress * 8);
            for (let i = 0; i < fedTicks; i++) {
              const [ux, uy] = RING_TICKS_8[i];
              ep.px(ecx + Math.round(ux * (ringR + 2)), ecy + Math.round(uy * (ringR + 2)), PAL.glowAmber);
            }
          }

          // Close-to-hatching: blinking pixel ring (2-state, no smooth pulse).
          // Amber while still hungry — the larva is waiting for a nurse, not about to hatch
          if (isCloseToHatching && Math.floor(frameTime * 0.006) % 2 === 0) {
            ctx.globalAlpha = 0.5;
            ep.ring(ecx, ecy, ringR + 2, isHungry ? PAL.glowAmber : PAL.glowGreen);
            ctx.globalAlpha = 1;
          }
        } else {
          // Generic underground entity — rasterized pixel disc
          const gp = new PixelPainter(ctx, 2);
          gp.disc(Math.round(px / 2), Math.round(py / 2), Math.max(1, Math.round(r / 2)), render.color);
        }
      }
    }

    ctx.restore(); // restore camera transform
  }

  /**
   * Surface light sources for the night pass, in SCREEN pixels.
   *
   * Only the nest and giant mushrooms qualify: the nest because the colony's
   * home has to stay readable after dark (and because it makes "get back before
   * nightfall" legible), giant mushrooms because a glowing fungus is the one
   * light the world plausibly has. Ordinary food and ants deliberately do NOT
   * glow — if everything is a light source, nothing is.
   */
  private collectSurfaceLights(): ScreenLight[] {
    if (!this.camera) return [];
    const lights: ScreenLight[] = [];
    const zoom = this.camera.getZoom();

    const add = (tileX: number, tileY: number, radiusTiles: number) => {
      const s = this.camera!.worldToScreen(tileX * TILE_SIZE, tileY * TILE_SIZE);
      lights.push({ x: s.x, y: s.y, radius: radiusTiles * TILE_SIZE * zoom });
    };

    for (const id of this.world.query(COMPONENT.NEST, COMPONENT.POSITION)) {
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      add(pos.x, pos.y, 7);
    }

    for (const id of this.world.query(COMPONENT.FOOD_SOURCE, COMPONENT.POSITION)) {
      const src = this.world.getComponent<FoodSourceComponent>(id, COMPONENT.FOOD_SOURCE);
      if (!src || src.resourceType !== FoodType.GiantMushroom) continue;
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      if (layer && layer.layer !== Layer.Surface) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      add(pos.x, pos.y, 3.5);
    }

    return lights;
  }

  private renderTerrain(): void {
    // Draw pre-rendered terrain (ONE blit operation for all terrain)
    const ctx = this.renderer.getContext();
    this.terrainRenderer.draw(ctx);
  }

  private renderPheromones(): void {
    const ctx = this.renderer.getContext();
    if (!this.camera) return;

    // Viewport culling — only render visible tiles
    const viewW = CANVAS_WIDTH / this.camera.getZoom();
    const viewH = CANVAS_HEIGHT / this.camera.getZoom();
    const startX = Math.max(0, Math.floor(this.camera.x / TILE_SIZE));
    const startY = Math.max(0, Math.floor(this.camera.y / TILE_SIZE));
    const endX = Math.min(this.grid.width, Math.ceil((this.camera.x + viewW) / TILE_SIZE) + 1);
    const endY = Math.min(this.grid.height, Math.ceil((this.camera.y + viewH) / TILE_SIZE) + 1);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Pre-rendered dithered diamond stamps, 3 quantized intensity levels per type.
    // Strength → level is a discrete step function (no smooth alpha scaling).
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const tile = this.grid.getTile(x, y)!;
        if (!this.visibilityGrid.isExplored(x, y)) continue;
        const tpx = x * TILE_SIZE;
        const tpy = y * TILE_SIZE;

        if (tile.homePheromone > 1) {
          const s = tile.homePheromone / PHEROMONE_MAX;
          ctx.drawImage(this.fxPheroStamps.home[s > 0.6 ? 2 : s > 0.25 ? 1 : 0], tpx, tpy);
        }

        if (tile.foodPheromone > 1) {
          const s = tile.foodPheromone / PHEROMONE_MAX;
          ctx.drawImage(this.fxPheroStamps.food[s > 0.6 ? 2 : s > 0.25 ? 1 : 0], tpx, tpy);
        }

        if (tile.dangerPheromone > 1) {
          const s = tile.dangerPheromone / PHEROMONE_MAX;
          ctx.drawImage(this.fxPheroStamps.danger[s > 0.6 ? 2 : s > 0.25 ? 1 : 0], tpx, tpy);
        }
      }
    }

    ctx.restore();
  }

  private renderParticles(): void {
    if (!this.camera) return;

    const ctx = this.renderer.getContext();

    // Get viewport culling bounds (same as pheromone rendering)
    const viewW = CANVAS_WIDTH / this.camera.getZoom();
    const viewH = CANVAS_HEIGHT / this.camera.getZoom();
    const startX = Math.max(0, Math.floor(this.camera.x / TILE_SIZE));
    const startY = Math.max(0, Math.floor(this.camera.y / TILE_SIZE));
    const endX = Math.min(this.grid.width, Math.ceil((this.camera.x + viewW) / TILE_SIZE) + 1);
    const endY = Math.min(this.grid.height, Math.ceil((this.camera.y + viewH) / TILE_SIZE) + 1);

    this.ambientParticles.render(ctx, startX, startY, endX, endY);
  }

  /** Tile-space viewport bounds with margin — shared entity culling */
  private surfaceCullBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    if (!this.camera) return { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };
    const margin = 3;
    const viewW = CANVAS_WIDTH / this.camera.getZoom();
    const viewH = CANVAS_HEIGHT / this.camera.getZoom();
    return {
      minX: this.camera.x / TILE_SIZE - margin,
      minY: this.camera.y / TILE_SIZE - margin,
      maxX: (this.camera.x + viewW) / TILE_SIZE + margin,
      maxY: (this.camera.y + viewH) / TILE_SIZE + margin,
    };
  }

  private renderEntitiesInterpolated(interpolation: number): void {
    const ctx = this.renderer.getContext();
    const cull = this.surfaceCullBounds();

    // Separate entities by type for proper render order
    const foodEntities: Array<{ id: number; pos: PositionComponent; radius: number }> = [];
    const nestEntities: Array<{ id: number; pos: PositionComponent; radius: number }> = [];
    const denEntities: Array<{ id: number; pos: PositionComponent }> = [];
    const cricketDenEntities: Array<{ id: number; pos: PositionComponent }> = [];
    const beetleEntities: Array<{ id: number; pos: PositionComponent }> = [];
    const cricketEntities: Array<{ id: number; pos: PositionComponent }> = [];
    const antEntities: Array<{ id: number; pos: PositionComponent }> = [];

    const entities = this.world.query(COMPONENT.POSITION, COMPONENT.RENDER);
    for (const id of entities) {
      // Skip underground entities when rendering surface
      const layerComp = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      if (layerComp && layerComp.layer === Layer.Underground) continue;

      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const render = this.world.getComponent<RenderComponent>(id, COMPONENT.RENDER)!;

      // Cull only the high-count, dependency-free shapes (ants + food piles);
      // crickets stay — the nest "being robbed" check reads them even offscreen
      if (
        (render.shape === 'ant' || render.shape === 'food') &&
        (pos.x < cull.minX || pos.x > cull.maxX || pos.y < cull.minY || pos.y > cull.maxY)
      ) continue;

      if (render.shape === 'giant_mushroom') {
        foodEntities.push({ id, pos, radius: render.radius });
      } else if (render.shape === 'food') {
        foodEntities.push({ id, pos, radius: render.radius });
      } else if (render.shape === 'nest') {
        nestEntities.push({ id, pos, radius: render.radius });
      } else if (render.shape === 'beetle_den') {
        denEntities.push({ id, pos });
      } else if (render.shape === 'cricket_den') {
        cricketDenEntities.push({ id, pos });
      } else if (render.shape === 'beetle') {
        beetleEntities.push({ id, pos });
      } else if (render.shape === 'cricket') {
        cricketEntities.push({ id, pos });
      } else if (render.shape === 'ant') {
        antEntities.push({ id, pos });
      }
    }

    // Render order: food → nest → beetle_dens → cricket_dens → beetles → crickets → ants
    for (const { id, pos } of foodEntities) {
      if (!this.visibilityGrid.isExplored(Math.round(pos.x), Math.round(pos.y))) continue;
      const x = pos.prevX + (pos.x - pos.prevX) * interpolation;
      const y = pos.prevY + (pos.y - pos.prevY) * interpolation;
      this.drawFood(ctx, x, y, id);
    }

    // Check if nest is being robbed by any cricket
    const isNestBeingRobbedInterp = cricketEntities.some(({ id }) => {
      const c = this.world.getComponent<CricketComponent>(id, COMPONENT.CRICKET);
      return c && c.state === CricketState.StealingFood;
    });

    for (const { id, pos, radius } of nestEntities) {
      const x = pos.prevX + (pos.x - pos.prevX) * interpolation;
      const y = pos.prevY + (pos.y - pos.prevY) * interpolation;
      const nest = this.world.getComponent<NestComponent>(id, COMPONENT.NEST);
      this.drawNest(ctx, x, y, radius, isNestBeingRobbedInterp, nest);
    }

    for (const { id, pos } of denEntities) {
      if (!this.visibilityGrid.isExplored(Math.round(pos.x), Math.round(pos.y))) continue;
      const x = pos.prevX + (pos.x - pos.prevX) * interpolation;
      const y = pos.prevY + (pos.y - pos.prevY) * interpolation;
      this.drawBeetleDen(ctx, x, y, id);
    }

    for (const { id, pos } of cricketDenEntities) {
      if (!this.visibilityGrid.isExplored(Math.round(pos.x), Math.round(pos.y))) continue;
      const x = pos.prevX + (pos.x - pos.prevX) * interpolation;
      const y = pos.prevY + (pos.y - pos.prevY) * interpolation;
      this.drawCricketDen(ctx, x, y, id);
    }

    for (const { id, pos } of beetleEntities) {
      if (!this.visibilityGrid.isExplored(Math.round(pos.x), Math.round(pos.y))) continue;
      const x = pos.prevX + (pos.x - pos.prevX) * interpolation;
      const y = pos.prevY + (pos.y - pos.prevY) * interpolation;
      const beetle = this.world.getComponent<BeetleComponent>(id, COMPONENT.BEETLE);
      const facing = this.world.getComponent<FacingComponent>(id, COMPONENT.FACING);
      if (facing) {
        const isAttacking = beetle && beetle.state === BeetleState.Attacking;
        this.drawBeetle(ctx, x, y, facing.angle, facing.legPhase, id, isAttacking);
      }
    }

    for (const { id, pos } of cricketEntities) {
      if (!this.visibilityGrid.isExplored(Math.round(pos.x), Math.round(pos.y))) continue;
      const x = pos.prevX + (pos.x - pos.prevX) * interpolation;
      const y = pos.prevY + (pos.y - pos.prevY) * interpolation;
      const cricket = this.world.getComponent<CricketComponent>(id, COMPONENT.CRICKET);
      const facing = this.world.getComponent<FacingComponent>(id, COMPONENT.FACING);
      if (facing) {
        const isAttacking = cricket && cricket.state === CricketState.Attacking;
        const isStealing = cricket && cricket.state === CricketState.StealingFood;
        this.drawCricket(ctx, x, y, facing.angle, facing.legPhase, id, isAttacking, isStealing);
      }
    }

    for (const { id, pos } of antEntities) {
      const x = pos.prevX + (pos.x - pos.prevX) * interpolation;
      const y = pos.prevY + (pos.y - pos.prevY) * interpolation;

      const facing = this.world.getComponent<FacingComponent>(id, COMPONENT.FACING);
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT);
      const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
      const selectable = this.world.getComponent<SelectableComponent>(id, COMPONENT.SELECTABLE);

      if (facing && ant) {
        const isCarrying = !!(carrying && carrying.amount > 0);
        const isSelected = !!(selectable && selectable.selected);
        const isInCombat = ant.state === AntState.AttackingEnemy || ant.state === AntState.AttackingDen;
        const isFleeing = ant.state === AntState.Fleeing;
        this.drawAnt(ctx, x, y, facing.angle, facing.legPhase, ant.role, isSelected, isCarrying, isInCombat, isFleeing);

        // Health bar for damaged ants
        const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
        if (health && health.current < health.max) {
          const px = x * TILE_SIZE + TILE_SIZE / 2;
          const py = y * TILE_SIZE + TILE_SIZE / 2;
          this.drawHealthBar(ctx, px, py, health.current, health.max);
        }

        // Healing indicator
        if (ant.state === AntState.Healing) {
          const px = x * TILE_SIZE + TILE_SIZE / 2;
          const py = y * TILE_SIZE + TILE_SIZE / 2;
          this.drawHealingIndicator(ctx, px, py, ant.stateTimer);
        }
      }
    }
  }

  /** Chunky segmented pixel health bar: pre-rendered frame (1px outline border)
   *  + up to 6 lit segments of 3×2 art px filled by health threshold color. */
  private drawHealthBar(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    current: number,
    max: number,
    alwaysShow = false,
    scale = 1,
    yOffset = -TILE_SIZE * 0.6
  ): void {
    if (!alwaysShow && current >= max) return;
    const ratio = Math.max(0, Math.min(1, current / max));
    const w = 25 * scale;
    const h = 4 * scale;
    const x = Math.round(px - w / 2);
    const y = Math.round(py + yOffset);

    ctx.drawImage(this.fxHealthFrame, x, y, w, h);

    let lit = Math.ceil(ratio * 6);
    if (current > 0 && lit === 0) lit = 1;
    if (lit === 0) return;

    ctx.fillStyle = ratio > 0.5 ? PAL.healthGreen : ratio > 0.25 ? PAL.healthYellow : PAL.dangerRed;
    for (let i = 0; i < lit; i++) {
      ctx.fillRect(x + (1 + i * 4) * scale, y + scale, 3 * scale, 2 * scale);
    }
  }

  private drawHealingIndicator(ctx: CanvasRenderingContext2D, px: number, py: number, timer: number): void {
    // 2-state pulse: small/dim ↔ large/bright (no smooth sin scaling)
    const step = Math.floor(timer * 4) % 2;
    const size = step === 0 ? 3 : 5;
    const crossY = Math.round(py - TILE_SIZE * 0.9);
    const cx = Math.round(px);

    ctx.globalAlpha = step === 0 ? 0.5 : 0.75;
    ctx.fillStyle = PAL.healthGreen;
    ctx.fillRect(cx - size, crossY - 1, size * 2, 2);
    ctx.fillRect(cx - 1, crossY - size, 2, size * 2);
    ctx.globalAlpha = 1;
  }

  private renderDeathEffects(ctx: CanvasRenderingContext2D, dt: number): void {
    const effects = this.world.deathEffects;
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.timer -= dt;

      if (effect.timer <= 0) {
        effects.splice(i, 1);
        continue;
      }

      const progress = 1 - (effect.timer / effect.maxTime); // 0 → 1
      // Quantize the whole effect into 3 discrete steps (radius + alpha together)
      const step = progress < 0.33 ? 0 : progress < 0.66 ? 1 : 2;

      const px = effect.x * TILE_SIZE + TILE_SIZE / 2;
      const py = effect.y * TILE_SIZE + TILE_SIZE / 2;
      const p = new PixelPainter(ctx, 2);
      const cx = Math.round(px / 2);
      const cy = Math.round(py / 2);
      const baseR = Math.max(3, Math.round((effect.radius * TILE_SIZE) / 2));

      ctx.globalAlpha = ALPHA_STEPS[step];

      // Expanding pixel ring at 3 discrete radii
      p.ring(cx, cy, baseR + step * 3, PAL.white);

      // Dithered burst in the entity color, first step only
      if (step === 0) {
        p.shadow(cx, cy, baseR - 1, baseR - 1, effect.color);
      }

      // 5×5 pixel "X" mark fading with the same 3 alpha steps
      p.line(cx - 2, cy - 2, cx + 2, cy + 2, PAL.white);
      p.line(cx + 2, cy - 2, cx - 2, cy + 2, PAL.white);

      ctx.globalAlpha = 1;
    }
  }

  /** Combat hit feedback: red flash on victim + yellow-white slash oriented by attack direction + sparks.
   *  Same lifecycle as renderDeathEffects (ticks and prunes world.hitEffects). */
  private renderHitEffects(ctx: CanvasRenderingContext2D, dt: number): void {
    const effects = this.world.hitEffects;
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.timer -= dt;

      if (effect.timer <= 0) {
        effects.splice(i, 1);
        continue;
      }

      const progress = 1 - (effect.timer / effect.maxTime); // 0 → 1
      const age = effect.maxTime - effect.timer;

      const px = effect.x * TILE_SIZE + TILE_SIZE / 2;
      const py = effect.y * TILE_SIZE + TILE_SIZE / 2;
      const p = new PixelPainter(ctx, 2);
      const cx = Math.round(px / 2);
      const cy = Math.round(py / 2);

      // 3-frame white impact flash on the victim (~0.05s)
      if (age < 0.06) {
        ctx.globalAlpha = 0.75;
        p.shadow(cx, cy, 5, 5, PAL.white);
      }

      // Spark squares flying out on straight lines, 1 art px + 1 art px trail.
      // Distance quantized to 3 discrete steps; alpha to 2.
      ctx.globalAlpha = progress < 0.5 ? 0.75 : 0.5;
      const dist = 2 + Math.floor(progress * 3) * 3; // 2 / 5 / 8 art px
      for (let s = 0; s < 5; s++) {
        const a = effect.angle + (s - 2) * 0.5;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const sx = cx + Math.round(ca * dist);
        const sy = cy + Math.round(sa * dist);
        const color = s % 2 === 0 ? PAL.white : PAL.glowAmber;
        p.px(sx, sy, color);
        p.px(sx - Math.round(ca * 1.5), sy - Math.round(sa * 1.5), color); // 2px trail
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Draw a deterministic cluster of food dots (leaf-green, mushroom-brown, meat-dark) whose
   *  composition mirrors the stored proportions. Flat fills only, golden-angle spiral layout
   *  seeded by item index — zero per-frame randomness. */
  private drawFoodPile(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    leaf: number,
    mushroom: number,
    meat: number,
    itemCount: number,
    pileRadius: number
  ): void {
    const total = leaf + mushroom + meat;
    if (total <= 0 || itemCount <= 0) return;

    // Split dots proportionally by stored type (meat takes the remainder)
    const nLeaf = Math.round(itemCount * (leaf / total));
    const nMush = Math.round(itemCount * (mushroom / total));

    // Dithered ground shadow under the pile (pre-rendered stamp)
    this.drawShadow(ctx, cx, cy + 2, pileRadius * 1.15 + 2, pileRadius * 0.6 + 1);

    const GOLDEN_ANGLE = 2.399963; // radians — even spiral distribution
    for (let i = 0; i < itemCount; i++) {
      const angle = i * GOLDEN_ANGLE;
      const dist = Math.sqrt((i + 0.5) / itemCount) * pileRadius;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist * 0.62; // flattened ellipse → pseudo-3D mound
      const size = 2 + Math.round(pileRand(i * 7 + 13)); // 2 or 3 canvas px squares

      const type: 'leaf' | 'mushroom' | 'meat' = i < nLeaf ? 'leaf' : i < nLeaf + nMush ? 'mushroom' : 'meat';

      ctx.fillStyle = PILE_COLORS[type][Math.floor(pileRand(i * 11 + 29) * 2)];
      ctx.fillRect(Math.round(cx + dx) - 1, Math.round(cy + dy) - 1, size, size);
    }
  }

  private drawAnt(
    ctx: CanvasRenderingContext2D,
    tileX: number,
    tileY: number,
    facing: number,
    legPhase: number,
    role: AntRole,
    isSelected: boolean,
    isCarrying: boolean,
    isInCombat: boolean,
    isFleeing: boolean
  ): void {
    let px = tileX * TILE_SIZE + TILE_SIZE / 2;
    let py = tileY * TILE_SIZE + TILE_SIZE / 2;

    // Attack lunge — quick forward jabs along facing while in combat (sine of time, no randomness)
    if (isInCombat) {
      const lunge = Math.max(0, Math.sin(this.animationTime * 14)) * 2;
      px += Math.cos(facing) * lunge;
      py += Math.sin(facing) * lunge;
    }

    // Combat glow — dithered red stamp blinking 2-state (no smooth pulse)
    if (isInCombat && Math.floor(this.animationTime * 8) % 2 === 0) {
      this.drawGlowStamp(ctx, px, py, TILE_SIZE * 0.5, 'danger');
    }

    // Fleeing glow — dithered yellow stamp blinking 2-state
    if (isFleeing && Math.floor(this.animationTime * 10) % 2 === 0) {
      this.drawGlowStamp(ctx, px, py, TILE_SIZE * 0.35, 'yellow');
    }

    // Drop shadow — pre-rendered dither stamp, offset simulates light from upper-left
    this.drawShadow(ctx, px + 2, py + 3, TILE_SIZE * 0.28, TILE_SIZE * 0.14);

    this.spriteAtlas.drawAnt(ctx, px, py, facing, legPhase, role, isCarrying);

    // Selection feedback: 4 pixel corner brackets in the role accent color, 3Hz blink
    if (isSelected) {
      this.drawSelectionBrackets(ctx, px, py, TILE_SIZE * 0.5, RenderSystem.ROLE_BRACKET_KEY[role]);
    }
  }

  private drawFood(ctx: CanvasRenderingContext2D, tileX: number, tileY: number, entityId: number): void {
    const px = tileX * TILE_SIZE + TILE_SIZE / 2;
    const py = tileY * TILE_SIZE + TILE_SIZE / 2;

    const foodSource = this.world.getComponent<FoodSourceComponent>(entityId, COMPONENT.FOOD_SOURCE);
    const amount = foodSource ? foodSource.amount : 100;

    // Check if it's a giant mushroom
    if (foodSource?.resourceType === 'giant_mushroom') {
      // Drop shadow for giant mushroom (pre-rendered dither stamp)
      this.drawShadow(ctx, px + 2.5, py + 3.5, TILE_SIZE * 0.6, TILE_SIZE * 0.25);

      this.spriteAtlas.drawGiantMushroom(ctx, px, py);
    } else {
      // Normal food rendering
      const sizeLevel = Math.min(4, Math.floor(amount / 100 * 5));

      // Determine variant based on resource type
      let variant = entityId % 2; // Default: leaves (0 or 1)
      if (foodSource?.resourceType === 'mushroom') {
        variant = 2;
      } else if (foodSource?.resourceType === 'beetle_meat') {
        variant = 3;
      } else if (foodSource?.resourceType === 'cricket_meat') {
        variant = 4;
      }

      const rotation = (entityId * 1.234) % (Math.PI * 2);

      // Drop shadow (pre-rendered dither stamp)
      const sizeFact = Math.max(0.3, Math.min(1, amount / 100));
      this.drawShadow(ctx, px + 1.5, py + 2.5, TILE_SIZE * 0.22 * sizeFact, TILE_SIZE * 0.12 * sizeFact);

      this.spriteAtlas.drawFood(ctx, px, py, variant, sizeLevel, rotation);
    }

    // Selection feedback: amber corner brackets, 3Hz blink
    const selectable = this.world.getComponent<SelectableComponent>(entityId, COMPONENT.SELECTABLE);
    if (selectable && selectable.selected) {
      const sizeFactor = Math.max(0.3, Math.min(1, amount / 100));
      const half = TILE_SIZE * 0.35 * sizeFactor * 1.4 + 3;
      this.drawSelectionBrackets(ctx, px, py, half, 'amber');
    }
  }

  private drawNest(ctx: CanvasRenderingContext2D, tileX: number, tileY: number, radius: number, isBeingRobbed: boolean = false, nest?: NestComponent): void {
    const px = tileX * TILE_SIZE + TILE_SIZE / 2;
    const py = tileY * TILE_SIZE + TILE_SIZE / 2;

    // Drop shadow — larger, proportional to nest size (pre-rendered dither stamp)
    const nestR = radius * TILE_SIZE * 1.3;
    this.drawShadow(ctx, px + 4, py + 5, nestR * 0.85, nestR * 0.35);

    // ROBBERY WARNING — blinking pixel ring + expanding ring at 3 discrete radii
    if (isBeingRobbed) {
      const rp = new PixelPainter(ctx, 2);
      const rcx = Math.round(px / 2);
      const rcy = Math.round(py / 2);
      const rArt = Math.round((nestR * 0.9) / 2);

      if (Math.floor(this.animationTime * 6) % 2 === 0) {
        ctx.globalAlpha = 0.75;
        rp.ring(rcx, rcy, rArt, PAL.dangerRed);
      }

      const ringStep = Math.floor(((this.animationTime * 1.5) % 1) * 3); // 0 / 1 / 2
      ctx.globalAlpha = ALPHA_STEPS[ringStep];
      rp.ring(rcx, rcy, rArt + 2 + ringStep * 4, PAL.dangerRed);
      ctx.globalAlpha = 1;
    }

    this.spriteAtlas.drawNest(ctx, px, py, radius);

    // Food stockpile next to the mound — dot count + pile radius scale with stored amounts,
    // so the player can tell 10 food from 400 at a glance (drawn after the mound to stay visible)
    if (nest) {
      const totalStored = nest.foodStored + nest.mushroomStored + nest.meatStored;
      if (totalStored > 0) {
        const items = Math.min(NEST_PILE_MAX_ITEMS, Math.max(1, Math.round(totalStored / NEST_PILE_UNITS_PER_ITEM)));
        const fill = items / NEST_PILE_MAX_ITEMS; // 0 → 1
        const pileRadius = TILE_SIZE * (0.28 + fill * 0.55);
        // Pile sits at the lower-right of the mound, clear of the entrance animation
        const pileX = px + nestR * 0.85;
        const pileY = py + nestR * 0.45;
        this.drawFoodPile(ctx, pileX, pileY, nest.foodStored, nest.mushroomStored, nest.meatStored, items, pileRadius);
      }
    }

    // Ant activity animation near entrance (stays procedural - animated)
    const r = radius * TILE_SIZE * 1.3;
    const woodR = r * 0.65;
    const holeH = woodR * 0.3;
    const activityPhase = this.animationTime * 2;

    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = PAL.chitin[0];
    for (let i = 0; i < 4; i++) {
      const t = (activityPhase + i * 1.5) % 6;
      const progress = t / 6;
      const ax = (progress - 0.5) * woodR * 1.2;
      const ay = -r * 0.08 + Math.sin(progress * Math.PI) * -holeH * 0.8;
      // Quantized 2-level alpha; movement stays smooth, render is a square pixel ant
      ctx.globalAlpha = progress < 0.1 || progress > 0.9 ? 0.25 : 0.5;
      ctx.fillRect(Math.round(ax) - 2, Math.round(ay) - 1, 4, 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawBeetle(
    ctx: CanvasRenderingContext2D,
    tileX: number,
    tileY: number,
    facing: number,
    legPhase: number,
    entityId: number,
    isAttacking: boolean = false
  ): void {
    let px = tileX * TILE_SIZE + TILE_SIZE / 2;
    let py = tileY * TILE_SIZE + TILE_SIZE / 2;

    // Attack lunge — forward jabs along facing while attacking (sine of time, no randomness)
    if (isAttacking) {
      const lunge = Math.max(0, Math.sin(this.animationTime * 12)) * 2.5;
      px += Math.cos(facing) * lunge;
      py += Math.sin(facing) * lunge;
    }

    // Combat glow for attacking beetles — dithered stamp, 2-state blink
    if (isAttacking && Math.floor(this.animationTime * 8) % 2 === 0) {
      this.drawGlowStamp(ctx, px, py, TILE_SIZE * 0.55, 'danger');
    }

    // Drop shadow — slightly larger than ant shadow (pre-rendered dither stamp)
    this.drawShadow(ctx, px + 2.5, py + 4, TILE_SIZE * 0.32, TILE_SIZE * 0.16);

    this.spriteAtlas.drawBeetle(ctx, px, py, facing, legPhase);

    // Health bar
    const health = this.world.getComponent<HealthComponent>(entityId, COMPONENT.HEALTH);
    if (health) {
      this.drawHealthBar(ctx, px, py, health.current, health.max);
    }
  }

  private drawBeetleDen(
    ctx: CanvasRenderingContext2D,
    tileX: number,
    tileY: number,
    entityId: number
  ): void {
    const px = tileX * TILE_SIZE + TILE_SIZE / 2;
    const py = tileY * TILE_SIZE + TILE_SIZE / 2;

    // Drop shadow (pre-rendered dither stamp)
    this.drawShadow(ctx, px + 3, py + 5, TILE_SIZE * 0.5, TILE_SIZE * 0.25);

    this.spriteAtlas.drawBeetleDen(ctx, px, py);

    // Health bar — always visible for dens (player needs to see HP)
    const health = this.world.getComponent<HealthComponent>(entityId, COMPONENT.HEALTH);
    if (health) {
      this.drawHealthBar(ctx, px, py, health.current, health.max, true);
    }
  }

  private drawCricket(
    ctx: CanvasRenderingContext2D,
    tileX: number,
    tileY: number,
    facing: number,
    legPhase: number,
    entityId: number,
    isAttacking: boolean = false,
    isStealing: boolean = false
  ): void {
    const px = tileX * TILE_SIZE + TILE_SIZE / 2;
    const py = tileY * TILE_SIZE + TILE_SIZE / 2;

    // Combat glow for attacking crickets — boss-sized dithered stamp, 2-state blink
    if (isAttacking && Math.floor(this.animationTime * 8) % 2 === 0) {
      this.drawGlowStamp(ctx, px, py, TILE_SIZE * 2.2, 'danger');
    }

    // STEALING glow — amber dithered stamp, slower 2-state blink
    if (isStealing) {
      if (Math.floor(this.animationTime * 5) % 2 === 0) {
        this.drawGlowStamp(ctx, px, py, TILE_SIZE * 2.5, 'amber');
      }

      // Food chunks being siphoned — square pixels, smooth motion, quantized alpha
      ctx.fillStyle = PAL.glowAmber;
      for (let i = 0; i < 6; i++) {
        const phase = (this.animationTime * 2 + i * 1.05) % (Math.PI * 2);
        const dist = TILE_SIZE * (1.5 + Math.sin(phase) * 0.8);
        const angle = phase * 1.3 + i * 0.9;
        const fx = Math.round(px + Math.cos(angle) * dist);
        const fy = Math.round(py + Math.sin(angle) * dist);
        ctx.globalAlpha = Math.sin(phase * 2) > 0 ? 0.5 : 0.25;
        ctx.fillRect(fx - 2, fy - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
    }

    // Drop shadow — massive, matching 2.5 tile radius (pre-rendered dither stamp)
    this.drawShadow(ctx, px + 7, py + 10, TILE_SIZE * 1.4, TILE_SIZE * 0.7);

    this.spriteAtlas.drawCricket(ctx, px, py, facing, legPhase);

    // Health bar — segmented pixel bar at 2× scale, positioned higher for the big sprite
    const health = this.world.getComponent<HealthComponent>(entityId, COMPONENT.HEALTH);
    if (health && health.current < health.max) {
      this.drawHealthBar(ctx, px, py, health.current, health.max, false, 2, -TILE_SIZE * 2.8);
    }
  }

  private drawCricketDen(
    ctx: CanvasRenderingContext2D,
    tileX: number,
    tileY: number,
    entityId: number
  ): void {
    const px = tileX * TILE_SIZE + TILE_SIZE / 2;
    const py = tileY * TILE_SIZE + TILE_SIZE / 2;

    // Drop shadow (pre-rendered dither stamp)
    this.drawShadow(ctx, px + 3, py + 5, TILE_SIZE * 0.5, TILE_SIZE * 0.25);

    this.spriteAtlas.drawCricketDen(ctx, px, py);

    // Health bar — always visible for dens (player needs to see HP)
    const health = this.world.getComponent<HealthComponent>(entityId, COMPONENT.HEALTH);
    if (health) {
      this.drawHealthBar(ctx, px, py, health.current, health.max, true);
    }
  }
}
