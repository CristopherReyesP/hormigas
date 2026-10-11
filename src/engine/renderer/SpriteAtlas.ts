import { AntRole } from '../../game/components/components';
import { PAL, hash2 } from './pixelart/palette';
import { PixelPainter } from './pixelart/PixelPainter';
import { blitArtGrid, type ArtGrid } from './pixelart/ArtGrid';
import { DIRECTIONS, directionIndex } from './pixelart/directions';
import { ART_PX, SPRITE_GRID, WALK_FRAMES, nestPixelsPerArtPixel, spritePivot, walkFrame } from './sprites/spriteScale';
import { paintAnt, paintQueen } from './sprites/swarmSprites';
import { LEAPER_FRAMES, type LeaperPose, leaperFrameIndex, paintBeetle, paintCricket } from './sprites/wildlifeSprites';
import { FOOD_SIZE_LEVELS, FOOD_VARIANTS, paintDen, paintFood, paintGiantMushroom } from './sprites/propSprites';
import { NO_MARKS, antSheetKey, type AntMarks } from './sprites/antMarks';
import { paintLegionNest, paintLegionQueen, paintLegionary, paintMantis, paintSpider, paintSpiderLair, paintTarantula } from './sprites/frontierSprites';

/** Phase 2's creatures beyond the wall, by sprite */
export type FrontierSpriteKind = 'legionary' | 'legion_queen' | 'spider' | 'mantis' | 'tarantula';
/** Phase 2's dens */
export type FrontierDenSpriteKind = 'legion_nest' | 'spider_lair';

export { antGlowPoints, type AntGlowPoint } from './sprites/swarmSprites';

/** Nest sprite canvas px per art px (the mound is drawn down to whole world px per art px). */
const NEST_SCALE = 4;
const NEST_SPRITE_SIZE = SPRITE_GRID.nest * NEST_SCALE;
const DEN_SPRITE_SIZE = SPRITE_GRID.den * ART_PX;
const GIANT_MUSHROOM_SPRITE_SIZE = SPRITE_GRID.giantMushroom * ART_PX;

const ANT_ROLES: readonly AntRole[] = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender];

/** Baked ant sheets kept at once (~0.3 MB each): the colony's castes plus a few previews. */
const MAX_ANT_SHEETS = 24;

/**
 * Every walk frame of one sprite in all 16 directions, baked once at 1 canvas
 * px per art px and drawn ART_PX times larger, unrotated and unsmoothed, so
 * each art pixel lands as a crisp square. Column = frame × 16 + direction,
 * row = a variant (carrying, swollen, size level…).
 */
class DirectionalSheet {
  private readonly canvas: HTMLCanvasElement;
  private readonly grid: number;
  private readonly frames: number;
  private readonly pivotPx: number;

  constructor(grid: number, frames: number, rows: number, paint: (row: number, frame: number, direction: number) => ArtGrid) {
    this.grid = grid;
    this.frames = frames;
    this.pivotPx = spritePivot(grid) * ART_PX;
    this.canvas = document.createElement('canvas');
    this.canvas.width = grid * frames * DIRECTIONS;
    this.canvas.height = grid * rows;
    const ctx = this.canvas.getContext('2d')!;
    for (let row = 0; row < rows; row++) {
      for (let frame = 0; frame < frames; frame++) {
        for (let d = 0; d < DIRECTIONS; d++) {
          blitArtGrid(ctx, paint(row, frame, d), (frame * DIRECTIONS + d) * grid, row * grid);
        }
      }
    }
  }

  /** Draw with the sprite's pivot pixel on (worldX, worldY), facing the direction nearest `angle`. */
  draw(ctx: CanvasRenderingContext2D, worldX: number, worldY: number, angle: number, frame: number, row = 0): void {
    const g = this.grid;
    const sx = ((frame % this.frames) * DIRECTIONS + directionIndex(angle)) * g;
    const size = g * ART_PX;
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.canvas, sx, row * g, g, g,
      Math.round(worldX - this.pivotPx), Math.round(worldY - this.pivotPx), size, size,
    );
    ctx.imageSmoothingEnabled = smoothing;
  }
}

