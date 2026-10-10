import type { TileGrid } from '../../simulation/world/TileGrid';
import type { Camera } from '../../engine/camera/Camera';
import { TerrainType } from '../../simulation/world/types';
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../../shared/constants';
import { PAL, hash2, pick } from './pixelart/palette';
import { PixelPainter } from './pixelart/PixelPainter';
import { DECOR_SEED, floraAt, type FloraProp } from './alienDecor';

/** Art pixels per tile side. */
const ART = 16;
const SCALE = TILE_SIZE / ART;

/**
 * Hand-made fallen-leaf shapes (4 orientations), authored as art-pixel
 * offsets. Color index 0 = main tone, 1 = dark tip/stem tone.
 */
const LEAF_SHAPES: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  // Horizontal, tip right
  [[0, 0, 0], [1, 0, 0], [2, 0, 1], [1, 1, 0]],
  // Vertical, tip down
  [[0, 0, 0], [0, 1, 0], [0, 2, 1], [1, 1, 0]],
  // Diagonal, tip up-right
  [[1, 0, 0], [2, 0, 1], [0, 1, 0], [1, 1, 0]],
  // Diagonal, tip up-left
  [[0, 0, 1], [1, 0, 0], [1, 1, 0], [2, 1, 0]],
];

/** Shed husks on regolith: [main, dark tip] pairs (never food-frond colors). */
const HUSK_COLORS: ReadonlyArray<readonly [string, string]> = [
  [PAL.flora.fan[1], PAL.flora.fan[0]],
  [PAL.soil[3], PAL.soil[1]],
];

/**
 * Pre-rendered pixel-art foliage overlay for ambient decoration: moss
 * cushions, alien flora (pod stalks, fungal fans), husks, dry stalks, outcrop
 * rocks. Renders once to an offscreen canvas, blitted each frame between
 * terrain and entities. All colors from PAL; placement deterministic via
 * hash2 / alienDecor. Items may overlap tile borders for an organic feel.
 *
 * The cache is world-sized, so a window resize never rebuilds it: each frame
 * blits only the world rect the camera's whole canvas covers.
 */
