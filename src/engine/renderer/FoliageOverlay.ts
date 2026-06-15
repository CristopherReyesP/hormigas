import type { TileGrid } from '../../simulation/world/TileGrid';
import type { Camera } from '../../engine/camera/Camera';
import { TerrainType } from '../../simulation/world/types';
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT } from '../../shared/constants';
import { PAL, hash2, pick } from './pixelart/palette';
import { PixelPainter } from './pixelart/PixelPainter';

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

/**
 * Pre-rendered pixel-art foliage overlay for ambient decoration.
 * Renders once to an offscreen canvas, blitted each frame between terrain and
 * entities. All colors from PAL; placement deterministic via hash2.
 * Items may overlap tile borders for an organic feel.
 */
export class FoliageOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private grid: TileGrid;

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

    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const tile = this.grid.getTile(x, y)!;
        const p = new PixelPainter(this.ctx, SCALE).at(x * TILE_SIZE, y * TILE_SIZE);

        // Pixel bushes on grass tiles (~1 every 6 tiles)
        if (tile.terrain === TerrainType.Grass && hash2(x * 3 + 1, y * 5 + 2) < 1 / 6) {
          this.drawBush(p, x, y);
        }

        // Fallen leaves on dirt tiles
        if (tile.terrain === TerrainType.Dirt && hash2(x * 7 + 3, y * 11 + 1) < 0.13) {
          this.drawLeaves(p, x, y);
        }

        // Twigs on dirt/sand tiles
        if (
          (tile.terrain === TerrainType.Dirt || tile.terrain === TerrainType.Sand) &&
          hash2(x * 13 + 5, y * 17 + 4) < 0.1
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
   * Pixel bush: 2-3 clustered discs in grass[0..2], light lobe up-left,
   * dark lobe down-right, PAL.outline along the bottom edge.
   */
  private drawBush(p: PixelPainter, x: number, y: number): void {
    // Jittered center — may overlap tile borders (organic feel)
    const cx = 8 + Math.floor(hash2(x * 29, y * 31) * 11) - 5;
    const cy = 8 + Math.floor(hash2(x * 37, y * 41) * 11) - 5;
    const r = hash2(x * 43, y * 47) < 0.5 ? 3 : 2;

    p.disc(cx, cy, r, PAL.grass[1]);
    p.disc(cx + r - 1, cy + 1, r - 1, PAL.grass[0]); // shade lobe (down-right)
    p.disc(cx - r + 1, cy - 1, r - 1, PAL.grass[2]); // light lobe (up-left)

    // Grounded bottom edge
    p.hline(cx - (r - 1), cy + r, 2 * r - 1, PAL.outline);

    // Top highlight pixels
    p.px(cx - 1, cy - r, PAL.grass[2]);
    if (hash2(x * 53, y * 59) < 0.5) p.px(cx, cy - r + 1, PAL.grass[3]);
  }

  /**
   * Fallen leaves: 1-3 hand-made 2×3 px leaf shapes, 4 orientations,
   * in dried wood/soil tones with the occasional still-green one.
   */
  private drawLeaves(p: PixelPainter, x: number, y: number): void {
    const count = 1 + Math.floor(hash2(x * 61, y * 67) * 3);
    const pairs: ReadonlyArray<readonly [string, string]> = [
      [PAL.wood[2], PAL.wood[1]],
      [PAL.soil[3], PAL.soil[1]],
      [PAL.leaf[1], PAL.leaf[0]],
    ];

    for (let i = 0; i < count; i++) {
      const lx = 2 + Math.floor(hash2(x * 71 + i * 5, y * 73 + i * 3) * (ART - 2));
      const ly = 2 + Math.floor(hash2(x * 79 + i * 7, y * 83 + i * 11) * (ART - 2));
      const shape = pick(LEAF_SHAPES, hash2(x * 89 + i, y * 97 + i * 3));
      const colors = pick(pairs, hash2(x * 101 + i * 3, y * 103 + i * 7));

      for (const [dx, dy, ci] of shape) {
        p.px(lx + dx, ly + dy, colors[ci]);
      }
    }
  }

  /** Twig: a bent 1px line in wood[1]. */
  private drawTwig(p: PixelPainter, x: number, y: number): void {
    const sx = 3 + Math.floor(hash2(x * 107, y * 109) * (ART - 8));
    const sy = 3 + Math.floor(hash2(x * 113, y * 127) * (ART - 8));
    const dx1 = 2 + Math.floor(hash2(x * 131, y * 137) * 3);
    const dy1 = Math.floor(hash2(x * 139, y * 149) * 3) - 1;
    const dx2 = 1 + Math.floor(hash2(x * 151, y * 157) * 3);
    const dy2 = hash2(x * 163, y * 167) < 0.5 ? -2 : 2;

    p.line(sx, sy, sx + dx1, sy + dy1, PAL.wood[1]);
    p.line(sx + dx1, sy + dy1, sx + dx1 + dx2, sy + dy1 + dy2, PAL.wood[1]);
  }

  /** Rock: 3-6 px stone disc with 1px outline and top-left highlight. */
  private drawRock(p: PixelPainter, x: number, y: number): void {
    const cx = 8 + Math.floor(hash2(x * 173, y * 179) * 9) - 4;
    const cy = 8 + Math.floor(hash2(x * 181, y * 191) * 9) - 4;
    const r = hash2(x * 193, y * 197) < 0.5 ? 1 : 1.5;

    p.disc(cx, cy, r + 1, PAL.outline); // 1px outline halo
    p.disc(cx, cy, r, PAL.stone[1]);
    p.px(cx - 1, cy - 1, PAL.stone[3]); // top-left highlight
  }

  /**
   * Draw the foliage overlay to the provided context
   */
  draw(ctx: CanvasRenderingContext2D, camera: Camera | null): void {
    if (!camera) {
      ctx.drawImage(this.canvas, 0, 0);
      return;
    }

    const viewW = CANVAS_WIDTH / camera.getZoom();
    const viewH = CANVAS_HEIGHT / camera.getZoom();
    const sx = Math.max(0, Math.floor(camera.x));
    const sy = Math.max(0, Math.floor(camera.y));
    const sw = Math.min(this.canvas.width - sx, Math.ceil(viewW) + 1);
    const sh = Math.min(this.canvas.height - sy, Math.ceil(viewH) + 1);

    if (sw > 0 && sh > 0) {
      ctx.drawImage(this.canvas, sx, sy, sw, sh, sx, sy, sw, sh);
    }
  }

  /**
   * Invalidate and re-render (e.g., if terrain changes)
   */
  invalidate(): void {
    this.render();
  }
}