/**
 * Pre-renders all entity sprites to offscreen canvases. Deliberate PIXEL ART
 * on ONE scale: every sprite is authored on an art-pixel grid (ArtPen or
 * PixelPainter, PAL colors only) and lands at ART_PX world px per art px —
 * 2 screen px at zoom 1. Units and food are baked in 16 snapped directions
 * (lit from the top-left after the turn) instead of being rotated at draw
 * time; unit sheets bake lazily on first use.
 */
export class SpriteAtlas {
  // Ant sheets, one per caste × shadow × the marks that caste shows: rows 0 = empty-handed, 1 = carrying food, 2 = carrying ore
  private antSheets = new Map<string, DirectionalSheet>();
  // Per mark-set object, the sheet of each caste/shadow slot: draws skip key building
  private antSheetIndex = new WeakMap<AntMarks, DirectionalSheet[]>();
  private colonyMarks: AntMarks = NO_MARKS;
  private queenSheet: DirectionalSheet | null = null;
  private beetleSheet: DirectionalSheet | null = null;
  private cricketSheet: DirectionalSheet | null = null;
  private foodSheet: DirectionalSheet | null = null;
  private frontierSheets = new Map<FrontierSpriteKind, DirectionalSheet>();
  private frontierDenSprites = new Map<FrontierDenSpriteKind, HTMLCanvasElement>();

  // Static props, pre-scaled to world px (they never rotate)
  private nestSprite: HTMLCanvasElement;
  private denSprite: HTMLCanvasElement;
  private cricketDenSprite: HTMLCanvasElement;
  private giantMushroomSprite: HTMLCanvasElement;

  constructor() {
    this.nestSprite = this.staticSprite(NEST_SPRITE_SIZE, NEST_SCALE, p => this.paintNest(p));
    this.denSprite = this.staticSprite(DEN_SPRITE_SIZE, ART_PX, p => paintDen(p, false));
    this.cricketDenSprite = this.staticSprite(DEN_SPRITE_SIZE, ART_PX, p => paintDen(p, true));
    this.giantMushroomSprite = this.staticSprite(GIANT_MUSHROOM_SPRITE_SIZE, ART_PX, p => paintGiantMushroom(p));
  }

