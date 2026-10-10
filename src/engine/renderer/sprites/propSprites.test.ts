import { describe, expect, it } from 'vitest';
import { PAL } from '../pixelart/palette';
import type { ArtGrid } from '../pixelart/ArtGrid';
import { DIRECTIONS } from '../pixelart/directions';
import { PixelPainter } from '../pixelart/PixelPainter';
import { FOOD_SIZE_LEVELS, FOOD_VARIANTS, paintDen, paintFood, paintGiantMushroom } from './propSprites';
import { SPRITE_GRID } from './spriteScale';

const MUSHROOM_FOOD = 2;

function hsl(hex: string): { h: number; s: number; l: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s, l };
}

/** Brown caps, rust, cream and straw stalks: the warm, saturated hues of an Earth toadstool. */
function isEarthToadstoolTone(hex: string): boolean {
  const { h, s, l } = hsl(hex);
  return h >= 10 && h <= 60 && s > 0.2 && l > 0.15;
}

/** A pale teal-mint glow: the fungus's bioluminescent pores and gills. */
function isBioluminescent(hex: string): boolean {
  const { h, s, l } = hsl(hex);
  return h >= 140 && h <= 200 && s > 0.25 && l > 0.5;
}

interface StaticFrame {
  size: number;
  colors: Array<string | null>;
  /** fillRect calls that reached outside the frame */
  outOfBounds: number;
}

/** Paint a static prop at 1 canvas px per art px into a recording context. */
function paintStatic(size: number, paint: (p: PixelPainter) => void): StaticFrame {
  const frame: StaticFrame = { size, colors: new Array<string | null>(size * size).fill(null), outOfBounds: 0 };
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number): void {
      for (let iy = y; iy < y + h; iy++) {
        for (let ix = x; ix < x + w; ix++) {
          if (ix < 0 || iy < 0 || ix >= size || iy >= size) frame.outOfBounds++;
          else frame.colors[iy * size + ix] = this.fillStyle;
        }
      }
    },
  };
  paint(new PixelPainter(ctx as unknown as CanvasRenderingContext2D, 1));
  return frame;
}

function staticColors(frame: StaticFrame): string[] {
  return frame.colors.filter((c): c is string => c !== null);
}

function gridColors(grid: ArtGrid): string[] {
  const out: string[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const c = grid.get(x, y);
      if (c) out.push(c);
    }
  }
  return out;
}

const giantMushroom = (): StaticFrame => paintStatic(SPRITE_GRID.giantMushroom, p => paintGiantMushroom(p));
const beetleDen = (): StaticFrame => paintStatic(SPRITE_GRID.den, p => paintDen(p, false));
const cricketDen = (): StaticFrame => paintStatic(SPRITE_GRID.den, p => paintDen(p, true));

function eachFoodFrame(visit: (grid: ArtGrid, label: string) => void, variants = [...Array(FOOD_VARIANTS).keys()]): void {
  for (const variant of variants) {
    for (let sizeLevel = 0; sizeLevel < FOOD_SIZE_LEVELS; sizeLevel++) {
      for (let direction = 0; direction < DIRECTIONS; direction++) {
        visit(paintFood({ variant, sizeLevel, direction }), `v${variant} s${sizeLevel} d${direction}`);
      }
    }
  }
}

describe('prop sprite frames', () => {
  it('keeps the atlas layout: 5 food variants × 5 sizes of 16×16 art px in 16 directions', () => {
    expect(FOOD_VARIANTS).toBe(5);
    expect(FOOD_SIZE_LEVELS).toBe(5);
    expect(DIRECTIONS).toBe(16);
    let frames = 0;
    eachFoodFrame(grid => {
      expect(grid.width).toBe(SPRITE_GRID.food);
      expect(grid.height).toBe(SPRITE_GRID.food);
      frames++;
    });
    expect(frames).toBe(5 * 5 * 16);
  });

  it('paints the static props on their 32 and 40 art-px grids without spilling over the edge', () => {
    expect(SPRITE_GRID.giantMushroom).toBe(32);
    expect(SPRITE_GRID.den).toBe(40);
    for (const frame of [giantMushroom(), beetleDen(), cricketDen()]) {
      expect(frame.outOfBounds).toBe(0);
      expect(staticColors(frame).length).toBeGreaterThan(frame.size * frame.size * 0.2);
    }
  });
});

describe('alien fungus (giant mushroom and mushroom food)', () => {
  it('drops the Earth toadstool: no brown cap, cream stalk or white warts on the giant mushroom', () => {
    const colors = new Set(staticColors(giantMushroom()));
    for (const old of [PAL.shroomCap, PAL.shroomCapLight, PAL.shroomStem, PAL.white, PAL.sand[1]]) {
      expect(colors.has(old), old).toBe(false);
    }
    for (const c of colors) {
      if (c !== PAL.outline) expect(isEarthToadstoolTone(c), `${c} reads as an Earth toadstool`).toBe(false);
    }
  });

  it('glows: the giant mushroom carries teal bioluminescent pores and gills', () => {
    const glowing = staticColors(giantMushroom()).filter(isBioluminescent);
    expect(glowing.length).toBeGreaterThanOrEqual(12);
  });

  it('keeps the giant mushroom below the units in saturation so they still pop', () => {
    const swarm = hsl(PAL.swarm.flesh[3]).s;
    const shell = hsl(PAL.crystal.shell[2]).s;
    const unitSaturation = Math.min(swarm, shell);
    const counts = new Map<string, number>();
    for (const c of staticColors(giantMushroom())) counts.set(c, (counts.get(c) ?? 0) + 1);
    // The cap and stalk body (every color covering 30+ px) stays duller than the faction flesh and shell
    for (const [c, n] of counts) {
      if (n >= 30 && c !== PAL.outline) expect(hsl(c).s, c).toBeLessThan(unitSaturation);
    }
  });

  it('drops the Earth toadstool from the mushroom food in every size and direction', () => {
    eachFoodFrame((grid, label) => {
      for (const c of gridColors(grid)) {
        if (c === PAL.outline) continue;
        expect(c === PAL.white || c === PAL.shroomStem || c === PAL.shroomCap, `${label} ${c}`).toBe(false);
        expect(isEarthToadstoolTone(c), `${label} ${c} reads as an Earth toadstool`).toBe(false);
      }
    }, [MUSHROOM_FOOD]);
  });

  it('lights the bigger mushroom food with glowing pores', () => {
    for (let sizeLevel = 2; sizeLevel < FOOD_SIZE_LEVELS; sizeLevel++) {
      const grid = paintFood({ variant: MUSHROOM_FOOD, sizeLevel, direction: 0 });
      expect(gridColors(grid).some(isBioluminescent), `size ${sizeLevel}`).toBe(true);
    }
  });
});
