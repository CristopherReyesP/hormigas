import { describe, expect, it } from 'vitest';
import { PAL } from '../pixelart/palette';
import type { ArtGrid } from '../pixelart/ArtGrid';
import { DIRECTIONS } from '../pixelart/directions';
import { PixelPainter } from '../pixelart/PixelPainter';
import { FOOD_SIZE_LEVELS, FOOD_VARIANTS, paintDen, paintFood, paintGiantMushroom } from './propSprites';
import { SPRITE_GRID, rotationSafeRadius, spritePivot } from './spriteScale';

const FROND = 0;
const POD = 1;
const MUSHROOM_FOOD = 2;
const BEETLE_MEAT = 3;
const CRICKET_MEAT = 4;

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

  it('keeps every food frame painted and inside the radius that survives any turn', () => {
    const pivot = spritePivot(SPRITE_GRID.food);
    const r = rotationSafeRadius(SPRITE_GRID.food);
    eachFoodFrame((grid, label) => {
      let painted = 0;
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          if (!grid.get(x, y)) continue;
          painted++;
          expect(Math.hypot(x + 0.5 - pivot, y + 0.5 - pivot), `${label} (${x},${y})`).toBeLessThanOrEqual(r + 1e-9);
        }
      }
      expect(painted, label).toBeGreaterThan(8);
    });
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

/** Shortest distance between two hues, in degrees. */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

describe('alien fronds and pods (leaf food)', () => {
  it('grows a pod cluster as the second leaf variant instead of the frond turned a quarter', () => {
    for (let sizeLevel = 0; sizeLevel < FOOD_SIZE_LEVELS; sizeLevel++) {
      const pod = paintFood({ variant: POD, sizeLevel, direction: 0 });
      const turnedFrond = paintFood({ variant: FROND, sizeLevel, direction: 4 });
      let same = 0;
      let painted = 0;
      for (let y = 0; y < pod.height; y++) {
        for (let x = 0; x < pod.width; x++) {
          if (!pod.get(x, y) && !turnedFrond.get(x, y)) continue;
          painted++;
          if (pod.get(x, y) === turnedFrond.get(x, y)) same++;
        }
      }
      expect(same / painted, `size ${sizeLevel}`).toBeLessThan(0.8);
    }
  });

  it('keeps fronds and pods in the teal-lime frond ramp', () => {
    const allowed = new Set<string>([...PAL.leaf, PAL.outline]);
    eachFoodFrame((grid, label) => {
      for (const c of gridColors(grid)) expect(allowed.has(c), `${label} ${c}`).toBe(true);
    }, [FROND, POD]);
  });
});

describe('alien flesh (wildlife meat)', () => {
  it('never reads as Swarm flesh or raw red meat', () => {
    const swarmHue = hsl(PAL.swarm.flesh[3]).h;
    const oldMeat = new Set<string>(PAL.meat);
    eachFoodFrame((grid, label) => {
      for (const c of gridColors(grid)) {
        if (c === PAL.outline) continue;
        expect(oldMeat.has(c), `${label} ${c} is the old meat`).toBe(false);
        const { h, s } = hsl(c);
        if (s < 0.2) continue;
        expect(hueGap(h, swarmHue), `${label} ${c} near Swarm magenta`).toBeGreaterThan(45);
        expect(hueGap(h, 0), `${label} ${c} reads as red meat`).toBeGreaterThan(15);
      }
    }, [BEETLE_MEAT, CRICKET_MEAT]);
  });

  it('shows whose carcass it is: a beetle shell shard or a cricket leg on the same flesh', () => {
    for (let sizeLevel = 1; sizeLevel < FOOD_SIZE_LEVELS; sizeLevel++) {
      const beetle = new Set(gridColors(paintFood({ variant: BEETLE_MEAT, sizeLevel, direction: 0 })));
      const cricket = new Set(gridColors(paintFood({ variant: CRICKET_MEAT, sizeLevel, direction: 0 })));
      expect(PAL.beetle.some(c => beetle.has(c)), `beetle size ${sizeLevel}`).toBe(true);
      expect(PAL.cricket.some(c => cricket.has(c)), `cricket size ${sizeLevel}`).toBe(true);
      const shared = [...beetle].filter(c => cricket.has(c) && c !== PAL.outline);
      expect(shared.length, `shared flesh size ${sizeLevel}`).toBeGreaterThan(0);
    }
  });
});

describe('alien dens', () => {
  const REGOLITH = [...PAL.soil, ...PAL.stone, ...PAL.dust, ...PAL.earth, PAL.mineralFleck, PAL.outcropVein, PAL.outline, PAL.black];

  it('paints both dens from the alien regolith palette, with no grass or moss tufts', () => {
    const beetleAllowed = new Set<string>([...REGOLITH, PAL.beetleEye]);
    const cricketAllowed = new Set<string>([...REGOLITH, ...PAL.cricket]);
    for (const c of new Set(staticColors(beetleDen()))) expect(beetleAllowed.has(c), `beetle den ${c}`).toBe(true);
    for (const c of new Set(staticColors(cricketDen()))) expect(cricketAllowed.has(c), `cricket den ${c}`).toBe(true);
  });

  it('shows who lives inside: amber beetle eyes in the burrow, cricket antennae in the hollow', () => {
    expect(staticColors(beetleDen()).filter(c => c === PAL.beetleEye).length).toBeGreaterThanOrEqual(2);
    const cricketShades = new Set<string>(PAL.cricket);
    expect(staticColors(cricketDen()).filter(c => cricketShades.has(c)).length).toBeGreaterThanOrEqual(4);
  });

  it('keeps the two dens apart at a glance', () => {
    const a = beetleDen().colors;
    const b = cricketDen().colors;
    let differ = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differ++;
    expect(differ / a.length).toBeGreaterThan(0.25);
  });
});