export class FoliageOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private grid: TileGrid;
  /** World-px centers of every glowing pod, flattened [x0, y0, x1, y1, …] */
  private pods: number[] = [];

  constructor(grid: TileGrid) {
    this.grid = grid;

    // Create offscreen canvas (same size as world)
    this.canvas = document.createElement('canvas');
    this.canvas.width = WORLD_WIDTH * TILE_SIZE;
    this.canvas.height = WORLD_HEIGHT * TILE_SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;

    this.render();
  }

  private render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.pods = [];

    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const tile = this.grid.getTile(x, y)!;
        const p = new PixelPainter(this.ctx, SCALE).at(x * TILE_SIZE, y * TILE_SIZE);

        // Glow-moss cushions on moss tiles (~1 every 7 tiles)
        if (tile.terrain === TerrainType.Grass && hash2(x * 3 + 1, y * 5 + 2) < 1 / 7) {
          this.drawCushion(p, x, y);
        }

        // Outcrop boulders strewn on the regolith (rare)
        if (tile.terrain === TerrainType.Dirt && hash2(x * 41 + 9, y * 43 + 2) < 0.025) {
          this.drawRock(p, x, y, true);
        }

        // Alien flora: pod stalks and fungal fans (moss lush, regolith sparse)
        const prop = floraAt(x, y, tile.terrain, DECOR_SEED);
        if (prop) {
          if (prop.kind === 'podStalk') this.drawPodStalk(p, prop, x, y);
          else this.drawFungalFan(p, prop);
        }

        // Shed husks on regolith tiles
        if (tile.terrain === TerrainType.Dirt && hash2(x * 7 + 3, y * 11 + 1) < 0.05) {
          this.drawHusks(p, x, y);
        }

        // Dry stalks on regolith/ash tiles
        if (
          (tile.terrain === TerrainType.Dirt || tile.terrain === TerrainType.Sand) &&
          hash2(x * 13 + 5, y * 17 + 4) < 0.04
        ) {
          this.drawTwig(p, x, y);
        }

        // Decorative rocks at Stone↔Grass borders
        if (tile.terrain === TerrainType.Stone || tile.terrain === TerrainType.Grass) {
          const neighbors = this.grid.getNeighbors(x, y);
          const hasGrassNeighbor = neighbors.some(n => n.tile.terrain === TerrainType.Grass);
          const hasStoneNeighbor = neighbors.some(n => n.tile.terrain === TerrainType.Stone);

          if (hasGrassNeighbor && hasStoneNeighbor && hash2(x * 19 + 7, y * 23 + 6) < 0.25) {
            this.drawRock(p, x, y);
          }
        }
      }
    }
  }

  /**
   * Glow-moss cushion: a low flat lobe in the moss ramp (lit top-left, shaded
   * bottom-right, grounded by an outline) studded with pale glowing beads.
   */
  private drawCushion(p: PixelPainter, x: number, y: number): void {
    // Jittered center — may overlap tile borders (organic feel)
    const cx = 8 + Math.floor(hash2(x * 29, y * 31) * 11) - 5;
    const cy = 8 + Math.floor(hash2(x * 37, y * 41) * 11) - 5;
    const rx = hash2(x * 43, y * 47) < 0.5 ? 4 : 3;
    const ry = rx - 2;

    p.hline(cx - rx + 1, cy + ry + 1, 2 * rx - 1, PAL.outline); // grounded edge
    p.ellipse(cx, cy, rx, ry, PAL.grass[1]);
    p.ellipse(cx + 1, cy + 1, rx - 1, ry - 0.5, PAL.grass[0]); // shade (down-right)
    p.ellipse(cx - 1, cy - 1, rx - 2, Math.max(1, ry - 1), PAL.grass[2]); // light (up-left)
    p.dither(cx - rx + 2, cy - ry, rx - 1, 1, PAL.grass[3], PAL.grass[2]);

    // Glowing beads along the crown
    const beads = 2 + Math.floor(hash2(x * 53, y * 59) * 3);
    for (let i = 0; i < beads; i++) {
      const bx = cx - rx + 1 + Math.floor(hash2(x * 61 + i, y * 67) * (2 * rx - 1));
      const by = cy - ry + Math.floor(hash2(x * 71, y * 73 + i) * ry);
      p.px(bx, by, PAL.mossGlow);
    }
  }

  /**
   * Thin stalk with 1-3 soft cream pods (2×2: a top pod plus side pods on
   * alternating sides), a dark root foot. Pod centers feed the night glow.
   */
  private drawPodStalk(p: PixelPainter, f: FloraProp, x: number, y: number): void {
    const { ax, ay, size: h } = f;
    const side = f.flip ? -1 : 1;
    p.px(ax - side, ay, PAL.flora.stalk[0]); // root foot
    p.vline(ax, ay - h + 1, h, PAL.flora.stalk[1]);
    p.px(ax + side, ay, PAL.flora.stalk[0]); // shade under the lean
    // Pod top-left corners: one capping the stalk, then side pods on alternate sides
    const pods: Array<[number, number]> = [[ax - (side < 0 ? 1 : 0), ay - h - 2]];
    if (f.pods >= 2) pods.push([side > 0 ? ax + 1 : ax - 2, ay - h + 1]);
    if (f.pods >= 3) pods.push([side > 0 ? ax - 2 : ax + 1, ay - h + 3]);
    for (const [px, py] of pods) {
      p.rect(px, py, 2, 2, PAL.flora.pod[1]);
      p.px(px, py, PAL.flora.pod[2]); // lit top-left
      p.px(px + 1, py + 1, PAL.flora.pod[0]); // shaded bottom-right
      this.pods.push(x * TILE_SIZE + (px + 1) * SCALE, y * TILE_SIZE + (py + 1) * SCALE);
    }
  }

  /**
   * Fungal fan: a stepped mauve shelf (widest at the bottom), lit top-left,
   * gills dithered along its underside, seated on a dark ground line.
   */
  private drawFungalFan(p: PixelPainter, f: FloraProp): void {
    const { ax, ay, size: w } = f;
    const left = ax - Math.floor(w / 2);
    const skew = f.flip ? 1 : 0; // upper shelves lean toward one side
    p.hline(left - 1, ay, w + 2, PAL.outline); // seated on the ground
    p.hline(left, ay - 1, w, PAL.flora.fan[0]);
    for (let i = 1; i < w; i += 2) p.px(left + i, ay - 1, PAL.flora.fan[1]); // gills
    p.hline(left, ay - 2, w, PAL.flora.fan[1]);
    p.hline(left + skew, ay - 3, w - 1, PAL.flora.fan[1]);
    p.hline(left + 1 + skew, ay - 4, Math.max(1, w - 3), PAL.flora.fan[2]);
    p.px(left + skew, ay - 3, PAL.flora.fan[2]); // top-left catch-light
    p.px(left + w - 1, ay - 2, PAL.flora.fan[0]); // shaded right lip
  }

  /**
   * Shed husks: 1-3 hand-made 2×3 px husk shapes, 4 orientations,
   * in mauve and pale regolith tones (never the food-frond color).
   */
  private drawHusks(p: PixelPainter, x: number, y: number): void {
    const count = 1 + Math.floor(hash2(x * 61, y * 67) * 3);

    for (let i = 0; i < count; i++) {
      const lx = 2 + Math.floor(hash2(x * 71 + i * 5, y * 73 + i * 3) * (ART - 2));
      const ly = 2 + Math.floor(hash2(x * 79 + i * 7, y * 83 + i * 11) * (ART - 2));
      const shape = pick(LEAF_SHAPES, hash2(x * 89 + i, y * 97 + i * 3));
      const colors = pick(HUSK_COLORS, hash2(x * 101 + i * 3, y * 103 + i * 7));

      for (const [dx, dy, ci] of shape) {
        p.px(lx + dx, ly + dy, colors[ci]);
      }
    }
  }

  /** Dry stalk: a bent 1px line in the flora stalk tone. */
  private drawTwig(p: PixelPainter, x: number, y: number): void {
    const sx = 3 + Math.floor(hash2(x * 107, y * 109) * (ART - 8));
    const sy = 3 + Math.floor(hash2(x * 113, y * 127) * (ART - 8));
    const dx1 = 2 + Math.floor(hash2(x * 131, y * 137) * 3);
    const dy1 = Math.floor(hash2(x * 139, y * 149) * 3) - 1;
    const dx2 = 1 + Math.floor(hash2(x * 151, y * 157) * 3);
    const dy2 = hash2(x * 163, y * 167) < 0.5 ? -2 : 2;

    p.line(sx, sy, sx + dx1, sy + dy1, PAL.flora.stalk[1]);
    p.line(sx + dx1, sy + dy1, sx + dx1 + dx2, sy + dy1 + dy2, PAL.flora.stalk[1]);
  }

  /** Outcrop rock: 3-6 px disc (boulders: 5-8 px) with 1px outline, top-left highlight and a vein px. */
  private drawRock(p: PixelPainter, x: number, y: number, boulder = false): void {
    const cx = 8 + Math.floor(hash2(x * 173, y * 179) * 9) - 4;
    const cy = 8 + Math.floor(hash2(x * 181, y * 191) * 9) - 4;
    const r = (hash2(x * 193, y * 197) < 0.5 ? 1 : 1.5) + (boulder ? 1.5 : 0);

    p.disc(cx, cy, r + 1, PAL.outline); // 1px outline halo
    p.disc(cx, cy, r, PAL.stone[1]);
    p.px(cx - 1, cy - 1, PAL.stone[3]); // top-left highlight
    p.px(cx, cy, PAL.outcropVein);
  }

  /**
   * Draw the foliage overlay to the provided context
   */
  draw(ctx: CanvasRenderingContext2D, camera: Camera | null): void {
    if (!camera) {
      ctx.drawImage(this.canvas, 0, 0);
      return;
    }

    const view = camera.getCanvasWorldRect();
    const sx = Math.max(0, Math.floor(view.x));
    const sy = Math.max(0, Math.floor(view.y));
    const sw = Math.min(this.canvas.width - sx, Math.ceil(view.w) + 1);
    const sh = Math.min(this.canvas.height - sy, Math.ceil(view.h) + 1);

    if (sw > 0 && sh > 0) {
      ctx.drawImage(this.canvas, sx, sy, sw, sh, sx, sy, sw, sh);
    }
  }

  /**
   * Night bioluminescence for the flora pods (world space, caller sets the
   * additive blend and alpha). Only pods on tiles `isShown` lets through, and
   * only those inside the camera view, are drawn.
   */
  drawPodGlow(ctx: CanvasRenderingContext2D, camera: Camera, isShown: (tileX: number, tileY: number) => boolean): void {
    const view = camera.getCanvasWorldRect();
    const minX = view.x - TILE_SIZE;
    const minY = view.y - TILE_SIZE;
    const maxX = view.x + view.w + TILE_SIZE;
    const maxY = view.y + view.h + TILE_SIZE;
    const alpha = ctx.globalAlpha;
    for (let i = 0; i < this.pods.length; i += 2) {
      const x = this.pods[i];
      const y = this.pods[i + 1];
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (!isShown(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE))) continue;
      ctx.globalAlpha = alpha * 0.35; // soft 3-art-px halo
      ctx.fillStyle = PAL.flora.pod[1];
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.globalAlpha = alpha; // lit core
      ctx.fillStyle = PAL.flora.pod[2];
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    ctx.globalAlpha = alpha;
  }

  /**
   * Invalidate and re-render (e.g., if terrain changes)
   */
  invalidate(): void {
    this.render();
  }
}
