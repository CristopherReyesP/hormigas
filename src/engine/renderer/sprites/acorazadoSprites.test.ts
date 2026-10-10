// The beetle (shown in game as the "acorazado") is an alien burrower, not an
// insect: only the player's Swarm keeps an insect body plan.
import { describe, expect, it } from 'vitest';
import { PAL } from '../pixelart/palette';
import type { ArtGrid } from '../pixelart/ArtGrid';
import { DIRECTIONS } from '../pixelart/directions';
import { PixelPainter } from '../pixelart/PixelPainter';
import { paintDen } from './propSprites';
import { SPRITE_GRID, WALK_FRAMES } from './spriteScale';
import { paintBeetle } from './wildlifeSprites';

function painted(grid: ArtGrid): Array<[number, number, string]> {
  const out: Array<[number, number, string]> = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const c = grid.get(x, y);
      if (c) out.push([x, y, c]);
    }
  }
  return out;
}

function eachFrame(visit: (grid: ArtGrid, label: string) => void, shadow = true): void {
  for (let frame = 0; frame < WALK_FRAMES; frame++) {
    for (let direction = 0; direction < DIRECTIONS; direction++) {
      visit(paintBeetle({ frame, direction, shadow }), `f${frame} d${direction}`);
    }
  }
}

const FACTION_HUES = new Set<string>([
  ...PAL.swarm.flesh, ...PAL.swarm.vein, PAL.swarm.outline,
  ...PAL.crystal.shell, ...PAL.crystal.gold, PAL.crystal.shield, PAL.crystal.outline,
]);

function denColors(): string[] {
  const size = SPRITE_GRID.den;
  const colors: string[] = [];
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number): void {
      for (let iy = y; iy < y + h; iy++) {
        for (let ix = x; ix < x + w; ix++) if (ix >= 0 && iy >= 0 && ix < size && iy < size) colors.push(this.fillStyle);
      }
    },
  };
  paintDen(new PixelPainter(ctx as unknown as CanvasRenderingContext2D, 1), false);
  return colors;
}

describe('acorazado sprite frames', () => {
  it('keeps 4 walk frames × 16 directions of 28×28 art px', () => {
    let frames = 0;
    eachFrame(grid => {
      expect(grid.width).toBe(28);
      expect(grid.height).toBe(28);
      frames++;
    });
    expect(frames).toBe(4 * 16);
  });

  it('never uses the Swarm magenta or the crystal cyan and gold', () => {
    eachFrame((grid, label) => {
      for (const [x, y, c] of painted(grid)) expect(FACTION_HUES.has(c), `${label} (${x},${y}) ${c}`).toBe(false);
    });
  });
});

describe('acorazado body plan: an armored alien burrower', () => {
  it('has no thin insect legs or antennae: every limb is a solid outlined stump', () => {
    eachFrame((grid, label) => {
      for (const [x, y] of painted(grid)) expect(grid.isSolid(x, y), `${label} (${x},${y})`).toBe(true);
    }, false);
  });

  it('wears overlapping bony ash plates over the olive hide', () => {
    eachFrame((grid, label) => {
      const colors = painted(grid).map(([, , c]) => c);
      expect(colors.filter(c => PAL.beetleAsh.includes(c as never)).length, label).toBeGreaterThanOrEqual(25);
      expect(colors.filter(c => PAL.beetle.includes(c as never)).length, label).toBeGreaterThanOrEqual(60);
    });
  });

  it('shows a small cluster of eyes (more than an insect pair) and a toothy maw at the front', () => {
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      const grid = paintBeetle({ frame, direction: 0, shadow: false });
      const px = painted(grid);
      const eyes = px.filter(([, , c]) => c === PAL.beetleEye);
      expect(eyes.length, `f${frame} eyes`).toBeGreaterThanOrEqual(3);
      expect(eyes.length, `f${frame} eyes`).toBeLessThanOrEqual(6);
      const teeth = px.filter(([x, , c]) => x >= 21 && c === PAL.beetleAsh[2]);
      expect(teeth.length, `f${frame} teeth`).toBeGreaterThanOrEqual(4);
      expect(px.some(([x, , c]) => x >= 21 && c === PAL.black), `f${frame} maw`).toBe(true);
    }
  });

  it('opens and shuts the maw as it walks', () => {
    const shape = (frame: number) => painted(paintBeetle({ frame, direction: 0, shadow: false }))
      .filter(([x]) => x >= 21).map(([x, y, c]) => `${x},${y},${c}`).join(' ');
    expect(shape(0)).not.toBe(shape(2));
  });
});

describe('acorazado den: an alien burrow mound with plates', () => {
  it('shows bony plates around the burrow and the eye cluster inside', () => {
    const colors = denColors();
    expect(colors.filter(c => PAL.beetleAsh.includes(c as never)).length).toBeGreaterThanOrEqual(40);
    expect(colors.filter(c => c === PAL.beetleEye).length).toBeGreaterThanOrEqual(3);
    for (const c of colors) expect(FACTION_HUES.has(c), c).toBe(false);
  });
});
