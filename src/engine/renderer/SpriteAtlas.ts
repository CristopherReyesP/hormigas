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

/** Art-pixel point on the UPPER half of the ant grid; painters mirror it about the body axis. */
type UpperPx = readonly [number, number];
/** Upper-half mandible pixel: x, y, flesh ramp index. */
type JawPx = readonly [number, number, number];

/**
 * Swarm caste anatomy on the 16×16 ant grid (facing right, body axis y = 8).
 * Castes differ by SILHOUETTE — head size, jaw shape, leg reach, spines —
 * plus tone shifts inside the one flesh ramp, never by a foreign accent color.
 */
interface SwarmCaste {
  gx: number; grx: number; gry: number;   // gaster center x + radii
  skin: 'flesh' | 'pale' | 'plated';      // gaster finish
  petX: number;                            // petiole (waist) x
  thCx: number; thRx: number;              // thorax
  hX: number; hR: number; shieldHead?: boolean;
  reach: number; splay: number; hips: readonly [number, number, number];
  antRoot: UpperPx; antTip: UpperPx;
  spines: readonly UpperPx[];              // 1px bone bumps on the silhouette edge
  jaws: readonly JawPx[];                  // scythe mandibles (unoutlined)
  eye: UpperPx;
}

const SWARM_CASTES: Record<AntRole, SwarmCaste> = {
  // Drone: the baseline body plan, short hooked scythes, one spine pair
  [AntRole.Worker]: {
    gx: 4, grx: 2.4, gry: 2.0, skin: 'flesh', petX: 7, thCx: 9, thRx: 1.2,
    hX: 12, hR: 1.2, reach: 4, splay: 2, hips: [8, 9, 10],
    antRoot: [12, 6], antTip: [14, 3], spines: [[3, 4]],
    jaws: [[14, 6, 4], [15, 7, 4]], eye: [12, 7],
  },
  // Slasher: small gaster, huge head, long curved scythes, stocky legs
  [AntRole.Soldier]: {
    gx: 3, grx: 1.9, gry: 1.6, skin: 'flesh', petX: 6, thCx: 8, thRx: 1.2,
    hX: 11, hR: 2.1, reach: 3, splay: 2, hips: [7, 8, 9],
    antRoot: [11, 5], antTip: [13, 2], spines: [[2, 5]],
    jaws: [[13, 5, 3], [14, 5, 4], [15, 6, 4], [14, 7, 4]], eye: [12, 6],
  },
  // Scout: sleek and spineless — slimmest gaster, longest legs and antennae
  [AntRole.Scout]: {
    gx: 5, grx: 2.0, gry: 1.0, skin: 'flesh', petX: 8, thCx: 10, thRx: 0.8,
    hX: 13, hR: 1.0, reach: 5, splay: 3, hips: [9, 10, 11],
    antRoot: [13, 6], antTip: [15, 1], spines: [],
    jaws: [[15, 7, 4]], eye: [13, 7],
  },
  // Nurse: soft, pale brood-tender — round gaster, small head, short legs
  [AntRole.Nurse]: {
    gx: 4, grx: 2.2, gry: 2.0, skin: 'pale', petX: 7, thCx: 9, thRx: 1.0,
    hX: 11, hR: 1.2, reach: 3, splay: 1, hips: [8, 9, 10],
    antRoot: [11, 6], antTip: [14, 4], spines: [],
    jaws: [[13, 7, 4]], eye: [11, 7],
  },
  // Armored: dark plated gaster, square shield head, blunt jaws, spine rows + horn
  [AntRole.Defender]: {
    gx: 4, grx: 2.4, gry: 2.0, skin: 'plated', petX: 7, thCx: 9, thRx: 1.6,
    hX: 12, hR: 1.2, shieldHead: true, reach: 3, splay: 1, hips: [8, 9, 10],
    antRoot: [12, 5], antTip: [14, 3], spines: [[2, 4], [4, 4], [11, 4]],
    jaws: [[15, 7, 3]], eye: [13, 6],
  },
};

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
  // No-shadow variant (Worker only) — used for underground queen rendering
  private antNoShadowSprites: Map<string, SpriteFrame> = new Map();
  private antNoShadowCanvas: HTMLCanvasElement;

  // Dedicated queen ant sprite — large gaster, short legs, no shadow
  private queenAntSprites: Map<string, SpriteFrame> = new Map();
  private queenAntCanvas: HTMLCanvasElement;

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
    this.antNoShadowCanvas = document.createElement('canvas');
    this.queenAntCanvas = document.createElement('canvas');
    this.beetleSprites = document.createElement('canvas');
    this.denSprite = document.createElement('canvas');
    this.cricketSprites = document.createElement('canvas');
    this.cricketDenSprite = document.createElement('canvas');
    this.giantMushroomSprite = document.createElement('canvas');

    this.generateAntSprites();
    this.generateQueenAntSprites();
    this.generateFoodSprites();
    this.generateNestSprite();
    this.generateBeetleSprites();
    this.generateDenSprite();
    this.generateCricketSprites();
    this.generateCricketDenSprite();
    this.generateGiantMushroomSprite();
  }

  // ─── Outline helper ────────────────────────────────────────
  // Draws the shape callback 8 times offset by 1 art px in the outline color,
  // then once at (0,0) with color = null so the callback uses its own fills.
  // Guarantees an exact 1-art-pixel outline around the silhouette.

  private outlined(draw: (dx: number, dy: number, color: string | null) => void, outline: string = PAL.outline): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx !== 0 || dy !== 0) draw(dx, dy, outline);
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

    // No-shadow Worker sprites — Worker role only, 4 frames, no ground shadow
    this.antNoShadowCanvas.width = s * ANT_FRAMES;
    this.antNoShadowCanvas.height = s;
    const nsCtx = this.antNoShadowCanvas.getContext('2d')!;
    nsCtx.imageSmoothingEnabled = false;
    const nsPainter = new PixelPainter(nsCtx, ANT_SCALE);
    for (let frame = 0; frame < ANT_FRAMES; frame++) {
      const bx = frame * s;
      this.paintAnt(nsPainter.at(bx, 0), AntRole.Worker, frame, false, false);
      this.antNoShadowSprites.set(`${AntRole.Worker}-${frame}`, {
        canvas: this.antNoShadowCanvas, x: bx, y: 0, w: s, h: s,
        originX: s / 2, originY: s / 2,
      });
    }
  }

  /**
   * 16×16 art-pixel Swarm ant, facing right. The ant body plan is intact —
   * bulbous gaster, 1px petiole (waist), thorax, head, 6 legs, 2 antennae —
   * but mutated: magenta flesh, a glowing chartreuse vein down the body axis,
   * glowing eyes, pale scythe mandibles and 1px bone spines. Castes read by
   * SILHOUETTE (see SWARM_CASTES), with tone shifts inside the one flesh ramp.
   * Shading is symmetric about the body axis (lit ridge beside the vein,
   * darker flanks), so it stays correct at any rotation.
   */
  private paintAnt(p: PixelPainter, role: AntRole, frame: number, carrying: boolean, drawShadow = true): void {
    const cy = 8;
    const swing = GAIT[frame];
    const flick = frame % 2;
    const c = SWARM_CASTES[role];
    const F = PAL.swarm.flesh;
    const V = PAL.swarm.vein;
    const O = PAL.swarm.outline;
    const mirror = (y: number): number => 2 * cy - y;

    // Gaster finish: [flank, body, ridge]
    const tones =
      c.skin === 'pale' ? [F[3], F[4], F[4]] :
      c.skin === 'plated' ? [F[1], F[2], F[4]] :
      [F[2], F[3], F[4]];

    // Dithered ground shadow — single row, detached from the body outline
    if (drawShadow) p.shadow(8, 12, 4, 0.5, O);

    // Legs (behind body) — tripod gait: front+back of one side move with
    // the middle leg of the other side. Hips along the thorax.
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const groupA = (i + (side === 1 ? 1 : 0)) % 2 === 0;
        const s = groupA ? swing : -swing;
        const ax = c.hips[i];
        const footX = ax + (i - 1) * c.splay + s; // back legs splay back, front forward
        p.line(ax, cy + side, footX, cy + side * c.reach, O);
      }
    }

    // Body silhouette as ONE outlined union so the petiole pinch gets a
    // clean, continuous 1px outline: gaster + petiole + thorax + head.
    this.outlined((dx, dy, col) => {
      p.ellipse(c.gx + dx, cy + dy, c.grx, c.gry, col ?? tones[0]);       // gaster (flank tone)
      p.px(c.petX + dx, cy + dy, col ?? F[2]);                             // petiole (waist)
      p.ellipse(c.thCx + dx, cy + dy, c.thRx, 1.0, col ?? (c.skin === 'plated' ? F[2] : F[3])); // thorax
      if (c.shieldHead) p.rect(c.hX - 1 + dx, cy - 2 + dy, 3, 5, col ?? F[2]); // flat shield head
      else p.disc(c.hX + dx, cy + dy, c.hR, col ?? F[3]);                      // head (lightest tone)
    }, O);

    // Gaster: body tone inside the dark flanks, lit ridge on both sides of the vein
    p.ellipse(c.gx, cy, c.grx, c.gry - 1, tones[1]);
    p.px(c.gx, cy - 1, tones[2]);
    p.px(c.gx, mirror(cy - 1), tones[2]);

    // The glowing vein: bright core along the body axis, dim tips, thorax node.
    // Plated defenders show only the middle of it between their armor plates.
    const half = Math.floor(c.grx + 0.25);
    if (c.skin === 'plated') {
      p.px(c.gx - 1, cy, V[0]);
      p.px(c.gx, cy, V[1]);
      p.px(c.gx + 1, cy, V[0]);
    } else {
      p.hline(c.gx - half, cy, half * 2 + 1, V[1]);
      p.px(c.gx - half, cy, V[0]);
      p.px(c.gx + half, cy, V[0]);
    }
    p.px(c.thCx, cy, V[1]);

    // Head: domed highlight, or the shield head's lit front plate
    if (c.shieldHead) {
      p.vline(c.hX + 1, cy - 1, 3, F[3]);
      p.px(c.hX, cy, F[3]);
    } else if (c.hR >= 1.2) {
      p.px(c.hX, cy, F[4]);
    }

    // Glowing eyes on the head flanks
    p.px(c.eye[0], c.eye[1], V[1]);
    p.px(c.eye[0], mirror(c.eye[1]), V[1]);

    // Scythe mandibles (pale bone, unoutlined so the hooks stay 1px sharp)
    for (const [jx, jy, ri] of c.jaws) {
      p.px(jx, jy, F[ri]);
      p.px(jx, mirror(jy), F[ri]);
    }

    // 1px bone spines on the silhouette edge
    for (const [sx, sy] of c.spines) {
      p.px(sx, sy, F[3]);
      p.px(sx, mirror(sy), F[3]);
    }

    // Antennae — bent lines that flick across frames (scout's are longest)
    p.line(c.antRoot[0], c.antRoot[1], c.antTip[0], c.antTip[1] + flick, F[3]);
    p.line(c.antRoot[0], mirror(c.antRoot[1]), c.antTip[0], mirror(c.antTip[1]) - flick, F[3]);

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

  // ─── Queen Ant Sprite Generation ────────────────────────────

  private generateQueenAntSprites(): void {
    const s = ANT_SPRITE_SIZE;
    this.queenAntCanvas.width = s * ANT_FRAMES;
    this.queenAntCanvas.height = s;
    const ctx = this.queenAntCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const painter = new PixelPainter(ctx, ANT_SCALE);

    for (let frame = 0; frame < ANT_FRAMES; frame++) {
      const bx = frame * s;
      this.paintQueenAnt(painter.at(bx, 0), frame);
      this.queenAntSprites.set(`queen-${frame}`, {
        canvas: this.queenAntCanvas, x: bx, y: 0, w: s, h: s,
        originX: s / 2, originY: s / 2,
      });
    }
  }

  /**
   * 16×16 art-pixel Swarm queen, facing right — the brood mother. A bloated
   * egg sac dwarfs the rest of the body and carries the colony's densest
   * vein network (her glow is the strongest; RenderSystem adds the halo).
   * Legs stay short (reach 2) so they never bleed onto the chamber floor
   * when she is drawn at 2.2×, and she has no dithered ground shadow.
   */
  private paintQueenAnt(p: PixelPainter, frame: number): void {
    const cy = 8;
    const swing = GAIT[frame];
    const flick = frame % 2;
    const F = PAL.swarm.flesh;
    const V = PAL.swarm.vein;
    const O = PAL.swarm.outline;

    // Brood-mother anatomy: a 7×7 egg sac, compact legs
    const gx = 5;
    const grx = 3.6;
    const gry = 3.2;
    const petX = 9;
    const thCx = 11;
    const hX = 13;
    const reach = 2;
    const splay = 1;
    const hips = [10, 11, 12];

    // Legs drawn first (behind body)
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const groupA = (i + (side === 1 ? 1 : 0)) % 2 === 0;
        const s = groupA ? swing : -swing;
        const ax = hips[i];
        const footX = ax + (i - 1) * splay + s;
        p.line(ax, cy + side, footX, cy + side * reach, O);
      }
    }

    // Body union (egg sac + petiole + thorax + head)
    this.outlined((dx, dy, c) => {
      p.ellipse(gx + dx, cy + dy, grx, gry, c ?? F[1]);
      p.px(petX + dx, cy + dy, c ?? F[1]);
      p.ellipse(thCx + dx, cy + dy, 1.0, 1.0, c ?? F[2]);
      p.disc(hX + dx, cy + dy, 1.2, c ?? F[3]);
    }, O);

    // Sac shading: dark flanks → body → lit ridge along the vein
    p.ellipse(gx, cy, grx - 0.8, gry - 1, F[2]);
    p.ellipse(gx, cy, grx - 1.8, gry - 2, F[3]);

    // Vein network: bright spine with fishbone tributaries swept toward the tail
    p.hline(gx - 3, cy, 7, V[1]);
    p.px(gx - 3, cy, V[0]);
    p.px(gx + 3, cy, V[0]);
    for (const sy of [-1, 1]) {
      for (const bx of [gx - 1, gx + 2]) {
        p.px(bx, cy + sy, V[1]);
        p.px(bx - 1, cy + sy * 2, V[0]);
      }
      // Eggs glowing through the stretched skin, between the tributaries
      p.px(gx, cy + sy * 2, F[4]);
    }
    p.px(thCx, cy, V[1]);

    // Head: domed highlight, glowing eyes, short scythes
    p.px(hX, cy, F[4]);
    p.px(hX, 7, V[1]);
    p.px(hX, 9, V[1]);
    p.px(15, 7, F[4]);
    p.px(15, 9, F[4]);

    // Antennae
    p.line(hX, 6, 15, 4 + flick, F[3]);
    p.line(hX, 10, 15, 12 - flick, F[3]);
  }

  drawQueenAnt(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    angle: number,
    legPhase: number
  ): void {
    const TWO_PI = Math.PI * 2;
    const normalizedPhase = ((legPhase % TWO_PI) + TWO_PI) % TWO_PI;
    const frame = Math.floor(normalizedPhase / (TWO_PI / ANT_FRAMES)) % ANT_FRAMES;

    const sprite = this.queenAntSprites.get(`queen-${frame}`);
    if (!sprite) return;

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
   * dithered top-left shell highlight, stubby legs, amber eye pixels.
   * Olive wildlife shell — never the Swarm's flesh or the UI danger red.
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
    this.outlined((dx, dy, c) => p.ellipse(6 + dx, cy + dy, 4, 3.2, c ?? PAL.beetle[1]));
    // Top-left dithered highlight
    p.dither(4, 5, 3, 2, PAL.beetle[2], PAL.beetle[1]);
    p.px(4, 5, PAL.beetle[2]);
    // Bottom-right dithered shading
    p.dither(7, 8, 3, 2, PAL.beetle[0], PAL.beetle[1]);
    // Elytra seam along the body axis (1 art px)
    p.hline(3, 7, 7, PAL.beetle[0]);

    // Head
    this.outlined((dx, dy, c) => p.disc(11 + dx, cy + dy, 1.4, c ?? PAL.beetle[1]));
    p.px(10, 6, PAL.beetle[2]); // top-left highlight

    // Eyes — amber
    p.px(12, 6, PAL.beetleEye);
    p.px(12, 8, PAL.beetleEye);

    // Mandibles
    p.px(13, 6, PAL.beetle[0]);
    p.px(13, 8, PAL.beetle[0]);
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
        const col = c ?? PAL.cricket[1];
        p.line(13 + dx, cy + s * 2 + dy, 8 + dx, cy + s * 8 + dy, col);
        p.line(14 + dx, cy + s * 2 + dy, 9 + dx, cy + s * 8 + dy, col);
        p.line(14 + dx, cy + s * 3 + dy, 9 + dx, cy + s * 9 + dy, col);
      });
      p.px(9, cy + s * 8, PAL.cricket[2]); // knee highlight
      p.line(13, cy + s * 3, 10, cy + s * 7, PAL.cricket[0]); // trailing-edge shade
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
        p.vline(x + dx, cy - halfH + dy, halfH * 2 + 1, c ?? PAL.cricket[1]);
      }
    });
    // Folded wings: light dorsal stripe, dark seam + under-edge
    p.line(7, cy - 1, 15, cy - 1, PAL.cricket[2]);
    p.line(5, cy, 10, cy, PAL.cricket[0]); // wing seam over the tail half
    p.line(8, cy + 2, 15, cy + 2, PAL.cricket[0]);
    // Abdomen segment chevrons peeking under the wings (stay inside the fill)
    p.px(6, cy + 1, PAL.cricket[0]);
    p.vline(9, cy + 1, 2, PAL.cricket[0]);
    p.px(12, cy + 2, PAL.cricket[0]);
    p.dither(12, cy - 2, 4, 1, PAL.cricket[2], PAL.cricket[1]);

    // Head first — the pronotum saddle overlaps its rear, like the reference
    this.outlined((dx, dy, c) => p.ellipse(21 + dx, cy + dy, 2.4, 2.6, c ?? PAL.cricket[1]));

    // Pronotum saddle — wide darker plate riding over body rear + head front
    this.outlined((dx, dy, c) => p.rect(15 + dx, cy - 3 + dy, 4, 7, c ?? PAL.cricket[0]));
    p.line(15, cy - 3, 18, cy - 3, PAL.cricket[1]); // top-lit edge

    // Big black eyes at the sides + highlight
    p.px(20, cy - 2, PAL.cricket[2]); // top-left highlight
    p.rect(21, cy - 2, 2, 1, PAL.black);
    p.rect(21, cy + 2, 2, 1, PAL.black);
    // Mouth palps
    p.px(24, cy - 1, PAL.cricket[0]);
    p.px(24, cy + 1, PAL.cricket[0]);

    // Long antennae swept forward-out, flicking across frames
    p.line(23, cy - 1, 28, cy - 5 + flick, PAL.cricket[0]);
    p.line(23, cy + 1, 28, cy + 5 - flick, PAL.cricket[0]);
    p.px(29, cy - 6 + flick, PAL.cricket[0]);
    p.px(29, cy + 6 - flick, PAL.cricket[0]);
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
   * 16×16 art-pixel panther-cap Amanita: muted rust cap with white spots,
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
      this.paintMeat(p, sizeLevel, PAL.cricket);
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

  /** Small panther-cap food item: muted rust cap, white spots, cream stem. */
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
   * 40×40 art-pixel tree-stump nest, infested by the Swarm: bark ring, wood
   * growth rings, dark entrance with a glowing vein rim, flesh nodules
   * bulging from the bark, root lines.
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

    // Entrance hole with a 1px glowing vein rim
    p.ellipse(cx, 19, 4.6, 2.6, PAL.swarm.vein[1]);
    p.ellipse(cx, 19, 3.8, 2.0, PAL.earth[0]);
    p.ellipse(cx, 19, 2.2, 1.1, PAL.black);

    // Swarm flesh nodules bulging from the bark ring
    for (let i = 0; i < 9; i++) {
      const a = hash2(i, 5) * Math.PI * 2;
      const d = 13.5 + hash2(i, 9) * 2;
      const mx = Math.round(cx + Math.cos(a) * d);
      const my = Math.round(cy + Math.sin(a) * d * 0.52);
      p.px(mx, my, PAL.swarm.flesh[3]);
      p.px(mx + 1, my, PAL.swarm.flesh[2]);
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
    isCarrying: boolean,
    noShadow = false
  ): void {
    // Map continuous legPhase to frame 0-3
    const TWO_PI = Math.PI * 2;
    const normalizedPhase = ((legPhase % TWO_PI) + TWO_PI) % TWO_PI;
    const frame = Math.floor(normalizedPhase / (TWO_PI / ANT_FRAMES)) % ANT_FRAMES;

    const key = `${role}-${frame}`;
    const sprite = noShadow
      ? this.antNoShadowSprites.get(key)
      : isCarrying ? this.antCarrySprites.get(key) : this.antSprites.get(key);
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