  private staticSprite(size: number, scale: number, paint: (p: PixelPainter) => void): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    paint(new PixelPainter(ctx, scale));
    return canvas;
  }

  /**
   * The colony's mutation marks; every ant is drawn with the marks its caste
   * shows from now on. Pass the same object while nothing changes (compared
   * by identity); a new set bakes the affected castes once, on first draw.
   */
  setColonyMarks(marks: AntMarks): void {
    this.colonyMarks = marks;
  }

  private antSheet(role: AntRole, shadow: boolean, marks: AntMarks): DirectionalSheet {
    let slots = this.antSheetIndex.get(marks);
    if (!slots) {
      slots = [];
      this.antSheetIndex.set(marks, slots);
    }
    const slot = ANT_ROLES.indexOf(role) * 2 + (shadow ? 1 : 0);
    const indexed = slots[slot];
    if (indexed) return indexed;

    // Castes a pick does not mark keep their key, so they reuse their sheet
    const key = antSheetKey(role, shadow, marks);
    let sheet = this.antSheets.get(key);
    if (!sheet) {
      sheet = new DirectionalSheet(SPRITE_GRID.ant, WALK_FRAMES, 3, (row, frame, direction) =>
        paintAnt({ role, frame, direction, carrying: row === 2 ? 'ore' : row === 1, shadow, marks }));
      this.antSheets.set(key, sheet);
      if (this.antSheets.size > MAX_ANT_SHEETS) this.antSheets.delete(this.antSheets.keys().next().value!);
    }
    slots[slot] = sheet;
    return sheet;
  }

  /** Bake the colony's ant sheets now (otherwise each caste bakes on its first draw). */
  warmUp(): void {
    for (const role of ANT_ROLES) this.antSheet(role, true, this.colonyMarks);
  }

  // ─── Nest Sprite ───────────────────────────────────────────

  // Draws the shape callback 8 times offset by 1 art px in the outline color,
  // then once at (0,0) with color = null so the callback uses its own fills.
  private outlined(draw: (dx: number, dy: number, color: string | null) => void, outline: string = PAL.outline): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx !== 0 || dy !== 0) draw(dx, dy, outline);
      }
    }
    draw(0, 0, null);
  }

  /**
   * 40×40 art-pixel Swarm hive mound, the colony's surface den: a dome of
   * banded chitin plates over living flesh with a dark front wall for
   * height, a glowing orifice on top, chartreuse veins running down from it,
   * pustules, bone spines along the crest and creeping flesh tendrils at its
   * foot. Lit top-left. The orifice sits near the sprite center so the night
   * glow lands on it.
   */
  private paintNest(p: PixelPainter): void {
    const F = PAL.swarm.flesh;
    const V = PAL.swarm.vein;
    const O = PAL.swarm.outline;
    const cx = 20;
    const footY = 24; // footprint center: the dome rises up from here
    const holeY = 19; // the orifice, on top of the dome
    const clamp = (v: number) => Math.max(0, Math.min(39, Math.round(v)));
    /** 1-px elliptical seam on the arc [a0, a1). */
    const seam = (ecy: number, rx: number, ry: number, color: string, a0: number, a1: number) => {
      for (let i = 0; i <= 48; i++) {
        const a = a0 + ((a1 - a0) * i) / 48;
        p.px(clamp(cx + Math.cos(a) * rx), clamp(ecy + Math.sin(a) * ry), color);
      }
    };

    p.shadow(21, 27, 17, 6, PAL.outline);

    // Creeping flesh tendrils at the foot: dark underside, lit top, a bead at the tip
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + hash2(i, 13) * 0.5;
      const reach = 17.5 + hash2(i, 17) * 2;
      const x0 = Math.round(cx + Math.cos(a) * 13);
      const y0 = Math.round(footY + Math.sin(a) * 13 * 0.5);
      const x1 = clamp(cx + Math.cos(a) * reach);
      const y1 = clamp(footY + Math.sin(a) * reach * 0.5);
      p.line(x0, Math.min(39, y0 + 1), x1, Math.min(39, y1 + 1), O);
      p.line(x0, y0, x1, y1, F[1]);
      p.px(x1, y1, i % 2 ? V[0] : F[3]);
    }

    // Body: dark footprint (the front wall), then plate bands rising toward the light
    this.outlined((dx, dy, c) => p.ellipse(cx + dx, footY + dy, 15.5, 8.2, c ?? F[0]), O);
    p.ellipse(cx, 22.8, 14.6, 7.6, F[1]);
    p.ellipse(19.6, 21.2, 13.2, 6.6, F[2]);
    p.ellipse(19.2, 19.6, 10.6, 5.4, F[2]);
    p.dither(9, 17, 10, 4, F[3], F[2]); // the lit upper-left shoulder
    p.ellipse(18.8, 18.2, 7.4, 3.8, F[3]);
    p.dither(11, 15, 8, 3, F[4], F[3]); // top-left sheen
    p.hline(14, 15, 4, F[4]);
    p.px(13, 16, F[4]);

    // Plate edges: dark seams across the front of each band, lit lips on the upper left
    seam(22.8, 14.6, 7.6, O, Math.PI * 0.05, Math.PI * 0.95);
    seam(21.2, 13.2, 6.6, F[0], Math.PI * 0.08, Math.PI * 0.92);
    seam(19.6, 10.6, 5.4, F[1], Math.PI * 0.1, Math.PI * 0.9);
    seam(21.2, 13.0, 6.4, F[3], Math.PI * 1.08, Math.PI * 1.45);
    seam(19.6, 10.4, 5.2, F[4], Math.PI * 1.12, Math.PI * 1.4);
    // Segment joints down the front wall
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.14 + (i / 5) * 0.72);
      p.line(
        clamp(cx + Math.cos(a) * 13.2), clamp(21.2 + Math.sin(a) * 6.6),
        clamp(cx + Math.cos(a) * 15.2), clamp(footY + Math.sin(a) * 8.2),
        F[0],
      );
    }

    // Glowing veins running from the orifice down the dome, beaded at the end
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * (0.15 + i * 0.25) + (hash2(i, 31) - 0.5) * 0.3;
      let x = cx + Math.cos(a) * 5.4;
      let y = holeY + Math.sin(a) * 2.8;
      for (let s = 1; s <= 4; s++) {
        const r = 5.4 + s * 2.3;
        const wob = (hash2(i * 7 + s, 37) - 0.5) * 0.45;
        const nx = cx + Math.cos(a + wob) * r;
        const ny = holeY + Math.sin(a + wob) * r * 0.62;
        p.line(Math.round(x), Math.round(y), clamp(nx), clamp(ny), s <= 2 ? V[1] : V[0]);
        x = nx;
        y = ny;
      }
      p.px(clamp(x), clamp(y), V[1]);
    }
    // A short vein over the lit shoulder, so the glow wraps the dome
    p.line(15, 18, 10, 20, V[0]);
    p.px(10, 20, V[1]);

    // Pustules: soft blisters with a pale shine and a glowing core
    for (const [bx, by] of [[8, 23], [30, 21], [25, 27]] as const) {
      p.disc(bx, by, 1.4, F[3]);
      p.px(bx - 1, by - 1, F[4]);
      p.px(bx, by, V[1]);
    }

    // Bone spines along the crest
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.12 + (i / 6) * 0.76);
      const x = clamp(cx + Math.cos(a) * 13.4);
      const y = clamp(21.2 + Math.sin(a) * 6.6);
      p.px(x, y - 1, O);
      p.px(x, y, F[4]);
    }

    // The orifice: raised fleshy lip, glowing vein rim, dark throat, pale teeth
    p.ellipse(cx, holeY + 0.5, 5.8, 3.3, F[0]);
    p.ellipse(cx, holeY - 0.2, 5.3, 2.9, F[3]);
    p.ellipse(cx, holeY, 4.6, 2.5, V[1]);
    p.ellipse(cx, holeY, 3.8, 1.9, F[0]);
    p.ellipse(cx, holeY, 2.2, 1.1, PAL.black);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      p.px(Math.round(cx + Math.cos(a) * 5.3), Math.round(holeY + Math.sin(a) * 2.9), F[4]);
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
    isCarrying: boolean | 'ore',
    noShadow = false,
    marks: AntMarks = this.colonyMarks
  ): void {
    const row = isCarrying === 'ore' ? 2 : isCarrying ? 1 : 0;
    this.antSheet(role, !noShadow, marks).draw(ctx, worldX, worldY, angle, walkFrame(legPhase), row);
  }

  /** The brood queen; `swollen` is the breathing step of her egg sac. */
  drawQueenAnt(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    angle: number,
    legPhase: number,
    swollen = false
  ): void {
    this.queenSheet ??= new DirectionalSheet(SPRITE_GRID.queen, WALK_FRAMES, 2, (row, frame, direction) =>
      paintQueen({ frame, direction, swollen: row === 1 }));
    this.queenSheet.draw(ctx, worldX, worldY, angle, walkFrame(legPhase), swollen ? 1 : 0);
  }

  drawFood(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    variant: number,
    sizeLevel: number,
    rotation: number
  ): void {
    this.foodSheet ??= new DirectionalSheet(SPRITE_GRID.food, 1, FOOD_VARIANTS * FOOD_SIZE_LEVELS, (row, _frame, direction) =>
      paintFood({ variant: Math.floor(row / FOOD_SIZE_LEVELS), sizeLevel: row % FOOD_SIZE_LEVELS, direction }));
    const row = (variant % FOOD_VARIANTS) * FOOD_SIZE_LEVELS + Math.min(FOOD_SIZE_LEVELS - 1, Math.max(0, sizeLevel));
    this.foodSheet.draw(ctx, worldX, worldY, rotation, 0, row);
  }

  drawNest(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    radius: number
  ): void {
    // Whole world px per art px, drawn unsmoothed: every art pixel stays a crisp square
    const s = nestPixelsPerArtPixel(radius) / NEST_SCALE;
    const half = NEST_SPRITE_SIZE / 2;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(worldX), Math.round(worldY));
    ctx.scale(s, s);
    ctx.drawImage(this.nestSprite, -half, -half);
    ctx.restore();
  }

  drawBeetle(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    angle: number,
    legPhase: number
  ): void {
    this.beetleSheet ??= new DirectionalSheet(SPRITE_GRID.beetle, WALK_FRAMES, 1, (_row, frame, direction) =>
      paintBeetle({ frame, direction }));
    this.beetleSheet.draw(ctx, worldX, worldY, angle, walkFrame(legPhase));
  }

  /** A Phase 2 creature, facing `angle` */
  drawFrontierCreature(ctx: CanvasRenderingContext2D, kind: FrontierSpriteKind, worldX: number, worldY: number, angle: number, legPhase: number): void {
    let sheet = this.frontierSheets.get(kind);
    if (!sheet) {
      const recipe = {
        legionary: { grid: SPRITE_GRID.legionary, paint: paintLegionary },
        legion_queen: { grid: SPRITE_GRID.legionQueen, paint: paintLegionQueen },
        spider: { grid: SPRITE_GRID.spider, paint: paintSpider },
        mantis: { grid: SPRITE_GRID.mantis, paint: paintMantis },
        tarantula: { grid: SPRITE_GRID.tarantula, paint: paintTarantula },
      }[kind];
      sheet = new DirectionalSheet(recipe.grid, WALK_FRAMES, 1, (_row, frame, direction) => recipe.paint({ frame, direction }));
      this.frontierSheets.set(kind, sheet);
    }
    sheet.draw(ctx, worldX, worldY, angle, walkFrame(legPhase));
  }

  /** A Phase 2 den: the Legionary nest or a spider lair */
  drawFrontierDen(ctx: CanvasRenderingContext2D, kind: FrontierDenSpriteKind, worldX: number, worldY: number): void {
    let sprite = this.frontierDenSprites.get(kind);
    if (!sprite) {
      sprite = this.staticSprite(DEN_SPRITE_SIZE, ART_PX, kind === 'legion_nest' ? paintLegionNest : paintSpiderLair);
      this.frontierDenSprites.set(kind, sprite);
    }
    this.drawStatic(ctx, sprite, worldX, worldY);
  }

  drawBeetleDen(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number
  ): void {
    this.drawStatic(ctx, this.denSprite, worldX, worldY);
  }

  drawCricket(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    angle: number,
    legPhase: number,
    pose: LeaperPose = 'walk'
  ): void {
    // The alien leaper: 4 walk frames, then its crouch and leap poses
    this.cricketSheet ??= new DirectionalSheet(SPRITE_GRID.cricket, LEAPER_FRAMES.length, 1, (_row, frame, direction) =>
      paintCricket({ ...LEAPER_FRAMES[frame], direction }));
    this.cricketSheet.draw(ctx, worldX, worldY, angle, leaperFrameIndex(pose, legPhase));
  }

  drawCricketDen(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number
  ): void {
    this.drawStatic(ctx, this.cricketDenSprite, worldX, worldY);
  }

  drawGiantMushroom(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number
  ): void {
    this.drawStatic(ctx, this.giantMushroomSprite, worldX, worldY);
  }

  private drawStatic(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, worldX: number, worldY: number): void {
    ctx.drawImage(sprite, Math.round(worldX - sprite.width / 2), Math.round(worldY - sprite.height / 2));
  }
}

let shared: SpriteAtlas | null = null;

/** The one atlas the game view and the UI previews share (so portraits show the colony's marks); built on first use. */
export function sharedSpriteAtlas(): SpriteAtlas {
  shared ??= new SpriteAtlas();
  return shared;
}
