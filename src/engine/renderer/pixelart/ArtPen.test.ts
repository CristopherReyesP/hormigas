import { describe, expect, it } from 'vitest';
import { ArtGrid } from './ArtGrid';
import { ArtPen } from './ArtPen';
import { DIRECTIONS, directionAngle } from './directions';

const RAMP = ['#100000', '#300000', '#500000', '#700000', '#900000'] as const;
const OUTLINE = '#000001';

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

describe('ArtPen at angle 0 (the authoring frame)', () => {
  it('paints exactly the art pixels it is given', () => {
    const grid = new ArtGrid(24);
    const pen = new ArtPen(grid);
    pen.px(3, 4, RAMP[0]);
    pen.line(5, 5, 8, 5, RAMP[1]);
    pen.rect(10, 10, 2, 3, RAMP[2]);
    expect(grid.get(3, 4)).toBe(RAMP[0]);
    for (let x = 5; x <= 8; x++) expect(grid.get(x, 5)).toBe(RAMP[1]);
    expect(painted(grid).filter(([, , c]) => c === RAMP[2])).toHaveLength(6);
  });

  it('rasterizes ellipses like PixelPainter (radius + 0.25 rule)', () => {
    const grid = new ArtGrid(24);
    new ArtPen(grid).ellipse(12, 12, 2, 1, RAMP[3]);
    // rx 2, ry 1: rows 11..13; the middle row spans x 10..14
    for (let x = 10; x <= 14; x++) expect(grid.get(x, 12)).toBe(RAMP[3]);
    expect(grid.get(9, 12)).toBeNull();
    expect(grid.get(12, 11)).toBe(RAMP[3]);
    expect(grid.get(12, 10)).toBeNull();
  });
});

describe('ArtPen rotation (pre-baked directions)', () => {
  it('turns a quarter turn onto exact pixels around the pivot pixel', () => {
    const grid = new ArtGrid(24);
    new ArtPen(grid, Math.PI / 2).line(12, 12, 16, 12, RAMP[1]);
    for (let y = 12; y <= 16; y++) expect(grid.get(12, y)).toBe(RAMP[1]);
    expect(painted(grid)).toHaveLength(5);
  });

  it('keeps rotated lines unbroken in every direction', () => {
    for (let d = 0; d < DIRECTIONS; d++) {
      const grid = new ArtGrid(24);
      new ArtPen(grid, directionAngle(d)).line(12, 12, 21, 14, RAMP[1]);
      const pts = painted(grid);
      expect(pts.length).toBeGreaterThanOrEqual(9);
      // every pixel touches another one (8-connected chain)
      for (const [x, y] of pts) {
        const neighbours = pts.filter(([nx, ny]) => (nx !== x || ny !== y) && Math.abs(nx - x) <= 1 && Math.abs(ny - y) <= 1);
        expect(neighbours.length).toBeGreaterThan(0);
      }
    }
  });

  it('fills rotated shapes without holes', () => {
    for (let d = 0; d < DIRECTIONS; d++) {
      const grid = new ArtGrid(24);
      new ArtPen(grid, directionAngle(d)).ellipse(12, 12, 6, 3, RAMP[2]);
      // the pivot and the pixels right next to it along both axes are inside
      for (const [x, y] of [[12, 12], [11, 12], [13, 12], [12, 11], [12, 13]]) {
        expect(grid.get(x, y), `dir ${d} (${x},${y})`).toBe(RAMP[2]);
      }
      const area = painted(grid).length;
      expect(area).toBeGreaterThan(55);
      expect(area).toBeLessThan(85);
    }
  });

  it('dithers on a clean screen-space checkerboard at any angle', () => {
    const grid = new ArtGrid(24);
    new ArtPen(grid, directionAngle(3)).dither(8, 8, 8, 8, RAMP[0], RAMP[4]);
    for (const [x, y, c] of painted(grid)) expect(c).toBe((x + y) % 2 === 0 ? RAMP[0] : RAMP[4]);
  });
});

