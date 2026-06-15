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
   * Grass: tiny flowers — 1 white/amber petal pixel on a 1px grass[0] stem —
   * plus occasional dark tufts. ~2-3× denser than before, fully opaque.
   */
  private decorateGrass(p: PixelPainter, hash: number): void {
    // Flowers on roughly half the grass tiles, sometimes two per tile
    if (this.h(hash, 1) < 0.55) {
      const flowers = this.h(hash, 2) < 0.3 ? 2 : 1;
      for (let i = 0; i < flowers; i++) {
        const fx = this.artPos(hash, 10 + i * 4, 1, ART - 1);
        const fy = this.artPos(hash, 11 + i * 4, 1, ART - 2);
        const petal = pick([PAL.white, PAL.glowAmber], this.h(hash, 12 + i * 4));
        p.px(fx, fy + 1, PAL.grass[0]); // stem
        p.px(fx, fy, petal); // petal
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
   * Dirt: rare 2×3 mushroom sprouts (cap + stem) plus root specks.
   */
  private decorateDirt(p: PixelPainter, hash: number): void {
    // Mushroom sprout (rare): 2px cap row on a 1px stem, 2×3 footprint
    if (this.h(hash, 1) < 0.12) {
      const mx = this.artPos(hash, 10, 1, ART - 3);
      const my = this.artPos(hash, 11, 1, ART - 4);
      p.px(mx, my, PAL.shroomCapLight);
      p.px(mx + 1, my, PAL.shroomCap);
      p.px(mx, my + 1, PAL.shroomStem);
      p.px(mx, my + 2, PAL.shroomStem);
    }

    // Root specks: dark/light soil pixels scattered around
    const specks = 2 + Math.floor(this.h(hash, 2) * 3);
    for (let i = 0; i < specks; i++) {
      const sx = this.artPos(hash, 20 + i * 3, 0, ART);
      const sy = this.artPos(hash, 21 + i * 3, 0, ART);
      p.px(sx, sy, this.h(hash, 22 + i * 3) < 0.5 ? PAL.soil[0] : PAL.soil[3]);
    }
  }

  /**
   * Sand: extra dark grain pixels and rare pale shell specks.
   */
  private decorateSand(p: PixelPainter, hash: number): void {
    const grains = 2 + Math.floor(this.h(hash, 1) * 3);
    for (let i = 0; i < grains; i++) {
      const gx = this.artPos(hash, 10 + i * 3, 0, ART);
      const gy = this.artPos(hash, 11 + i * 3, 0, ART);
      p.px(gx, gy, PAL.sand[0]);
    }

    // Rare shell/pebble speck (pale stone)
    if (this.h(hash, 2) < 0.15) {
      const sx = this.artPos(hash, 20, 1, ART - 1);
      const sy = this.artPos(hash, 21, 1, ART - 1);
      p.px(sx, sy, PAL.stone[3]);
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
