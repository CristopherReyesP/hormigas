import { TerrainType } from '../../simulation/world/types';
import { PAL, hash2, pick } from './pixelart/palette';
import { PixelPainter } from './pixelart/PixelPainter';

/** Art pixels per tile side. */
const ART = 16;

/**
 * TerrainDecorator — opaque pixel-art decorations on terrain tiles.
 * Every color comes from PAL ramps; placement is deterministic via the tile
 * hash (no Math.random, no alpha, no gradients, no arcs).
 */
export class TerrainDecorator {
  /** Derive a deterministic [0,1) value from the tile hash and a salt. */
  private h(hash: number, salt: number): number {
    return hash2((hash & 0x7fff) + salt * 31, (hash >>> 15) + salt * 7);
  }

  private artPos(hash: number, salt: number, min: number, max: number): number {
    return min + Math.floor(this.h(hash, salt) * (max - min));
  }

  /**
   * Moss: tiny spore heads — 1 pale pod or lit moss pixel on a 1px dark
   * stalk — plus occasional dark tufts. Fully opaque.
   */
  private decorateGrass(p: PixelPainter, hash: number): void {
    // Spore heads on about a third of the moss tiles, sometimes two per tile
    if (this.h(hash, 1) < 0.35) {
      const heads = this.h(hash, 2) < 0.3 ? 2 : 1;
      for (let i = 0; i < heads; i++) {
        const fx = this.artPos(hash, 10 + i * 4, 1, ART - 1);
        const fy = this.artPos(hash, 11 + i * 4, 1, ART - 2);
        const head = pick([PAL.flora.pod[1], PAL.grass[3]], this.h(hash, 12 + i * 4));
        p.px(fx, fy + 1, PAL.flora.stalk[0]); // stalk
        p.px(fx, fy, head);
      }
    }

    // Dark tufts: paired grass[0] pixels for ground clutter
    if (this.h(hash, 3) < 0.4) {
      const tx = this.artPos(hash, 20, 1, ART - 2);
      const ty = this.artPos(hash, 21, 1, ART - 1);
      p.px(tx, ty, PAL.grass[0]);
      p.px(tx + 1, ty, PAL.grass[0]);
    }
  }

  /**
   * Regolith: rare 2×2 crust-fungus nubs (mauve, never food-rust) plus
   * dark/light dust specks.
   */
  private decorateDirt(p: PixelPainter, hash: number): void {
    if (this.h(hash, 1) < 0.12) {
      const mx = this.artPos(hash, 10, 1, ART - 3);
      const my = this.artPos(hash, 11, 1, ART - 3);
      p.px(mx, my, PAL.flora.fan[2]);
      p.px(mx + 1, my, PAL.flora.fan[1]);
      p.px(mx, my + 1, PAL.flora.fan[0]);
    }

    const specks = 1 + Math.floor(this.h(hash, 2) * 3);
    for (let i = 0; i < specks; i++) {
      const sx = this.artPos(hash, 20 + i * 3, 0, ART);
      const sy = this.artPos(hash, 21 + i * 3, 0, ART);
      p.px(sx, sy, this.h(hash, 22 + i * 3) < 0.6 ? PAL.soil[0] : PAL.soil[3]);
    }
  }

  /**
   * Ash flats: extra dark grain pixels and rare pale mineral specks.
   */
  private decorateSand(p: PixelPainter, hash: number): void {
    const grains = 2 + Math.floor(this.h(hash, 1) * 3);
    for (let i = 0; i < grains; i++) {
      const gx = this.artPos(hash, 10 + i * 3, 0, ART);
      const gy = this.artPos(hash, 11 + i * 3, 0, ART);
      p.px(gx, gy, PAL.dust[0]);
    }

    if (this.h(hash, 2) < 0.15) {
      const sx = this.artPos(hash, 20, 1, ART - 1);
      const sy = this.artPos(hash, 21, 1, ART - 1);
      p.px(sx, sy, PAL.mineralFleck);
    }
  }

  /**
   * Stone: dark chip marks (2×1) and pale weathered spots.
   */
  private decorateStone(p: PixelPainter, hash: number): void {
    if (this.h(hash, 1) < 0.45) {
      const cx = this.artPos(hash, 10, 1, ART - 2);
      const cy = this.artPos(hash, 11, 1, ART - 1);
      p.px(cx, cy, PAL.stone[0]);
      p.px(cx + 1, cy, PAL.stone[0]);
    }

    const spots = 1 + Math.floor(this.h(hash, 2) * 3);
    for (let i = 0; i < spots; i++) {
      const sx = this.artPos(hash, 20 + i * 3, 0, ART);
      const sy = this.artPos(hash, 21 + i * 3, 0, ART);
      p.px(sx, sy, PAL.stone[3]);
    }
  }

  /**
   * Main decoration dispatcher.
   * Signature preserved: (terrain, ctx, px, py, tileSize, hash).
   * Water is rendered entirely by TerrainRenderer (depth bands + sparkles).
   */
  decorate(
    terrain: TerrainType,
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    hash: number
  ): void {
    const p = new PixelPainter(ctx, tileSize / ART).at(px, py);

    switch (terrain) {
      case TerrainType.Grass:
        this.decorateGrass(p, hash);
        break;
      case TerrainType.Dirt:
        this.decorateDirt(p, hash);
        break;
      case TerrainType.Sand:
        this.decorateSand(p, hash);
        break;
      case TerrainType.Stone:
        this.decorateStone(p, hash);
        break;
      case TerrainType.Water:
        // No-op: water depth banding and sparkles live in TerrainRenderer
        break;
    }
  }
}