describe('ArtPen silhouettes, light and shadow', () => {
  it('outlines a group with a 1-px ring that is not part of the body', () => {
    const grid = new ArtGrid(24);
    new ArtPen(grid).outlined(p => p.disc(12, 12, 3, RAMP[2]), OUTLINE);
    expect(grid.get(12, 12)).toBe(RAMP[2]);
    expect(grid.isBody(12, 12)).toBe(true);
    expect(grid.get(12, 8)).toBe(OUTLINE); // just above the disc top (row 9)
    expect(grid.isBody(12, 8)).toBe(false);
    expect(grid.get(12, 7)).toBeNull();
  });

  it('lights the top-left rim and shades the bottom-right rim in every direction', () => {
    for (let d = 0; d < DIRECTIONS; d++) {
      const grid = new ArtGrid(24);
      const pen = new ArtPen(grid, directionAngle(d));
      pen.outlined(p => p.ellipse(12, 12, 7, 3, RAMP[2]), OUTLINE);
      pen.shade([RAMP]);
      const body = painted(grid).filter(([x, y]) => grid.isBody(x, y));
      const lit = body.filter(([, , c]) => c === RAMP[3]);
      const shaded = body.filter(([, , c]) => c === RAMP[1]);
      expect(lit.length, `dir ${d} lit`).toBeGreaterThan(4);
      expect(shaded.length, `dir ${d} shaded`).toBeGreaterThan(4);
      // the ellipse centre sits on pixel (12, 12): lit rims are above or left of it, shaded rims below or right
      for (const [x, y] of lit) expect(x < 12 || y < 12, `dir ${d} lit (${x},${y})`).toBe(true);
      for (const [x, y] of shaded) expect(x > 12 || y > 12, `dir ${d} shaded (${x},${y})`).toBe(true);
      const meanSum = (v: Array<[number, number, string]>) => v.reduce((s, [x, y]) => s + x + y, 0) / v.length;
      expect(meanSum(lit), `dir ${d} balance`).toBeLessThan(meanSum(shaded) - 4);
      expect(grid.get(12, 12), `dir ${d} core`).toBe(RAMP[2]);
    }
  });

  it('puts the sheen up and to the left of the dome in screen space, whatever the facing', () => {
    for (const d of [0, 4, 8, 12, 5]) {
      const grid = new ArtGrid(24);
      const pen = new ArtPen(grid, directionAngle(d));
      pen.outlined(p => p.disc(15, 12, 4, RAMP[2]), OUTLINE);
      pen.sheen(15, 12, 2, RAMP[4]);
      const centre = pen.toGrid(15, 12);
      const sheen = painted(grid).filter(([, , c]) => c === RAMP[4]);
      expect(sheen).toHaveLength(1);
      expect(sheen[0][0]).toBe(centre[0] - 2);
      expect(sheen[0][1]).toBe(centre[1] - 2);
    }
  });

  it('casts a dithered shadow down and to the right onto empty pixels only', () => {
    const grid = new ArtGrid(24);
    const pen = new ArtPen(grid, directionAngle(6));
    pen.outlined(p => p.ellipse(12, 12, 5, 3, RAMP[2]), OUTLINE);
    pen.castShadow(RAMP[0], 1, 2);
    const shadow = painted(grid).filter(([, , c]) => c === RAMP[0]);
    expect(shadow.length).toBeGreaterThan(0);
    const solid = painted(grid).filter(([, , c]) => c !== RAMP[0]);
    const cx = solid.reduce((s, [x]) => s + x, 0) / solid.length;
    const cy = solid.reduce((s, [, y]) => s + y, 0) / solid.length;
    for (const [x, y] of shadow) {
      expect((x + y) % 2).toBe(0);
      expect(x + y).toBeGreaterThan(cx + cy);
    }
  });
});
