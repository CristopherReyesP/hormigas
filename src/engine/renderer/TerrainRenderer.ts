import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../../shared/constants';
import type { TileGrid } from '../../simulation/world/TileGrid';
import { TerrainType } from '../../simulation/world/types';
import { TerrainDecorator } from './TerrainDecorator';
import { DECOR_SEED, patchNoise } from './alienDecor';
import { PAL, hash2 } from './pixelart/palette';
import { PixelPainter } from './pixelart/PixelPainter';
import { ChunkedCanvas } from './ChunkedCanvas';

/** Art pixels per tile side (16×16 art px @ scale 2 = 32 canvas px). */
const ART = 16;
const SCALE = TILE_SIZE / ART;

/** Material ramp per terrain type — all colors come from PAL, nowhere else. */
const RAMPS: Record<TerrainType, readonly string[]> = {
  [TerrainType.Dirt]: PAL.soil, // violet regolith
  [TerrainType.Grass]: PAL.grass, // bioluminescent moss
  [TerrainType.Sand]: PAL.dust, // pale ash flats
  [TerrainType.Stone]: PAL.stone, // alien outcrops
  [TerrainType.Water]: PAL.water, // ink pools
};

/**
 * Base fill steps per terrain, picked by large soft patches (patchNoise) so the
 * ground has lowlands and drifts instead of a flat per-tile checker. The
 * regolith spans three steps; the 5-step ramp keeps darker/lighter ones for
 * speckle, drifts and pockmark rims.
 */
const BASE_STEPS: Record<TerrainType, readonly number[]> = {
  [TerrainType.Dirt]: [1, 2, 3],
  [TerrainType.Grass]: [1, 2],
  [TerrainType.Sand]: [1, 2],
  [TerrainType.Stone]: [1, 2],
  [TerrainType.Water]: [1, 2],
};
/** Patch size in tiles */
const PATCH_CELL = 5;
/** Noise width of the dithered fringe where one patch step meets the next */
const PATCH_DITHER = 0.05;
/** 4×4 ordered-dither (Bayer) thresholds, 0-15 */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** Regolith dust drift shape: [row, first px, length] */
const DRIFT_ROWS: ReadonlyArray<readonly [number, number, number]> = [[0, 1, 3], [1, 0, 6], [2, 2, 4]];

type Edge = 'top' | 'bottom' | 'left' | 'right';

const EDGES: ReadonlyArray<{ dx: number; dy: number; edge: Edge }> = [
  { dx: 0, dy: -1, edge: 'top' },
  { dx: 0, dy: 1, edge: 'bottom' },
  { dx: -1, dy: 0, edge: 'left' },
  { dx: 1, dy: 0, edge: 'right' },
];

/** Map (edge, row-from-edge, position-along-edge) to art-pixel coords. */
function edgeCoord(edge: Edge, row: number, i: number): { ax: number; ay: number } {
  switch (edge) {
    case 'top': return { ax: i, ay: row };
    case 'bottom': return { ax: i, ay: ART - 1 - row };
    case 'left': return { ax: row, ay: i };
    case 'right': return { ax: ART - 1 - row, ay: i };
  }
}

export class TerrainRenderer {
  /** The pre-rendered terrain, in chunks (one world-sized canvas breaks iOS's canvas size limit) */
  private chunks: ChunkedCanvas;
  private decorator: TerrainDecorator;
  private shimmerTimer: number = 0;
  private shimmerPhase: number = 0;
  private grid: TileGrid;
  private waterTiles: Array<{ x: number; y: number }> = [];

  constructor(grid: TileGrid) {
    this.grid = grid;
    // Offscreen terrain pre-rendering (full WORLD size, not viewport), split in chunks
    this.chunks = new ChunkedCanvas(WORLD_WIDTH * TILE_SIZE, WORLD_HEIGHT * TILE_SIZE);

    this.decorator = new TerrainDecorator();

    this.renderTerrain();
  }

