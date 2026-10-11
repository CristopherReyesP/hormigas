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

    // Blade clumps: 2-3 short blades, dark root to lit tip, leaning apart
    if (this.h(hash, 30) < 0.4) {
      const bx = this.artPos(hash, 31, 2, ART - 3);
      const by = this.artPos(hash, 32, 4, ART - 1);
      const tall = 2 + Math.floor(this.h(hash, 33) * 2);
      p.vline(bx, by - tall, tall, PAL.grass[3]);
      p.px(bx, by - tall - 1, PAL.leaf[1]);
      p.px(bx - 1, by - 2, PAL.grass[3]);
      p.px(bx - 1, by - 3, PAL.leaf[1]);
      if (this.h(hash, 34) < 0.5) {
        p.px(bx + 1, by - 1, PAL.grass[3]);
        p.px(bx + 2, by - 2, PAL.leaf[1]);
      }
      p.px(bx, by, PAL.grass[0]); // root shade
    }

    // Rare glow bead nestled in the moss
    if (this.h(hash, 35) < 0.06) {
      const gx = this.artPos(hash, 36, 1, ART - 1);
      const gy = this.artPos(hash, 37, 1, ART - 1);
      p.px(gx, gy, PAL.mossGlow);
      p.px(gx + 1, gy, PAL.grass[0]);
    }
  }

  /** A pebble lit from the upper-left: highlight, body, and a cast shadow pixel. */
  private pebble(p: PixelPainter, x: number, y: number, wide: boolean, ramp: readonly string[]): void {
    p.px(x, y, ramp[ramp.length - 1]);
    if (wide) p.px(x + 1, y, ramp[ramp.length - 2]);
    p.px(x, y + 1, ramp[ramp.length - 2]);
    if (wide) p.px(x + 1, y + 1, ramp[1]);
    p.px(x + (wide ? 2 : 1), y + 1, ramp[0]);
    p.hline(x + 1, y + 2, wide ? 2 : 1, ramp[0]);
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

    // Pebbles with a lit top and a shadow side
    if (this.h(hash, 30) < 0.32) {
      const px = this.artPos(hash, 31, 1, ART - 4);
      const py = this.artPos(hash, 32, 1, ART - 4);
      this.pebble(p, px, py, this.h(hash, 33) < 0.5, PAL.stone);
    }

    // Hairline drying crack: a short jagged run with a lit lip below it
    if (this.h(hash, 34) < 0.1) {
      let cx = this.artPos(hash, 35, 2, ART - 7);
      let cy = this.artPos(hash, 36, 2, ART - 4);
      for (let i = 0; i < 5; i++) {
        p.px(cx, cy, PAL.soil[0]);
        p.px(cx, cy + 1, PAL.soil[3]);
        cx++;
        if (this.h(hash, 37 + i) < 0.45) cy = Math.max(1, Math.min(ART - 2, cy + (this.h(hash, 42 + i) < 0.5 ? -1 : 1)));
      }
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

    // Wind ripples: short parallel crests, lit on the windward side
    if (this.h(hash, 30) < 0.35) {
      const rows = 1 + Math.floor(this.h(hash, 31) * 2);
      const rx = this.artPos(hash, 32, 1, ART - 7);
      const ry = this.artPos(hash, 33, 2, ART - 6);
      for (let i = 0; i < rows; i++) {
        const len = 3 + Math.floor(this.h(hash, 34 + i) * 3);
        const ox = rx + i * 2;
        const oy = ry + i * 3;
        p.hline(ox, oy, len, PAL.dust[2]);
        p.hline(ox + 1, oy + 1, len, PAL.dust[0]);
      }
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

    // Weathering crack with moss creeping into the crevice
    if (this.h(hash, 30) < 0.25) {
      const cx = this.artPos(hash, 31, 2, ART - 5);
      const cy = this.artPos(hash, 32, 2, ART - 5);
      p.line(cx, cy, cx + 3, cy + 3, PAL.stone[0]);
      p.px(cx + 1, cy, PAL.stone[3]);
      if (this.h(hash, 33) < 0.5) p.px(cx + 3, cy + 2, PAL.grass[2]);
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
