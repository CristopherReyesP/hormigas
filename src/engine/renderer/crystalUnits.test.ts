import { describe, expect, it } from 'vitest';
import { PAL } from './pixelart/palette';
import {
  CRYSTAL_BOB_AMPLITUDE,
  CRYSTAL_FRAME_COUNT,
  CRYSTAL_UNIT_KINDS,
  CRYSTAL_UNIT_SIZE,
  UNIT_ART_PX,
  bakeCrystalUnit,
  crystalBobOffset,
  drawUnitFrame,
  type UnitFrame,
} from './crystalUnits';

const CRYSTAL_COLORS = new Set<string>([
  ...PAL.crystal.shell,
  ...PAL.crystal.gold,
  PAL.crystal.shield,
  PAL.crystal.outline,
]);

/** First and last rows that hold any painted pixel. */
function paintedRows(frame: UnitFrame): { top: number; bottom: number } {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if (frame.pixels[y * frame.width + x] === null) continue;
      if (top < 0) top = y;
      bottom = y;
      break;
    }
  }
  return { top, bottom };
}

describe('crystal hive unit frames', () => {
  it('bakes every kind as a full bob cycle on its own art-pixel grid', () => {
    for (const kind of CRYSTAL_UNIT_KINDS) {
      const sheet = bakeCrystalUnit(kind);
      const { width, height } = CRYSTAL_UNIT_SIZE[kind];
      expect(sheet.width).toBe(width);
      expect(sheet.height).toBe(height);
      expect(sheet.frames).toHaveLength(CRYSTAL_FRAME_COUNT);
      for (const frame of sheet.frames) {
        expect(frame.width).toBe(width);
        expect(frame.height).toBe(height);
        expect(frame.pixels).toHaveLength(width * height);
      }
    }
  });

  it('grows the grid with the tier, never the art-pixel scale', () => {
    const area = (kind: (typeof CRYSTAL_UNIT_KINDS)[number]) =>
      CRYSTAL_UNIT_SIZE[kind].width * CRYSTAL_UNIT_SIZE[kind].height;
    expect(area('drone')).toBeLessThan(area('sentinel'));
    expect(area('sentinel')).toBeLessThan(area('queen'));
    expect(CRYSTAL_UNIT_SIZE.sentinel.height).toBeGreaterThan(CRYSTAL_UNIT_SIZE.sentinel.width);
    expect(UNIT_ART_PX).toBe(2);
  });

  it('is deterministic: the same kind always bakes the same pixels', () => {
    for (const kind of CRYSTAL_UNIT_KINDS) {
      expect(bakeCrystalUnit(kind)).toEqual(bakeCrystalUnit(kind));
    }
  });

  it('paints only with the crystal ramps, including a bright core, shield glow and gold filigree', () => {
    for (const kind of CRYSTAL_UNIT_KINDS) {
      const used = new Set<string>();
      for (const frame of bakeCrystalUnit(kind).frames) {
        for (const c of frame.pixels) if (c !== null) used.add(c);
      }
      for (const c of used) expect(CRYSTAL_COLORS.has(c), `${kind} paints ${c}`).toBe(true);
      expect(used.has(PAL.crystal.shell[4])).toBe(true); // energy core
      expect(used.has(PAL.crystal.shield)).toBe(true);
      expect(PAL.crystal.gold.some((g) => used.has(g))).toBe(true);
    }
  });

  it('animates: consecutive frames differ (bob, orbit and core pulse)', () => {
    for (const kind of CRYSTAL_UNIT_KINDS) {
      const { frames } = bakeCrystalUnit(kind);
      for (let i = 0; i < frames.length; i++) {
        expect(frames[i].pixels).not.toEqual(frames[(i + 1) % frames.length].pixels);
      }
    }
  });
});

describe('crystal hover bob', () => {
  it('stays within the amplitude and repeats every cycle', () => {
    for (const kind of CRYSTAL_UNIT_KINDS) {
      const amp = CRYSTAL_BOB_AMPLITUDE[kind];
      expect(amp).toBeGreaterThan(0);
      const cycle = Array.from({ length: CRYSTAL_FRAME_COUNT }, (_, i) => crystalBobOffset(i, amp));
      for (const b of cycle) {
        expect(Number.isInteger(b)).toBe(true);
        expect(Math.abs(b)).toBeLessThanOrEqual(amp);
      }
      expect(Math.min(...cycle)).toBe(-amp); // rises a full amplitude
      expect(Math.max(...cycle)).toBe(amp); // and sinks back below rest
      for (let i = 0; i < CRYSTAL_FRAME_COUNT * 3; i++) {
        expect(crystalBobOffset(i + CRYSTAL_FRAME_COUNT, amp)).toBe(crystalBobOffset(i, amp));
        expect(crystalBobOffset(-i, amp)).toBe(crystalBobOffset(CRYSTAL_FRAME_COUNT * 3 - i, amp));
      }
      expect(crystalBobOffset(0, amp)).toBe(0);
    }
  });

  it('lifts the body by the bob offset while the ground shadow stays put', () => {
    for (const kind of CRYSTAL_UNIT_KINDS) {
      const amp = CRYSTAL_BOB_AMPLITUDE[kind];
      const frames = bakeCrystalUnit(kind).frames;
      const rest = paintedRows(frames[0]);
      frames.forEach((frame, i) => {
        const rows = paintedRows(frame);
        expect(rows.top - rest.top).toBe(crystalBobOffset(i, amp) - crystalBobOffset(0, amp));
        expect(rows.bottom).toBe(rest.bottom);
      });
    }
  });

  it('hovers: an empty row always separates the body from its dithered ground shadow', () => {
    for (const kind of CRYSTAL_UNIT_KINDS) {
      for (const frame of bakeCrystalUnit(kind).frames) {
        const row = (y: number) => frame.pixels.slice(y * frame.width, (y + 1) * frame.width);
        const { bottom } = paintedRows(frame);
        let y = bottom;
        while (y > 0 && row(y).some((c) => c !== null)) {
          // The shadow band is outline-colored only
          expect(row(y).every((c) => c === null || c === PAL.crystal.outline)).toBe(true);
          y--;
        }
        expect(row(y).every((c) => c === null), `${kind}: gap above the shadow`).toBe(true);
        expect(paintedRows(frame).top).toBeLessThan(y);
      }
    }
  });
});

describe('drawUnitFrame', () => {
  it('blits runs of art pixels at the art-pixel scale and skips transparent ones', () => {
    const calls: Array<[string, number, number, number, number]> = [];
    const ctx = {
      fillStyle: '',
      fillRect(x: number, y: number, w: number, h: number) {
        calls.push([String(ctx.fillStyle), x, y, w, h]);
      },
    };
    const frame: UnitFrame = { width: 4, height: 2, pixels: ['#a', '#a', null, '#b', null, null, '#b', null] };
    drawUnitFrame(ctx as unknown as CanvasRenderingContext2D, frame, 10, 20);
    expect(calls).toEqual([
      ['#a', 10, 20, 4, 2],
      ['#b', 16, 20, 2, 2],
      ['#b', 14, 22, 2, 2],
    ]);
  });
});