  private renderTerrain(): void {
    this.waterTiles = [];
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const tile = this.grid.getTile(x, y)!;
        if (tile.terrain === TerrainType.Water) this.waterTiles.push({ x, y });
        this.renderTile(x, y, tile.terrain);
      }
    }
  }

  /** Patch step for a noise value, offset by an ordered-dither threshold (0-15). */
  private stepFor(terrain: TerrainType, n: number, bayer: number): number {
    const steps = BASE_STEPS[terrain];
    const v = n + (bayer / 15 - 0.5) * PATCH_DITHER;
    return steps[Math.max(0, Math.min(steps.length - 1, Math.floor(v * steps.length)))];
  }

  /** Patch noise at the tile's four corners: [top-left, top-right, bottom-left, bottom-right]. */
  private cornerNoise(tileX: number, tileY: number): [number, number, number, number] {
    return [
      patchNoise(tileX, tileY, DECOR_SEED, PATCH_CELL),
      patchNoise(tileX + 1, tileY, DECOR_SEED, PATCH_CELL),
      patchNoise(tileX, tileY + 1, DECOR_SEED, PATCH_CELL),
      patchNoise(tileX + 1, tileY + 1, DECOR_SEED, PATCH_CELL),
    ];
  }

  /** Base fill step: the patch step at the tile center. */
  private baseIndex(terrain: TerrainType, tileX: number, tileY: number): number {
    const [a, b, c, d] = this.cornerNoise(tileX, tileY);
    return this.stepFor(terrain, (a + b + c + d) / 4, 7.5);
  }

  /**
   * Where a patch border crosses this tile, repaint the art pixels that fall
   * on the other step: the noise is interpolated between the tile corners and
   * Bayer-dithered, so borders come out as organic dithered contours. Tiles
   * whose corner range stays on the base step keep their flat fill.
   */
  private patchContour(p: PixelPainter, terrain: TerrainType, tileX: number, tileY: number, baseIdx: number): void {
    const [n00, n10, n01, n11] = this.cornerNoise(tileX, tileY);
    const lo = Math.min(n00, n10, n01, n11);
    const hi = Math.max(n00, n10, n01, n11);
    if (this.stepFor(terrain, lo, 0) === baseIdx && this.stepFor(terrain, hi, 15) === baseIdx) return;
    const ramp = RAMPS[terrain];
    for (let ay = 0; ay < ART; ay++) {
      const fy = (ay + 0.5) / ART;
      const left = n00 + (n01 - n00) * fy;
      const right = n10 + (n11 - n10) * fy;
      // Merge same-step runs into one rect per run (fewer fillRect calls)
      let runStart = 0;
      let runStep = baseIdx;
      for (let ax = 0; ax <= ART; ax++) {
        const step = ax === ART
          ? -1
          : this.stepFor(terrain, left + (right - left) * ((ax + 0.5) / ART), BAYER4[(ay & 3) * 4 + (ax & 3)]);
        if (step === runStep) continue;
        if (runStep !== baseIdx) p.hline(runStart, ay, ax - runStart, ramp[runStep]);
        runStart = ax;
        runStep = step;
      }
    }
  }

  private baseColor(terrain: TerrainType, tileX: number, tileY: number): string {
    return RAMPS[terrain][this.baseIndex(terrain, tileX, tileY)];
  }

  private renderTile(tileX: number, tileY: number, terrain: TerrainType): void {
    if (terrain === TerrainType.Water) {
      this.renderWaterTile(tileX, tileY);
      return;
    }

    const ctx = this.tileCtx(tileX, tileY);
    const p = new PixelPainter(ctx, SCALE).at(tileX * TILE_SIZE, tileY * TILE_SIZE);
    const ramp = RAMPS[terrain];
    const baseIdx = this.baseIndex(terrain, tileX, tileY);
    p.rect(0, 0, ART, ART, ramp[baseIdx]);
    this.patchContour(p, terrain, tileX, tileY, baseIdx);

    // 4-8 scattered single art pixels of adjacent ramp steps (opaque texture)
    const noiseCount = 4 + Math.floor(hash2(tileX * 3 + 1, tileY * 7 + 1) * 5);
    for (let i = 0; i < noiseCount; i++) {
      const hx = hash2(tileX * 17 + i * 5, tileY * 23 + i * 3);
      const hy = hash2(tileX * 29 + i * 7, tileY * 11 + i * 13);
      const stepUp = hash2(tileX + i * 41, tileY + i * 19) < 0.5;
      const idx = Math.max(0, Math.min(ramp.length - 1, baseIdx + (stepUp ? 1 : -1)));
      p.px(Math.floor(hx * ART), Math.floor(hy * ART), ramp[idx]);
    }

    // Per-material detail marks
    switch (terrain) {
      case TerrainType.Grass: this.detailGrass(p, tileX, tileY); break;
      case TerrainType.Dirt: this.detailDirt(p, tileX, tileY); break;
      case TerrainType.Sand: this.detailSand(p, tileX, tileY); break;
      case TerrainType.Stone: this.detailStone(p, tileX, tileY); break;
    }

    // Decorations (flowers, mushrooms, specks) — fully opaque pixel art
    this.decorator.decorate(terrain, ctx, tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, this.hash(tileX, tileY));

    // Dithered biome transitions + shorelines (drawn last so bands stay clean)
    this.addBiomeTransitions(p, tileX, tileY, terrain);

    if (this.grid.getTile(tileX, tileY)?.thorns) this.renderThorns(p, tileX, tileY);
  }

  /**
   * The thorn wall that seals Phase 1's zone: a dense tangle of blighted
   * bramble over the ground, curved barbs with ember-lit tips.
   */
  private renderThorns(p: PixelPainter, tileX: number, tileY: number): void {
    const T = PAL.thorns;
    p.rect(0, 0, ART, ART, T[0]);
    // Woven stems: a few thick diagonal strands per tile, hashed so the wall never repeats
    for (let i = 0; i < 4; i++) {
      const h = hash2(tileX * 13 + i * 7, tileY * 17 + i * 3);
      const start = Math.floor(h * ART);
      const rising = hash2(tileX + i * 5, tileY * 3 + i) < 0.5;
      for (let t = 0; t < ART; t++) {
        const x = t;
        const y = rising ? (start - t + ART * 2) % ART : (start + t) % ART;
        p.px(x, y, T[1 + (i % 2)]);
        if (t % 3 === 0) p.px(x, (y + 1) % ART, T[1]);
      }
    }
    // Barbs: short hooked spines with a lit edge and, now and then, an ember tip
    const barbs = 5 + Math.floor(hash2(tileX * 29, tileY * 31) * 4);
    for (let i = 0; i < barbs; i++) {
      const bx = Math.floor(hash2(tileX * 37 + i * 11, tileY * 41 + i) * (ART - 2)) + 1;
      const by = Math.floor(hash2(tileX * 43 + i, tileY * 47 + i * 13) * (ART - 3)) + 2;
      p.px(bx, by, T[3]);
      p.px(bx, by - 1, T[2]);
      p.px(bx + 1, by - 2, hash2(tileX * 53 + i, tileY * 59 + i) < 0.3 ? PAL.thornEmber : T[3]);
    }
  }

  /** Moss: low cushions — a lit 2px top over a dark 1px underside. */
  private detailGrass(p: PixelPainter, tileX: number, tileY: number): void {
    const cushions = hash2(tileX * 11 + 2, tileY * 13 + 5) < 0.5 ? 2 : 1;
    for (let i = 0; i < cushions; i++) {
      if (hash2(tileX * 37 + i, tileY * 41 + i) > 0.6) continue;
      const bx = 1 + Math.floor(hash2(tileX * 53 + i * 3, tileY * 59 + i * 7) * (ART - 3));
      const by = 1 + Math.floor(hash2(tileX * 61 + i * 11, tileY * 67 + i * 5) * (ART - 3));
      p.hline(bx, by, 2, PAL.grass[3]);
      p.px(bx + 1, by + 1, PAL.grass[0]);
    }
  }

  /**
   * Regolith: a dithered dust drift (checker of the step below), outcrop
   * pebbles, and the odd pale mineral fleck.
   */
  private detailDirt(p: PixelPainter, tileX: number, tileY: number): void {
    if (hash2(tileX * 7 + 5, tileY * 3 + 9) < 0.5) {
      const dx = Math.floor(hash2(tileX * 211 + 3, tileY * 5) * (ART - 6));
      const dy = Math.floor(hash2(tileX * 13, tileY * 227 + 1) * (ART - 3));
      const shade = PAL.soil[this.baseIndex(TerrainType.Dirt, tileX, tileY) - 1];
      // Ragged drift (rows 3/6/4 px wide), checker pixels only
      for (const [row, from, len] of DRIFT_ROWS) {
        for (let i = from; i < from + len; i++) if ((i + row) % 2 === 0) p.px(dx + i, dy + row, shade);
      }
    }
    if (hash2(tileX * 233 + 2, tileY * 239 + 7) < 0.14) {
      const fx = 1 + Math.floor(hash2(tileX * 241, tileY * 251) * (ART - 2));
      const fy = 1 + Math.floor(hash2(tileX * 257, tileY * 263) * (ART - 2));
      p.px(fx, fy, PAL.mineralFleck);
    }
    if (hash2(tileX * 331 + 3, tileY * 337 + 1) < 0.06) this.pockmark(p, tileX, tileY);
    if (hash2(tileX * 19 + 4, tileY * 31 + 8) > 0.45) return;
    const clusters = hash2(tileX * 43, tileY * 47) < 0.25 ? 2 : 1;
    for (let i = 0; i < clusters; i++) {
      const cx = 1 + Math.floor(hash2(tileX * 71 + i * 9, tileY * 73 + i * 3) * (ART - 3));
      const cy = 1 + Math.floor(hash2(tileX * 79 + i * 5, tileY * 83 + i * 11) * (ART - 3));
      p.rect(cx, cy, 2, 2, PAL.stone[1]);
      p.px(cx, cy, PAL.stone[3]);
    }
  }

  /**
   * Pockmark: a tiny impact crater in the regolith — dark bowl, rim shaded on
   * its upper-left, lit on its lower-right (light comes from the top-left).
   */
  private pockmark(p: PixelPainter, tileX: number, tileY: number): void {
    const r = hash2(tileX * 347, tileY * 349) < 0.5 ? 2 : 3;
    const ry = r - 1;
    const cx = r + 1 + Math.floor(hash2(tileX * 353, tileY * 359) * (ART - 2 * r - 2));
    const cy = ry + 1 + Math.floor(hash2(tileX * 367, tileY * 373) * (ART - 2 * ry - 2));
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const outer = (dx * dx) / ((r + 0.4) * (r + 0.4)) + (dy * dy) / ((ry + 0.4) * (ry + 0.4));
        if (outer > 1) continue;
        const inner = (dx * dx) / (r * r * 0.45) + (dy * dy) / (ry * ry * 0.45);
        const color = inner <= 1 ? PAL.soil[0] : dx + dy * 2 > 0 ? PAL.soil[4] : PAL.soil[1];
        p.px(cx + dx, cy + dy, color);
      }
    }
  }

  /** Sand: ripple rows — dithered 1px horizontal runs in the darkest sand tone. */
  private detailSand(p: PixelPainter, tileX: number, tileY: number): void {
    const rows = hash2(tileX * 23 + 6, tileY * 37 + 2) < 0.4 ? 2 : 1;
    for (let r = 0; r < rows; r++) {
      const ry = 2 + Math.floor(hash2(tileX * 89 + r * 7, tileY * 97 + r * 13) * (ART - 4));
      const rx = Math.floor(hash2(tileX * 101 + r, tileY * 103 + r) * 6);
      const len = 6 + Math.floor(hash2(tileX * 107 + r * 3, tileY * 109 + r * 5) * 5);
      for (let i = 0; i < len; i++) {
        const ax = rx + i;
        if (ax >= ART) break;
        if ((i + r) % 2 === 0) p.px(ax, ry, PAL.dust[0]);
      }
    }
  }

  /** Outcrop: 1px crack lines, a faint vein line through the rock, rare mineral glints. */
  private detailStone(p: PixelPainter, tileX: number, tileY: number): void {
    if (hash2(tileX * 13 + 9, tileY * 17 + 3) < 0.35) {
      const x0 = 2 + Math.floor(hash2(tileX * 113, tileY * 127) * (ART - 8));
      const y0 = 2 + Math.floor(hash2(tileX * 131, tileY * 137) * (ART - 8));
      const xm = x0 + 2 + Math.floor(hash2(tileX * 139, tileY * 149) * 3);
      const ym = y0 + 1 + Math.floor(hash2(tileX * 151, tileY * 157) * 3);
      const x1 = xm + 1 + Math.floor(hash2(tileX * 163, tileY * 167) * 3);
      const y1 = ym + (hash2(tileX * 173, tileY * 179) < 0.5 ? -2 : 2);
      p.line(x0, y0, xm, ym, PAL.stone[0]);
      p.line(xm, ym, Math.min(ART - 1, x1), Math.max(0, Math.min(ART - 1, y1)), PAL.stone[0]);
    }
    // Faint vein: a long shallow diagonal, broken every few pixels
    if (hash2(tileX * 269 + 1, tileY * 271 + 5) < 0.45) {
      const vy = 3 + Math.floor(hash2(tileX * 277, tileY * 281) * (ART - 6));
      const slope = hash2(tileX * 283, tileY * 293) < 0.5 ? -1 : 1;
      for (let i = 0; i < ART; i++) {
        if (hash2(tileX * 307 + i, tileY * 311) < 0.25) continue;
        p.px(i, Math.max(0, Math.min(ART - 1, vy + slope * Math.floor(i / 4))), PAL.outcropVein);
      }
    }
    // Rare mineral glint
    if (hash2(tileX * 181 + 7, tileY * 191 + 1) < 0.08) {
      const gx = 2 + Math.floor(hash2(tileX * 193, tileY * 197) * (ART - 4));
      const gy = 2 + Math.floor(hash2(tileX * 199, tileY * 211) * (ART - 4));
      p.px(gx, gy, PAL.mineralFleck);
    }
  }

  /**
   * Dithered art-pixel transition bands between compatible biomes,
   * plus pixel shorelines against water.
   */
  private addBiomeTransitions(p: PixelPainter, tileX: number, tileY: number, terrain: TerrainType): void {
    for (const { dx, dy, edge } of EDGES) {
      const neighborTile = this.grid.getTile(tileX + dx, tileY + dy);
      if (!neighborTile) continue;

      const neighborTerrain = neighborTile.terrain;
      if (neighborTerrain === terrain) continue; // patch borders are drawn per pixel

      if (neighborTerrain === TerrainType.Water) {
        // Land side of a shoreline: 1 art-px sand highlight with hash gaps
        this.drawShorelineHighlight(p, edge, tileX, tileY);
        continue;
      }

      if (this.canBlend(terrain, neighborTerrain)) {
        const neighborBase = this.baseColor(neighborTerrain, tileX + dx, tileY + dy);
        const width = 2 + (hash2(tileX * 5 + dx * 3, tileY * 5 + dy * 7) < 0.5 ? 0 : 1);
        this.ditherBand(p, edge, neighborBase, width, tileX, tileY);
      }
    }
  }

  /** All surface terrains blend with each other; water never blends. */
  private canBlend(terrain1: TerrainType, terrain2: TerrainType): boolean {
    return terrain1 !== TerrainType.Water && terrain2 !== TerrainType.Water && terrain1 !== terrain2;
  }

  /**
   * 2-3 art-pixel dithered band: row 0 at the edge is a 50% checkerboard of
   * neighbor color over the base, inner rows fade out (25%, 12.5%).
   */
  private ditherBand(p: PixelPainter, edge: Edge, neighborColor: string, width: number, tileX: number, tileY: number): void {
    for (let r = 0; r < width; r++) {
      const period = r === 0 ? 2 : r === 1 ? 4 : 8;
      const offset = Math.floor(hash2(tileX * 7 + r * 3, tileY * 13 + r * 5) * period);
      for (let i = 0; i < ART; i++) {
        if ((i + offset) % period !== 0) continue;
        const { ax, ay } = edgeCoord(edge, r, i);
        p.px(ax, ay, neighborColor);
      }
    }
  }

  /** Land side of a water edge: 1 art-px pale dust highlight, broken by hash gaps. */
  private drawShorelineHighlight(p: PixelPainter, edge: Edge, tileX: number, tileY: number): void {
    for (let i = 0; i < ART; i++) {
      if (hash2(tileX * 211 + i, tileY * 223 + i * 3) < 0.2) continue; // organic gaps
      const { ax, ay } = edgeCoord(edge, 0, i);
      p.px(ax, ay, PAL.dust[2]);
    }
  }

  /**
   * Water: ramp-banded depth. Deep water (no land cardinal neighbor) sits on
   * water[0]; shore tiles on water[1] with water[2] bands dithering toward the
   * land edges and water[3] sparkle pixels whose positions cycle with the
   * shimmer phase. No sin color offsets — animation is pure dither phase + hash.
   */
  private renderWaterTile(tileX: number, tileY: number): void {
    const p = new PixelPainter(this.tileCtx(tileX, tileY), SCALE).at(tileX * TILE_SIZE, tileY * TILE_SIZE);
    const phase = this.shimmerPhase;

    const landEdges: Edge[] = [];
    for (const { dx, dy, edge } of EDGES) {
      const neighbor = this.grid.getTile(tileX + dx, tileY + dy);
      if (neighbor && neighbor.terrain !== TerrainType.Water) landEdges.push(edge);
    }

    const deep = landEdges.length === 0;
    const base = deep ? PAL.water[0] : PAL.water[1];
    p.rect(0, 0, ART, ART, base);

    // Static surface texture: scattered adjacent-ramp pixels
    const noiseCount = 4 + Math.floor(hash2(tileX * 5 + 3, tileY * 9 + 7) * 5);
    for (let i = 0; i < noiseCount; i++) {
      const nx = Math.floor(hash2(tileX * 17 + i * 5, tileY * 23 + i * 3) * ART);
      const ny = Math.floor(hash2(tileX * 29 + i * 7, tileY * 11 + i * 13) * ART);
      p.px(nx, ny, deep ? PAL.water[1] : PAL.water[0]);
    }

    // Shore bands: water[2] at land edges, dithering inward toward base
    for (const edge of landEdges) {
      for (let i = 0; i < ART; i++) {
        const r0 = edgeCoord(edge, 0, i);
        p.px(r0.ax, r0.ay, PAL.water[2]);
        const r1 = edgeCoord(edge, 1, i);
        if ((i + phase) % 2 === 0) p.px(r1.ax, r1.ay, PAL.water[2]);
        const r2 = edgeCoord(edge, 2, i);
        if ((i + phase) % 4 === 1) p.px(r2.ax, r2.ay, PAL.water[2]);
      }

      // Sparkles: 2-3 water[3] pixels along the shore, repositioned per phase
      const sparkles = 2 + Math.floor(hash2(tileX * 31, tileY * 37) * 2);
      for (let s = 0; s < sparkles; s++) {
        const si = Math.floor(hash2(tileX * 41 + s * 7 + phase * 13, tileY * 43 + s * 5 + phase * 3) * ART);
        const sr = Math.floor(hash2(tileX * 47 + s * 3 + phase, tileY * 53 + s * 11) * 2);
        const { ax, ay } = edgeCoord(edge, sr, si);
        p.px(ax, ay, PAL.water[3]);
      }
    }

    // Open-water glints: rare single sparkle pixels, cycled by phase
    if (deep && hash2(tileX * 59 + phase * 7, tileY * 61 + phase * 11) < 0.2) {
      const gx = Math.floor(hash2(tileX * 67 + phase * 3, tileY * 71 + phase * 5) * ART);
      const gy = Math.floor(hash2(tileX * 73 + phase * 5, tileY * 79 + phase * 3) * ART);
      p.px(gx, gy, PAL.water[3]);
    }
  }

  /** The chunk a tile paints into (chunks are whole tiles wide, so exactly one) */
  private tileCtx(tileX: number, tileY: number): CanvasRenderingContext2D {
    return this.chunks.contextsFor(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE)[0];
  }

  private hash(x: number, y: number): number {
    let h = x * 374761393 + y * 668265263;
    h = ((h ^ (h >> 13)) * 1274126177) >>> 0;
    return h;
  }

  update(dt: number): void {
    this.shimmerTimer += dt;

    // Re-render water tiles periodically for shimmer effect
    if (this.shimmerTimer > 1.0) {
      this.shimmerTimer = 0;
      this.shimmerPhase = (this.shimmerPhase + 1) % 4;
      this.updateWaterShimmer();
    }
  }

  /** Cheap shimmer: only water tiles re-render, with a cycled dither phase. */
  private updateWaterShimmer(): void {
    for (const { x, y } of this.waterTiles) {
      this.renderWaterTile(x, y);
    }
  }

  /** Blit the pre-rendered terrain: the chunks the camera's view touches, or all of them */
  draw(targetCtx: CanvasRenderingContext2D, view?: { x: number; y: number; w: number; h: number }): void {
    this.chunks.draw(targetCtx, view);
  }

  invalidate(): void {
    this.renderTerrain();
  }
}
