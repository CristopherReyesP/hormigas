import { AntRole } from '../../game/components/components';
import { TILE_SIZE } from '../../shared/constants';
import { PAL, hash2 } from './pixelart/palette';
import { PixelPainter } from './pixelart/PixelPainter';

interface SpriteFrame {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
  originX: number;
  originY: number;
}

const ANT_FRAMES = 4;
const ANT_SPRITE_SIZE = 48;
const FOOD_SPRITE_SIZE = 32;
const NEST_SPRITE_SIZE = 160;
const BEETLE_FRAMES = 4;
const BEETLE_SPRITE_SIZE = 56;
const CRICKET_FRAMES = 4;
const CRICKET_SPRITE_SIZE = 192;
const DEN_SPRITE_SIZE = 80;
const GIANT_MUSHROOM_SPRITE_SIZE = 64;

// Art-pixel scales: frame size = grid size × scale.
const ANT_SCALE = 3; //          48 = 16 × 3
const BEETLE_SCALE = 4; //       56 = 14 × 4
const CRICKET_SCALE = 6; //     192 = 32 × 6
const FOOD_SCALE = 3; //         32 ≈ 10 × 3 (+1px canvas margin each side)
const NEST_SCALE = 4; //        160 = 40 × 4
const DEN_SCALE = 4; //          80 = 20 × 4
const GIANT_MUSHROOM_SCALE = 4; // 64 = 16 × 4

// Tripod-gait swing offsets (art px) for the 4-frame walk cycle.
const GAIT = [1, 0, -1, 0];

/**
 * Pre-renders all entity sprites to offscreen canvases at construction time.
 * Deliberate PIXEL ART: every sprite is authored on a logical art-pixel grid
 * via PixelPainter, using only PAL colors — no gradients, no rgba, no curves.
 * Ants rendered facing RIGHT (angle 0) — rotation applied at draw time via
 * ctx.rotate(). Frame layouts and canvas dimensions are unchanged.
 */
export class SpriteAtlas {
  // Ant sprites: key = "role-frame", all facing right (angle 0)
  // 4 roles × 4 frames = 16 base + 16 carrying = 32 total
  private antSprites: Map<string, SpriteFrame> = new Map();
  private antCarrySprites: Map<string, SpriteFrame> = new Map();

  // Food sprites: 5 variants × 5 size levels = 25 sprites
  private foodSprites: SpriteFrame[] = [];

  // Nest: 1 static sprite
  private nestSprite: SpriteFrame | null = null;

  // Beetle sprites: 4 frames, all facing right (angle 0)
  private beetleSprites: HTMLCanvasElement;

  // Beetle den: 1 static sprite
  private denSprite: HTMLCanvasElement;

  // Cricket sprites: 4 frames, all facing right (angle 0)
  private cricketSprites: HTMLCanvasElement;

  // Cricket den: 1 static sprite
  private cricketDenSprite: HTMLCanvasElement;

  // Giant mushroom: 1 static sprite
  private giantMushroomSprite: HTMLCanvasElement;

  private antCanvas: HTMLCanvasElement;
  private foodCanvas: HTMLCanvasElement;
  private nestCanvas: HTMLCanvasElement;

  constructor() {
    this.antCanvas = document.createElement('canvas');
    this.foodCanvas = document.createElement('canvas');
    this.nestCanvas = document.createElement('canvas');
    this.beetleSprites = document.createElement('canvas');
    this.denSprite = document.createElement('canvas');
    this.cricketSprites = document.createElement('canvas');
    this.cricketDenSprite = document.createElement('canvas');
    this.giantMushroomSprite = document.createElement('canvas');

    this.generateAntSprites();
    this.generateFoodSprites();
    this.generateNestSprite();
    this.generateBeetleSprites();
    this.generateDenSprite();
    this.generateCricketSprites();
    this.generateCricketDenSprite();
    this.generateGiantMushroomSprite();
  }

  // ─── Outline helper ────────────────────────────────────────
  // Draws the shape callback 8 times offset by 1 art px in PAL.outline,
  // then once at (0,0) with color = null so the callback uses its own fills.
  // Guarantees an exact 1-art-pixel outline around the silhouette.

