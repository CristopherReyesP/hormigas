import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../../shared/constants';
import type { TileGrid } from '../../simulation/world/TileGrid';
import { TerrainType } from '../../simulation/world/types';
import { TerrainDecorator } from './TerrainDecorator';
import { PAL, hash2 } from './pixelart/palette';
import { PixelPainter } from './pixelart/PixelPainter';

/** Art pixels per tile side (16×16 art px @ scale 2 = 32 canvas px). */
const ART = 16;
const SCALE = TILE_SIZE / ART;

/** Material ramp per terrain type — all colors come from PAL, nowhere else. */
const RAMPS: Record<TerrainType, readonly string[]> = {
  [TerrainType.Dirt]: PAL.soil,
  [TerrainType.Grass]: PAL.grass,
  [TerrainType.Sand]: PAL.sand,
  [TerrainType.Stone]: PAL.stone,
  [TerrainType.Water]: PAL.water,
};

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
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private decorator: TerrainDecorator;
  private shimmerTimer: number = 0;
  private shimmerPhase: number = 0;
  private grid: TileGrid;
  private waterTiles: Array<{ x: number; y: number }> = [];

  constructor(grid: TileGrid) {
    this.grid = grid;
    // Create offscreen canvas for terrain pre-rendering (full WORLD size, not viewport)
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = WORLD_WIDTH * TILE_SIZE;
    this.offscreenCanvas.height = WORLD_HEIGHT * TILE_SIZE;

    const ctx = this.offscreenCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2d context for terrain canvas');
    this.offscreenCtx = ctx;
    this.offscreenCtx.imageSmoothingEnabled = false;

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

  /** Base fill color: ramp step 1 or 2 picked deterministically per tile. */
  private baseColor(terrain: TerrainType, tileX: number, tileY: number): string {
    const ramp = RAMPS[terrain];
    return hash2(tileX, tileY) < 0.5 ? ramp[1] : ramp[2];
  }

  private renderTile(tileX: number, tileY: number, terrain: TerrainType): void {
    if (terrain === TerrainType.Water) {
      this.renderWaterTile(tileX, tileY);
      return;
    }

    const p = new PixelPainter(this.offscreenCtx, SCALE).at(tileX * TILE_SIZE, tileY * TILE_SIZE);
    const ramp = RAMPS[terrain];
    const baseIdx = hash2(tileX, tileY) < 0.5 ? 1 : 2;
    p.rect(0, 0, ART, ART, ramp[baseIdx]);

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
    this.decorator.decorate(terrain, this.offscreenCtx, tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, this.hash(tileX, tileY));

    // Dithered biome transitions + shorelines (drawn last so bands stay clean)
    this.addBiomeTransitions(p, tileX, tileY, terrain);
  }

  /** Grass: occasional 1×2 blade marks in the lightest grass tone. */
  private detailGrass(p: PixelPainter, tileX: number, tileY: number): void {
    const blades = hash2(tileX * 11 + 2, tileY * 13 + 5) < 0.5 ? 2 : 1;
    for (let i = 0; i < blades; i++) {
      if (hash2(tileX * 37 + i, tileY * 41 + i) > 0.6) continue;
      const bx = 1 + Math.floor(hash2(tileX * 53 + i * 3, tileY * 59 + i * 7) * (ART - 2));
      const by = 1 + Math.floor(hash2(tileX * 61 + i * 11, tileY * 67 + i * 5) * (ART - 3));
      p.vline(bx, by, 2, PAL.grass[3]);
    }
  }

  /** Dirt: pebble clusters — 2×2 stone with a 1px top-left highlight. */
  private detailDirt(p: PixelPainter, tileX: number, tileY: number): void {
    if (hash2(tileX * 19 + 4, tileY * 31 + 8) > 0.45) return;
    const clusters = hash2(tileX * 43, tileY * 47) < 0.25 ? 2 : 1;
    for (let i = 0; i < clusters; i++) {
      const cx = 1 + Math.floor(hash2(tileX * 71 + i * 9, tileY * 73 + i * 3) * (ART - 3));
      const cy = 1 + Math.floor(hash2(tileX * 79 + i * 5, tileY * 83 + i * 11) * (ART - 3));
      p.rect(cx, cy, 2, 2, PAL.stone[1]);
      p.px(cx, cy, PAL.stone[3]);
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
        if ((i + r) % 2 === 0) p.px(ax, ry, PAL.sand[0]);
      }
    }
  }

  /** Stone: 1px crack lines (darkest stone) + rare white mineral glints. */
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
    // Rare mineral glint
    if (hash2(tileX * 181 + 7, tileY * 191 + 1) < 0.08) {
      const gx = 2 + Math.floor(hash2(tileX * 193, tileY * 197) * (ART - 4));
      const gy = 2 + Math.floor(hash2(tileX * 199, tileY * 211) * (ART - 4));
      p.px(gx, gy, PAL.white);
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
      if (neighborTerrain === terrain) continue;

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

  /** Land side of a water edge: 1 art-px sand[2] highlight, broken by hash gaps. */
  private drawShorelineHighlight(p: PixelPainter, edge: Edge, tileX: number, tileY: number): void {
    for (let i = 0; i < ART; i++) {
      if (hash2(tileX * 211 + i, tileY * 223 + i * 3) < 0.2) continue; // organic gaps
      const { ax, ay } = edgeCoord(edge, 0, i);
      p.px(ax, ay, PAL.sand[2]);
    }
  }

  /**
   * Water: ramp-banded depth. Deep water (no land cardinal neighbor) sits on
   * water[0]; shore tiles on water[1] with water[2] bands dithering toward the
   * land edges and water[3] sparkle pixels whose positions cycle with the
   * shimmer phase. No sin color offsets — animation is pure dither phase + hash.
   */
  private renderWaterTile(tileX: number, tileY: number): void {
    const p = new PixelPainter(this.offscreenCtx, SCALE).at(tileX * TILE_SIZE, tileY * TILE_SIZE);
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

  draw(targetCtx: CanvasRenderingContext2D): void {
    // Blit the entire pre-rendered terrain to the target canvas
    targetCtx.drawImage(this.offscreenCanvas, 0, 0);
  }

  invalidate(): void {
    this.renderTerrain();
  }
}
