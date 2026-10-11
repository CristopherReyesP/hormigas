import { describe, expect, it } from 'vitest';
import {
  ELITE_AFFIX_ORDER,
  MINI_BOSS_EVERY,
  WAVE_MAX_UNITS,
  eliteShare,
  miniBossFor,
  waveComposition,
  type WaveComposition,
  type WaveRival,
} from './waveComposition';

const RIVALS: WaveRival[] = ['wildlife', 'crystal', 'human'];
const waves = (from: number, to: number, rival: WaveRival = 'crystal') =>
  Array.from({ length: to - from + 1 }, (_, i) => waveComposition(from + i, rival));
/** Every unit the wave sends, the mini-boss included */
const parts = (w: WaveComposition) => w.youngBeetles + w.beetles + w.drones + (w.boss ? 1 : 0);
/** The raw size curve (WAVE_CURVE) before elites and bosses trim it: these waves must stay close to it */
const RAW_TOTALS = [3, 5, 9, 13, 18, 25, 32, 40, 49, 60];

describe('waveComposition', () => {
  it('opens with a small, survivable wave: 3 young beetles, no drones, no elites, no boss', () => {
    expect(waveComposition(1)).toEqual({ wave: 1, total: 3, youngBeetles: 3, beetles: 0, drones: 0, statScale: 1, elites: [], boss: null });
  });

  it('follows the documented curve for waves 1-10, the same for every rival', () => {
    for (const rival of RIVALS) {
      expect(waves(1, 10, rival).map((w) => w.total)).toEqual([3, 5, 7, 13, 17, 21, 29, 36, 41, 43]);
    }
  });

  it('stays near the raw curve: elites and the boss trim a few plain units, never more than a third', () => {
    waves(1, 10).forEach((w, i) => {
      expect(w.total).toBeLessThanOrEqual(RAW_TOTALS[i]);
      expect(w.total).toBeGreaterThanOrEqual(Math.floor(RAW_TOTALS[i] * 0.7));
    });
  });

  it('never exceeds the cap; past it the units get slightly stronger instead', () => {
    const list = waves(1, 30);
    for (const w of list) expect(w.total).toBeLessThanOrEqual(WAVE_MAX_UNITS);
    expect(waveComposition(9).statScale).toBe(1);
    expect(waveComposition(10).statScale).toBeLessThan(1.25);
    for (let n = 12; n <= 30; n++) expect(waveComposition(n).statScale).toBeGreaterThan(waveComposition(n - 1).statScale);
  });

  it('splits every wave into its parts, the boss counting as one enemy', () => {
    for (const rival of RIVALS) {
      for (const w of waves(1, 30, rival)) expect(parts(w)).toBe(w.total);
    }
    expect(waveComposition(2).drones).toBe(0);
    expect(waveComposition(3).drones).toBeGreaterThan(0);
    expect(waveComposition(1, 'human').drones).toBeGreaterThanOrEqual(2);
    for (const w of waves(1, 20, 'wildlife')) expect(w.drones).toBe(0);
  });

  it('brings a mini-boss every third wave, themed by the rival', () => {
    expect(MINI_BOSS_EVERY).toBe(3);
    const bossWaves = (rival: WaveRival) => waves(1, 12, rival).filter((w) => w.boss !== null).map((w) => w.wave);
    for (const rival of RIVALS) expect(bossWaves(rival)).toEqual([3, 6, 9, 12]);
    expect(miniBossFor(3, 'wildlife')).toBe('colossus');
    expect(miniBossFor(6, 'crystal')).toBe('prism');
    expect(miniBossFor(9, 'human')).toBe('colonel');
    expect(miniBossFor(4, 'human')).toBeNull();
    expect(waveComposition(6, 'human').boss).toBe('colonel');
  });

  it('adds elites from wave 3, a growing share of the wave', () => {
    expect(waveComposition(1).elites).toEqual([]);
    expect(waveComposition(2).elites).toEqual([]);
    expect(eliteShare(2)).toBe(0);
    for (let n = 4; n <= 12; n++) expect(eliteShare(n)).toBeGreaterThanOrEqual(eliteShare(n - 1));
    expect(eliteShare(20)).toBeLessThanOrEqual(0.45);
    const counts = waves(3, 10).map((w) => w.elites.length);
    expect(counts[0]).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts).toEqual([1, 2, 4, 6, 9, 14, 19, 21]);
  });

  it('only turns units the wave really sends into elites', () => {
    for (const rival of RIVALS) {
      for (const w of waves(1, 20, rival)) {
        const of = (unit: string) => w.elites.filter((e) => e.unit === unit).length;
        expect(of('young')).toBeLessThanOrEqual(w.youngBeetles);
        expect(of('beetle')).toBeLessThanOrEqual(w.beetles);
        expect(of('drone')).toBeLessThanOrEqual(w.drones);
      }
    }
    // Against a rival base the raiders get their share of the elites
    expect(waveComposition(7, 'human').elites.some((e) => e.unit === 'drone')).toBe(true);
    expect(waveComposition(7, 'crystal').elites.some((e) => e.unit === 'drone')).toBe(true);
  });

  it('rotates the five affixes deterministically, all five showing by wave 6', () => {
    expect(ELITE_AFFIX_ORDER).toHaveLength(5);
    expect(waveComposition(3).elites.map((e) => e.affix)).toEqual(['armored']);
    expect(waveComposition(4).elites.map((e) => e.affix)).toEqual(['swift', 'furious']);
    expect(waveComposition(5).elites.map((e) => e.affix)).toEqual(['furious', 'healer', 'explosive', 'armored']);
    const seen = new Set(waves(3, 6).flatMap((w) => w.elites.map((e) => e.affix)));
    expect(seen).toEqual(new Set(ELITE_AFFIX_ORDER));
    expect(waveComposition(8, 'human')).toEqual(waveComposition(8, 'human'));
  });

  it('is empty for anything but a real wave number', () => {
    for (const n of [0, -2, Number.NaN]) expect(waveComposition(n).total).toBe(0);
  });
});
