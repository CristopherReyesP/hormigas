import { describe, expect, it } from 'vitest';
import { PAL } from './pixelart/palette';
import { HUMAN_FRAME_COUNT, HUMAN_UNIT_KINDS, HUMAN_UNIT_SIZE, bakeHumanUnit } from './humanUnits';

const HUMAN_COLORS = new Set<string>([...PAL.human.steel, ...PAL.human.olive, PAL.human.visor, PAL.human.outline]);

describe('human unit silhouettes', () => {
  it('bakes every kind with a fixed frame count on its own art-pixel grid', () => {
    for (const kind of HUMAN_UNIT_KINDS) {
      const sheet = bakeHumanUnit(kind);
      const { width, height } = HUMAN_UNIT_SIZE[kind];
      expect(sheet.width).toBe(width);
      expect(sheet.height).toBe(height);
      expect(sheet.frames).toHaveLength(HUMAN_FRAME_COUNT);
      for (const frame of sheet.frames) {
        expect(frame.width).toBe(width);
        expect(frame.height).toBe(height);
        expect(frame.pixels).toHaveLength(width * height);
      }
    }
  });

  it('makes the tank the widest unit and the infantry taller than wide', () => {
    expect(HUMAN_UNIT_SIZE.tank.width).toBeGreaterThan(HUMAN_UNIT_SIZE.soldier.width * 1.5);
    expect(HUMAN_UNIT_SIZE.soldier.height).toBeGreaterThan(HUMAN_UNIT_SIZE.soldier.width);
    expect(HUMAN_UNIT_SIZE.marksman.height).toBeGreaterThan(HUMAN_UNIT_SIZE.marksman.width);
  });

  it('is deterministic: the same kind always bakes the same pixels', () => {
    for (const kind of HUMAN_UNIT_KINDS) {
      expect(bakeHumanUnit(kind)).toEqual(bakeHumanUnit(kind));
    }
  });

  it('paints only with the muted steel and olive ramps, never a faction glow', () => {
    for (const kind of HUMAN_UNIT_KINDS) {
      const used = new Set<string>();
      for (const frame of bakeHumanUnit(kind).frames) {
        for (const c of frame.pixels) if (c !== null) used.add(c);
      }
      for (const c of used) expect(HUMAN_COLORS.has(c), `${kind} paints ${c}`).toBe(true);
      expect(PAL.human.steel.some((s) => used.has(s))).toBe(true);
      expect(PAL.human.olive.some((o) => used.has(o))).toBe(true);
    }
  });

  it('animates in place: frames differ but the feet and treads stay on the ground row', () => {
    for (const kind of HUMAN_UNIT_KINDS) {
      const { frames } = bakeHumanUnit(kind);
      const lowest = frames.map((f) => {
        for (let y = f.height - 1; y >= 0; y--) {
          if (f.pixels.slice(y * f.width, (y + 1) * f.width).some((c) => c !== null)) return y;
        }
        return -1;
      });
      expect(new Set(lowest).size).toBe(1);
      expect(new Set(frames.map((f) => f.pixels.join(','))).size).toBeGreaterThan(1);
    }
  });
});

describe('human palette ramps', () => {
  it('runs dark to light and stays muted', () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    for (const ramp of [PAL.human.steel, PAL.human.olive]) {
      for (let i = 1; i < ramp.length; i++) expect(lum(ramp[i])).toBeGreaterThan(lum(ramp[i - 1]));
      for (const hex of ramp) {
        const n = parseInt(hex.slice(1), 16);
        const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        expect(Math.max(...ch) - Math.min(...ch)).toBeLessThan(64); // muted, low chroma
      }
    }
  });
});
