import { describe, expect, it } from 'vitest';
import { WAVE_MAX_UNITS, waveComposition } from './waveComposition';

const waves = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => waveComposition(from + i));

describe('waveComposition', () => {
  it('opens with a small, survivable wave: 3 young beetles, no drones', () => {
    expect(waveComposition(1)).toEqual({ wave: 1, total: 3, youngBeetles: 3, beetles: 0, drones: 0, statScale: 1 });
  });

  it('follows the documented curve for waves 1-10', () => {
    expect(waves(1, 10).map((w) => w.total)).toEqual([3, 5, 8, 12, 17, 23, 30, 38, 47, 50]);
  });

  it('grows every wave until the cap, by roughly 30-70% early on', () => {
    const list = waves(1, 20);
    for (let i = 1; i < list.length; i++) {
      if (list[i - 1].total < WAVE_MAX_UNITS) expect(list[i].total).toBeGreaterThan(list[i - 1].total);
      else expect(list[i].total).toBe(WAVE_MAX_UNITS);
    }
    for (let i = 1; i < 6; i++) {
      const growth = list[i].total / list[i - 1].total;
      expect(growth).toBeGreaterThanOrEqual(1.3);
      expect(growth).toBeLessThanOrEqual(1.7);
    }
  });

  it('never exceeds the cap; past it the units get slightly stronger instead', () => {
    const list = waves(1, 30);
    for (const w of list) expect(w.total).toBeLessThanOrEqual(WAVE_MAX_UNITS);
    expect(WAVE_MAX_UNITS).toBeGreaterThanOrEqual(40);
    expect(WAVE_MAX_UNITS).toBeLessThanOrEqual(60);
    expect(list.filter((w) => w.total < WAVE_MAX_UNITS).every((w) => w.statScale === 1)).toBe(true);
    const capped = list.filter((w) => w.total === WAVE_MAX_UNITS);
    expect(capped.length).toBeGreaterThan(5);
    for (let i = 1; i < capped.length; i++) expect(capped[i].statScale).toBeGreaterThan(capped[i - 1].statScale);
    expect(waveComposition(10).statScale).toBeLessThan(1.15);
  });

  it('splits every wave into its parts, mixing in stronger types as waves grow', () => {
    for (const w of waves(1, 30)) {
      expect(w.youngBeetles + w.beetles + w.drones).toBe(w.total);
      expect(w.drones).toBeLessThanOrEqual(Math.ceil(w.total * 0.3));
    }
    expect(waveComposition(2).beetles).toBeGreaterThan(0);
    expect(waveComposition(2).drones).toBe(0);
    expect(waveComposition(3).drones).toBeGreaterThan(0);
    const share = (n: number) => {
      const w = waveComposition(n);
      return (w.beetles + w.drones) / w.total;
    };
    for (let n = 2; n <= 8; n++) expect(share(n)).toBeGreaterThanOrEqual(share(n - 1));
  });

  it('is empty for anything but a real wave number', () => {
    for (const n of [0, -2, Number.NaN]) expect(waveComposition(n).total).toBe(0);
  });
});