  private outlined(draw: (dx: number, dy: number, color: string | null) => void): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx !== 0 || dy !== 0) draw(dx, dy, PAL.outline);
      }
    }
    draw(0, 0, null);
  }

  // ─── Ant Sprite Generation ─────────────────────────────────

  private generateAntSprites(): void {
    const s = ANT_SPRITE_SIZE;
    const roles: AntRole[] = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender];

    // Layout: 4 frames wide × (4 roles × 2 carry states) tall
    this.antCanvas.width = s * ANT_FRAMES;
    this.antCanvas.height = s * roles.length * 2;
    const ctx = this.antCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const painter = new PixelPainter(ctx, ANT_SCALE);

    for (let ri = 0; ri < roles.length; ri++) {
      const role = roles[ri];

      for (let frame = 0; frame < ANT_FRAMES; frame++) {
        // Base sprite (not carrying)
        const bx = frame * s;
        const by = ri * s;
        this.paintAnt(painter.at(bx, by), role, frame, false);
        this.antSprites.set(`${role}-${frame}`, {
          canvas: this.antCanvas, x: bx, y: by, w: s, h: s,
          originX: s / 2, originY: s / 2,
        });

        // Carrying sprite
        const cy = (ri + roles.length) * s;
        this.paintAnt(painter.at(bx, cy), role, frame, true);
        this.antCarrySprites.set(`${role}-${frame}`, {
          canvas: this.antCanvas, x: bx, y: cy, w: s, h: s,
          originX: s / 2, originY: s / 2,
        });
      }
    }
  }

  /**
   * 16×16 art-pixel ant, facing right. Slim three-segment body — gaster,
   * 1px petiole (waist), thorax, head — with a continuous 1px outline around
   * the whole union so the waist pinch reads cleanly. Role identity is by
   * SILHOUETTE first (head size, gaster shape, leg reach), accent color second:
   *  - worker : baseline proportions
   *  - soldier: oversized diamond head + 2px pincer jaws, stocky short legs
   *  - scout  : smallest gaster, longest legs and antennae
   *  - nurse  : rounder, paler gaster, compact stance
   */
  private paintAnt(p: PixelPainter, role: AntRole, frame: number, carrying: boolean): void {
    const cy = 8;
    const swing = GAIT[frame];
    const flick = frame % 2;

    const accent =
      role === AntRole.Soldier ? PAL.soldier :
      role === AntRole.Scout ? PAL.scout :
      role === AntRole.Nurse ? PAL.nurse :
      role === AntRole.Defender ? PAL.defender : PAL.worker;

    // Defenders share the soldier silhouette (big head, pincers, stocky) —
    // the violet accent is what tells them apart
    const isS = role === AntRole.Soldier || role === AntRole.Defender;
    const isC = role === AntRole.Scout;
    const isN = role === AntRole.Nurse;

    // ── Per-role anatomy (art-pixel coordinates) ──
    const gx = isS ? 3 : isC ? 5 : 4;                  // gaster center x
    const grx = isS ? 1.9 : isC ? 1.5 : isN ? 2.0 : 2.2; // gaster radii
    const gry = isC ? 1.0 : isN ? 1.5 : 1.3;
    const petX = isS ? 6 : isC ? 8 : 7;                // petiole (waist) px
    const thCx = isS ? 8 : isC ? 10 : 9;               // thorax center x
    const thRx = isS ? 1.2 : isN ? 1.0 : isC ? 0.8 : 1.2;
    const hX = isS || isN ? 11 : 12;                   // head center x
    const hR = isS ? 2.1 : isC ? 1.0 : 1.2;
    const reach = isC ? 5 : isS || isN ? 3 : 4;        // leg vertical reach
    const splay = isC ? 3 : isN ? 1 : 2;               // leg fore/aft splay
    const hips = isS ? [7, 8, 9] : isC ? [9, 10, 11] : [8, 9, 10];
    const antTipX = isS ? 14 : 15;                     // antenna tip
    const antTipY = isC ? 2 : 4;

    // Body fills sit HIGH on the chitin ramp so the silhouette separates from
    // the near-black outline — low-contrast fills made the old ant read as a blob.
    const gBase = isN ? PAL.chitin[3] : PAL.chitin[2]; // nurse = paler gaster
    const gLight = isN ? PAL.sand[0] : PAL.chitin[3];
    const gDark = isN ? PAL.chitin[2] : PAL.chitin[1];

    // Dithered ground shadow — single row, detached from the body outline
    p.shadow(8, 12, 4, 0.5, PAL.outline);

    // Legs (behind body) — tripod gait: front+back of one side move with
    // the middle leg of the other side. Hips along the thorax.
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const groupA = (i + (side === 1 ? 1 : 0)) % 2 === 0;
        const s = groupA ? swing : -swing;
        const ax = hips[i];
        const footX = ax + (i - 1) * splay + s; // back legs splay back, front forward
        p.line(ax, cy + side, footX, cy + side * reach, PAL.outline);
      }
    }

    // Body silhouette as ONE outlined union so the petiole pinch gets a
    // clean, continuous 1px outline: gaster + petiole + thorax + head + jaws.
    this.outlined((dx, dy, c) => {
      p.ellipse(gx + dx, cy + dy, grx, gry, c ?? gBase);       // gaster
      p.px(petX + dx, cy + dy, c ?? PAL.chitin[2]);            // petiole (waist)
      p.ellipse(thCx + dx, cy + dy, thRx, 1.0, c ?? PAL.chitin[2]); // thorax
      p.disc(hX + dx, cy + dy, hR, c ?? PAL.chitin[3]);        // head (lightest tone)
      if (isS) {
        // Soldier: two prominent 2px pincer prongs, opening forward
        p.px(14 + dx, 6 + dy, c ?? PAL.chitin[1]);
        p.px(14 + dx, 7 + dy, c ?? PAL.chitin[1]);
        p.px(14 + dx, 9 + dy, c ?? PAL.chitin[1]);
        p.px(14 + dx, 10 + dy, c ?? PAL.chitin[1]);
      } else if (isC) {
        p.px(hX + 2 + dx, cy + dy, c ?? PAL.chitin[1]);        // tiny forward jaw
      } else {
        p.px(hX + 2 + dx, cy - 1 + dy, c ?? PAL.chitin[1]);    // small mandibles
        p.px(hX + 2 + dx, cy + 1 + dy, c ?? PAL.chitin[1]);
      }
    });

    // Gaster shading — light up-left, dark down-left (right is the accent band)
    p.px(gx - 1, 7, gLight);
    if (grx >= 2) p.px(gx - 2, 8, gLight);
    p.px(gx - 1, 9, gDark);

    // Role accent: solid 2px-wide band across the gaster (survives 100% zoom)
    p.rect(gx, 7, 2, 3, accent);

    // Side eyes (top-down view) on the light head
    p.px(hX, 7, PAL.white);
    p.px(hX, 9, PAL.white);

    // Antennae — bent lines that flick across frames (scout's are longest)
    p.line(hX + 1, 6, antTipX, antTipY + flick, PAL.chitin[0]);
    p.line(hX + 1, 10, antTipX, 16 - antTipY - flick, PAL.chitin[0]);

    // Carrying state: leaf chunk held in the mandibles, ahead of the head
    if (carrying) {
      p.px(14, 6, PAL.leaf[2]);
      p.px(13, 7, PAL.leaf[1]);
      p.px(14, 7, PAL.leaf[2]);
      p.px(15, 7, PAL.leaf[1]);
      p.px(13, 8, PAL.leaf[0]);
      p.px(14, 8, PAL.leaf[1]);
      p.px(15, 8, PAL.leaf[2]);
      p.px(14, 9, PAL.leaf[0]);
    }
  }

  // ─── Beetle Sprite Generation ───────────────────────────────

  private generateBeetleSprites(): void {
    const s = BEETLE_SPRITE_SIZE;
    this.beetleSprites.width = s * BEETLE_FRAMES;
    this.beetleSprites.height = s;
    const ctx = this.beetleSprites.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const painter = new PixelPainter(ctx, BEETLE_SCALE);

    for (let frame = 0; frame < BEETLE_FRAMES; frame++) {
      this.paintBeetle(painter.at(frame * s, 0), frame);
    }
  }

  /**
   * 14×14 art-pixel beetle, facing right. Dome elytra with axial seam,
   * dithered top-left shell highlight, stubby legs, red eye pixels.
   */
  private paintBeetle(p: PixelPainter, frame: number): void {
    const cy = 7;
    const swing = GAIT[frame];

    p.shadow(7, 9, 5, 2, PAL.outline);

    // Stubby legs — 3 per side, tripod gait
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const groupA = (i + (side === 1 ? 1 : 0)) % 2 === 0;
        const s = groupA ? swing : -swing;
        const ax = 4 + i * 2;
        p.line(ax, cy + side * 2, ax + (i - 1) + s, cy + side * 5, PAL.outline);
      }
    }

    // Elytra dome
    this.outlined((dx, dy, c) => p.ellipse(6 + dx, cy + dy, 4, 3.2, c ?? PAL.chitin[1]));
    // Top-left dithered highlight
    p.dither(4, 5, 3, 2, PAL.chitin[2], PAL.chitin[1]);
    p.px(4, 5, PAL.chitin[3]);
    // Bottom-right dithered shading
    p.dither(7, 8, 3, 2, PAL.chitin[0], PAL.chitin[1]);
    // Elytra seam along the body axis (1 art px)
    p.hline(3, 7, 7, PAL.chitin[0]);

    // Head
    this.outlined((dx, dy, c) => p.disc(11 + dx, cy + dy, 1.4, c ?? PAL.chitin[1]));
    p.px(10, 6, PAL.chitin[2]); // top-left highlight

    // Eyes — danger red
    p.px(12, 6, PAL.dangerRed);
    p.px(12, 8, PAL.dangerRed);

    // Mandibles
    p.px(13, 6, PAL.chitin[0]);
    p.px(13, 8, PAL.chitin[0]);
  }

  // ─── Beetle Den Sprite Generation ───────────────────────────

  private generateDenSprite(): void {
    const s = DEN_SPRITE_SIZE;
    this.denSprite.width = s;
    this.denSprite.height = s;
    const ctx = this.denSprite.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    this.paintDen(new PixelPainter(ctx, DEN_SCALE), false);
  }

  /**
   * 20×20 art-pixel dirt mound den: radial cracks, dark hole, pebbles.
   * Cricket variant adds grass blades and mossy dither.
   */
  private paintDen(p: PixelPainter, grassy: boolean): void {
    p.shadow(10, 13, 8, 3, PAL.outline);

    // Mound
    this.outlined((dx, dy, c) => p.ellipse(10 + dx, 10 + dy, 7.5, 5.5, c ?? PAL.soil[1]));
    // Light top-left / dark bottom-right
    p.dither(5, 6, 5, 3, PAL.soil[2], PAL.soil[1]);
    p.dither(11, 13, 5, 2, PAL.soil[0], PAL.soil[1]);
    if (grassy) {
      p.dither(6, 5, 4, 2, PAL.grass[1], PAL.soil[1], 1);
      p.dither(12, 11, 3, 2, PAL.grass[0], PAL.soil[1]);
    }

    // Radial crack lines (1 art px)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      p.line(
        10 + Math.cos(a) * 3.2, 10 + Math.sin(a) * 2.4,
        10 + Math.cos(a) * 6.2, 10 + Math.sin(a) * 4.6,
        PAL.soil[0],
      );
    }

    // Entrance hole with dark rim
    p.ellipse(10, 10, 3.4, 2.4, PAL.soil[0]);
    p.ellipse(10, 10, 2.6, 1.7, PAL.earth[0]);
    p.ellipse(10, 10, 1.4, 0.9, PAL.black);

    // Pebbles around the mound
    for (let i = 0; i < 7; i++) {
      const a = hash2(i, grassy ? 31 : 17) * Math.PI * 2;
      const px = Math.round(10 + Math.cos(a) * 6.5);
      const py = Math.round(10 + Math.sin(a) * 4.8);
      p.px(px, py, i % 2 === 0 ? PAL.stone[2] : PAL.stone[1]);
    }

    // Grass blades (cricket den only)
    if (grassy) {
      const blades: Array<[number, number]> = [[4, 4], [15, 4], [2, 9], [17, 8], [8, 2], [12, 3]];
      for (const [bx, by] of blades) {
        p.vline(bx, by, 2, PAL.grass[2]);
        p.px(bx, by - 1, PAL.grass[3]);
      }
    }
  }

  // ─── Cricket Sprite Generation ─────────────────────────────

  private generateCricketSprites(): void {
    const s = CRICKET_SPRITE_SIZE;
    this.cricketSprites.width = s * CRICKET_FRAMES;
    this.cricketSprites.height = s;
    const ctx = this.cricketSprites.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const painter = new PixelPainter(ctx, CRICKET_SCALE);

    for (let frame = 0; frame < CRICKET_FRAMES; frame++) {
      this.paintCricket(painter.at(frame * s, 0), frame);
    }
  }

  /**
   * 32×32 art-pixel cricket, facing right — grasshopper silhouette read
   * from above: long tapered body with folded wings, dark pronotum saddle,
   * big black eyes, and DOMINANT Z-folded jumping legs (thick green femur
   * out to a wide knee, thin brown tibia tucked back in, brown feet).
   */
  private paintCricket(p: PixelPainter, frame: number): void {
    const cy = 16;
    const swing = GAIT[frame];
    const flex = GAIT[frame];
    const flick = frame % 2;

    p.shadow(14, 19, 11, 3, PAL.outline);

    // Jumping legs — the signature. Tibia first (lies under the femur):
    // knee folds back in toward the tail, brown like the reference.
    for (let side = -1; side <= 1; side += 2) {
      const s = side;
      p.line(8, cy + s * 8, 3 + flex, cy + s * 3, PAL.wood[1]);
      p.px(3 + flex, cy + s * 3, PAL.wood[0]); // foot
      p.px(2 + flex, cy + s * 2, PAL.wood[0]);
      // Femur: 3 px thick, hip → knee well outside the body
      this.outlined((dx, dy, c) => {
        const col = c ?? PAL.grass[1];
        p.line(13 + dx, cy + s * 2 + dy, 8 + dx, cy + s * 8 + dy, col);
        p.line(14 + dx, cy + s * 2 + dy, 9 + dx, cy + s * 8 + dy, col);
        p.line(14 + dx, cy + s * 3 + dy, 9 + dx, cy + s * 9 + dy, col);
      });
      p.px(9, cy + s * 8, PAL.grass[2]); // knee highlight
      p.line(13, cy + s * 3, 10, cy + s * 7, PAL.grass[0]); // trailing-edge shade
    }

    // Walking legs — 2 small brown pairs, alternating gait
    for (let side = -1; side <= 1; side += 2) {
      const sA = side === 1 ? swing : -swing;
      p.line(16, cy + side * 2, 13 - sA, cy + side * 6, PAL.wood[1]); // mid, swept back
      p.line(19, cy + side * 2, 22 + sA, cy + side * 6, PAL.wood[1]); // front, swept forward
    }

    // Body — long taper from pointed wing tips (tail) to the thorax
    this.outlined((dx, dy, c) => {
      for (let x = 4; x <= 16; x++) {
        const halfH = Math.round(1 + ((x - 4) / 12) * 2); // 1 at tail → 3 at thorax
        p.vline(x + dx, cy - halfH + dy, halfH * 2 + 1, c ?? PAL.grass[1]);
      }
    });
    // Folded wings: light dorsal stripe, dark seam + under-edge
    p.line(7, cy - 1, 15, cy - 1, PAL.grass[2]);
    p.line(5, cy, 10, cy, PAL.grass[0]); // wing seam over the tail half
    p.line(8, cy + 2, 15, cy + 2, PAL.grass[0]);
    // Abdomen segment chevrons peeking under the wings (stay inside the fill)
    p.px(6, cy + 1, PAL.grass[0]);
    p.vline(9, cy + 1, 2, PAL.grass[0]);
    p.px(12, cy + 2, PAL.grass[0]);
    p.dither(12, cy - 2, 4, 1, PAL.grass[2], PAL.grass[1]);

    // Head first — the pronotum saddle overlaps its rear, like the reference
    this.outlined((dx, dy, c) => p.ellipse(21 + dx, cy + dy, 2.4, 2.6, c ?? PAL.grass[1]));

    // Pronotum saddle — wide darker plate riding over body rear + head front
    this.outlined((dx, dy, c) => p.rect(15 + dx, cy - 3 + dy, 4, 7, c ?? PAL.grass[0]));
    p.line(15, cy - 3, 18, cy - 3, PAL.grass[1]); // top-lit edge

    // Big black eyes at the sides + highlight
    p.px(20, cy - 2, PAL.grass[2]); // top-left highlight
    p.rect(21, cy - 2, 2, 1, PAL.black);
    p.rect(21, cy + 2, 2, 1, PAL.black);
    // Mouth palps
    p.px(24, cy - 1, PAL.grass[0]);
    p.px(24, cy + 1, PAL.grass[0]);

    // Long antennae swept forward-out, flicking across frames
    p.line(23, cy - 1, 28, cy - 5 + flick, PAL.grass[0]);
    p.line(23, cy + 1, 28, cy + 5 - flick, PAL.grass[0]);
    p.px(29, cy - 6 + flick, PAL.grass[0]);
    p.px(29, cy + 6 - flick, PAL.grass[0]);
  }

  // ─── Cricket Den Sprite Generation ────────────────────────

  private generateCricketDenSprite(): void {
    const s = DEN_SPRITE_SIZE;
    this.cricketDenSprite.width = s;
    this.cricketDenSprite.height = s;
    const ctx = this.cricketDenSprite.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    this.paintDen(new PixelPainter(ctx, DEN_SCALE), true);
  }

  // ─── Giant Mushroom Sprite Generation ──────────────────────

  private generateGiantMushroomSprite(): void {
    const s = GIANT_MUSHROOM_SPRITE_SIZE;
    this.giantMushroomSprite.width = s;
    this.giantMushroomSprite.height = s;
    const ctx = this.giantMushroomSprite.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    this.paintGiantMushroom(new PixelPainter(ctx, GIANT_MUSHROOM_SCALE));
  }

  /**
   * 16×16 art-pixel Amanita: red cap with white spot clusters,
   * cream stem with dithered right-side shading.
   */
  private paintGiantMushroom(p: PixelPainter): void {
    p.shadow(8, 14, 6, 1.4, PAL.outline);

    // Stem
    this.outlined((dx, dy, c) => p.rect(6 + dx, 7 + dy, 4, 7, c ?? PAL.shroomStem));
    p.dither(8, 9, 2, 5, PAL.sand[1], PAL.shroomStem);

    // Cap
    this.outlined((dx, dy, c) => p.ellipse(8 + dx, 5 + dy, 6, 3.4, c ?? PAL.shroomCap));
    // Top-left dithered highlight
    p.dither(4, 3, 4, 2, PAL.shroomCapLight, PAL.shroomCap);
    // Underside rim
    p.hline(5, 8, 7, PAL.shroomCapLight);
    // White spot clusters
    const spots: Array<[number, number]> = [
      [5, 2], [6, 2], [8, 4], [10, 3], [11, 3], [3, 5], [12, 6], [6, 6],
    ];
    for (const [sx, sy] of spots) p.px(sx, sy, PAL.white);
  }

  // ─── Food Sprite Generation ────────────────────────────────

  private generateFoodSprites(): void {
    const s = FOOD_SPRITE_SIZE;
    const variants = 5; // 0-1: leaves, 2: mushroom, 3: beetle meat, 4: cricket meat
    const sizeLevels = 5;

    this.foodCanvas.width = s * variants;
    this.foodCanvas.height = s * sizeLevels;
    const ctx = this.foodCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const painter = new PixelPainter(ctx, FOOD_SCALE);

    for (let v = 0; v < variants; v++) {
      for (let sl = 0; sl < sizeLevels; sl++) {
        const x = v * s;
        const y = sl * s;
        // 10×10 art grid centered in the 32px frame (1px canvas margin)
        this.paintFood(painter.at(x + 1, y + 1), v, sl);

        this.foodSprites[v * sizeLevels + sl] = {
          canvas: this.foodCanvas, x, y, w: s, h: s,
          originX: s / 2, originY: s / 2,
        };
      }
    }
  }

  private paintFood(p: PixelPainter, variant: number, sizeLevel: number): void {
    if (variant === 2) {
      this.paintMushroomFood(p, sizeLevel);
    } else if (variant === 3) {
      this.paintMeat(p, sizeLevel, PAL.meat);
    } else if (variant === 4) {
      this.paintMeat(p, sizeLevel, [PAL.grass[0], PAL.grass[1], PAL.grass[2]]);
      p.px(6, 5, PAL.meat[2]); // raw-flesh fleck on cricket meat
    } else {
      this.paintLeaf(p, sizeLevel, variant === 1);
    }
  }

  /** Pointed pixel leaf with 1px midrib vein. Variant flag rotates it 90°. */
  private paintLeaf(p: PixelPainter, sl: number, vertical: boolean): void {
    const RX = [1.0, 1.4, 1.8, 2.2, 2.6];
    const RY = [1.0, 1.2, 1.4, 1.6, 1.8];
    const TIP = [2, 2, 3, 3, 3];
    const rx = RX[sl];
    const ry = RY[sl];
    const tip = TIP[sl];

    this.outlined((dx, dy, c) => {
      if (vertical) {
        p.ellipse(5 + dx, 5 + dy, ry, rx, c ?? PAL.leaf[1]);
        p.px(5 + dx, 5 - tip + dy, c ?? PAL.leaf[1]);
        p.px(5 + dx, 5 + tip + dy, c ?? PAL.leaf[1]);
      } else {
        p.ellipse(5 + dx, 5 + dy, rx, ry, c ?? PAL.leaf[1]);
        p.px(5 - tip + dx, 5 + dy, c ?? PAL.leaf[1]);
        p.px(5 + tip + dx, 5 + dy, c ?? PAL.leaf[1]);
      }
    });

    // Midrib vein
    if (vertical) p.vline(5, 5 - tip + 1, tip * 2 - 1, PAL.leaf[0]);
    else p.hline(5 - tip + 1, 5, tip * 2 - 1, PAL.leaf[0]);

    // Top-left highlights
    p.px(vertical ? 4 : 5, 4, PAL.leaf[2]);
    if (sl >= 2) p.px(4, 4, PAL.leaf[2]);
    if (sl >= 3) p.px(vertical ? 4 : 3, vertical ? 3 : 4, PAL.leaf[2]);
  }

  /** Small Amanita food item: red cap, white spots, cream stem. */
  private paintMushroomFood(p: PixelPainter, sl: number): void {
    const CRX = [1.2, 1.6, 2.0, 2.5, 3.0];
    const CRY = [0.9, 1.1, 1.3, 1.6, 1.9];
    const STEM_H = [2, 2, 3, 3, 4];
    const rx = CRX[sl];
    const ry = CRY[sl];
    const sh = STEM_H[sl];

    this.outlined((dx, dy, c) => {
      p.rect(4 + dx, 5 + dy, 2, sh, c ?? PAL.shroomStem);
      p.ellipse(5 + dx, 4 + dy, rx, ry, c ?? PAL.shroomCap);
    });

    if (sl >= 1) p.px(4, 3, PAL.shroomCapLight); // top-left highlight
    p.px(5, 3, PAL.white);
    if (sl >= 2) p.px(4, 4, PAL.white);
    if (sl >= 3) p.px(6, 3, PAL.white);
    if (sl >= 4) {
      p.px(3, 4, PAL.white);
      p.px(7, 4, PAL.white);
    }
  }

  /** Chunky irregular meat blob; ramp = [dark, base, highlight]. */
  private paintMeat(p: PixelPainter, sl: number, ramp: readonly string[]): void {
    const RX = [1.2, 1.6, 2.0, 2.4, 2.8];
    const rx = RX[sl];
    const ry = rx * 0.8;

    this.outlined((dx, dy, c) => {
      p.ellipse(5 + dx, 5 + dy, rx, ry, c ?? ramp[1]);
      p.ellipse(6 + dx, 6 + dy, rx * 0.55, ry * 0.55, c ?? ramp[1]);
      p.px(5 - Math.round(rx) + dx, 4 + dy, c ?? ramp[1]); // irregular lump
    });

    // 1-2 highlight px up-left, darker shading down-right
    p.px(sl >= 1 ? 4 : 5, 4, ramp[2]);
    p.px(5, 6, ramp[0]);
    if (sl >= 2) p.dither(5, 6, 2, 1, ramp[0], ramp[1]);
  }

  // ─── Nest Sprite Generation ────────────────────────────────

  private generateNestSprite(): void {
    const s = NEST_SPRITE_SIZE;
    this.nestCanvas.width = s;
    this.nestCanvas.height = s;
    const ctx = this.nestCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    this.paintNest(new PixelPainter(ctx, NEST_SCALE));

    this.nestSprite = {
      canvas: this.nestCanvas, x: 0, y: 0, w: s, h: s,
      originX: s / 2, originY: s / 2,
    };
  }

  /**
   * 40×40 art-pixel tree-stump nest: bark ring, wood growth rings,
   * dark entrance with amber rim, moss pixels, root lines.
   */
  private paintNest(p: PixelPainter): void {
    const cx = 20;
    const cy = 20;

    p.shadow(21, 22, 16, 8, PAL.outline);

    // Outer bark
    this.outlined((dx, dy, c) => p.ellipse(cx + dx, cy + dy, 16, 8.6, c ?? PAL.wood[0]));
    p.ellipse(cx, cy, 14.6, 7.6, PAL.wood[1]);

    // Wood cross-section with alternating growth rings
    p.ellipse(cx, 19, 12, 6.2, PAL.wood[2]);
    p.ellipse(cx, 19, 10.4, 5.3, PAL.sand[0]);
    p.ellipse(cx, 19, 8.8, 4.5, PAL.wood[2]);
    p.ellipse(cx, 19, 7.2, 3.7, PAL.sand[0]);
    p.ellipse(cx, 19, 5.6, 2.9, PAL.wood[2]);
    // Top-left sheen on the cut wood
    p.dither(13, 15, 5, 2, PAL.sand[1], PAL.sand[0]);

    // Radial cracks across the rings
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      p.line(
        cx + Math.cos(a) * 5, 19 + Math.sin(a) * 2.6,
        cx + Math.cos(a) * 11, 19 + Math.sin(a) * 5.7,
        PAL.wood[0],
      );
    }

    // Entrance hole with 1px amber rim
    p.ellipse(cx, 19, 4.6, 2.6, PAL.glowAmber);
    p.ellipse(cx, 19, 3.8, 2.0, PAL.earth[0]);
    p.ellipse(cx, 19, 2.2, 1.1, PAL.black);

    // Moss clumps on the bark ring
    for (let i = 0; i < 9; i++) {
      const a = hash2(i, 5) * Math.PI * 2;
      const d = 13.5 + hash2(i, 9) * 2;
      const mx = Math.round(cx + Math.cos(a) * d);
      const my = Math.round(cy + Math.sin(a) * d * 0.52);
      p.px(mx, my, PAL.grass[2]);
      p.px(mx + 1, my, PAL.grass[1]);
    }

    // Roots (dark underline + lit top line)
    p.line(5, 23, 1, 26, PAL.outline);
    p.line(5, 22, 1, 25, PAL.wood[1]);
    p.line(35, 23, 39, 26, PAL.outline);
    p.line(35, 22, 39, 25, PAL.wood[1]);
    p.line(13, 28, 9, 31, PAL.outline);
    p.line(13, 27, 9, 30, PAL.wood[1]);
    p.line(27, 28, 30, 31, PAL.outline);
    p.line(27, 27, 30, 30, PAL.wood[1]);

    // Soil debris scattered around the stump
    for (let i = 0; i < 10; i++) {
      const a = hash2(i, 23) * Math.PI * 2;
      const d = 17.5 + hash2(i, 41) * 2;
      const ex = Math.max(0, Math.min(39, Math.round(cx + Math.cos(a) * d)));
      const ey = Math.max(0, Math.min(39, Math.round(21 + Math.sin(a) * d * 0.5)));
      p.px(ex, ey, PAL.soil[2]);
    }
  }

  // ─── Public Draw Methods ───────────────────────────────────

  drawAnt(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    angle: number,
    legPhase: number,
    role: AntRole,
    isCarrying: boolean
  ): void {
    // Map continuous legPhase to frame 0-3
    const TWO_PI = Math.PI * 2;
    const normalizedPhase = ((legPhase % TWO_PI) + TWO_PI) % TWO_PI;
    const frame = Math.floor(normalizedPhase / (TWO_PI / ANT_FRAMES)) % ANT_FRAMES;

    const key = `${role}-${frame}`;
    const sprite = isCarrying ? this.antCarrySprites.get(key) : this.antSprites.get(key);
    if (!sprite) return;

    // Smooth rotation at draw time — single rotate + drawImage is cheap
    ctx.save();
    ctx.translate(worldX, worldY);
    ctx.rotate(angle);
    ctx.drawImage(
      sprite.canvas,
      sprite.x, sprite.y, sprite.w, sprite.h,
      -sprite.originX, -sprite.originY, sprite.w, sprite.h
    );
    ctx.restore();
  }

  drawFood(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    variant: number,
    sizeLevel: number,
    rotation: number
  ): void {
    const index = (variant % 5) * 5 + Math.min(4, Math.max(0, sizeLevel));
    const sprite = this.foodSprites[index];
    if (!sprite) return;

    ctx.save();
    ctx.translate(worldX, worldY);
    ctx.rotate(rotation);
    ctx.drawImage(
      sprite.canvas,
      sprite.x, sprite.y, sprite.w, sprite.h,
      -sprite.originX, -sprite.originY, sprite.w, sprite.h
    );
    ctx.restore();
  }

  drawNest(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    radius: number
  ): void {
    if (!this.nestSprite) return;

    const targetSize = radius * TILE_SIZE * 1.3 * 2;
    const s = targetSize / this.nestSprite.w;

    ctx.save();
    ctx.translate(worldX, worldY);
    ctx.scale(s, s);
    ctx.drawImage(
      this.nestSprite.canvas,
      this.nestSprite.x, this.nestSprite.y, this.nestSprite.w, this.nestSprite.h,
      -this.nestSprite.originX, -this.nestSprite.originY, this.nestSprite.w, this.nestSprite.h
    );
    ctx.restore();
  }

  drawBeetle(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    angle: number,
    legPhase: number
  ): void {
    const TWO_PI = Math.PI * 2;
    const normalizedPhase = ((legPhase % TWO_PI) + TWO_PI) % TWO_PI;
    const frame = Math.floor(normalizedPhase / (TWO_PI / BEETLE_FRAMES)) % BEETLE_FRAMES;

    const s = BEETLE_SPRITE_SIZE;
    const srcX = frame * s;

    ctx.save();
    ctx.translate(worldX, worldY);
    ctx.rotate(angle);
    ctx.drawImage(
      this.beetleSprites,
      srcX, 0, s, s,
      -s / 2, -s / 2, s, s
    );
    ctx.restore();
  }

  drawBeetleDen(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number
  ): void {
    const s = DEN_SPRITE_SIZE;
    ctx.drawImage(
      this.denSprite,
      worldX - s / 2, worldY - s / 2
    );
  }

  drawCricket(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    angle: number,
    legPhase: number
  ): void {
    const TWO_PI = Math.PI * 2;
    const normalizedPhase = ((legPhase % TWO_PI) + TWO_PI) % TWO_PI;
    const frame = Math.floor(normalizedPhase / (TWO_PI / CRICKET_FRAMES)) % CRICKET_FRAMES;

    const s = CRICKET_SPRITE_SIZE;
    const srcX = frame * s;

    ctx.save();
    ctx.translate(worldX, worldY);
    ctx.rotate(angle);
    ctx.drawImage(
      this.cricketSprites,
      srcX, 0, s, s,
      -s / 2, -s / 2, s, s
    );
    ctx.restore();
  }

  drawCricketDen(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number
  ): void {
    const s = DEN_SPRITE_SIZE;
    ctx.drawImage(
      this.cricketDenSprite,
      worldX - s / 2, worldY - s / 2
    );
  }

  drawGiantMushroom(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number
  ): void {
    const s = GIANT_MUSHROOM_SPRITE_SIZE;
    ctx.drawImage(
      this.giantMushroomSprite,
      worldX - s / 2, worldY - s / 2
    );
  }
}
