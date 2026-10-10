import { describe, expect, it } from 'vitest';
import { WAVE_MAX_UNITS, miniBossFor, waveComposition, type WaveRival } from './waveComposition';
import { waveClearReward } from './waveRewards';
import { isBossNight } from '../systems/UndergroundInvasionSystem';

// The run has no last night any more: waves must stay sane long after night 7
const LAST = 30;
const RIVALS: readonly WaveRival[] = ['wildlife', 'crystal', 'human'];
const waves = Array.from({ length: LAST }, (_, i) => i + 1);

describe('endless waves stay sane to night 30', () => {
  it.each(RIVALS)('composition against %s: numbered, capped, consistent', (rival) => {
    let prevScale = 1;
    for (const n of waves) {
      const w = waveComposition(n, rival);
      expect(w.wave).toBe(n);
      for (const count of [w.youngBeetles, w.beetles, w.drones]) {
        expect(Number.isInteger(count)).toBe(true);
        expect(count).toBeGreaterThanOrEqual(0);
      }
      expect(w.youngBeetles + w.beetles + w.drones + (w.boss ? 1 : 0)).toBe(w.total);
      expect(w.total).toBeGreaterThan(0);
      expect(w.total).toBeLessThanOrEqual(WAVE_MAX_UNITS);
      expect(w.elites.length).toBeLessThanOrEqual(w.total);
      expect(Number.isFinite(w.statScale)).toBe(true);
      // Past the cap the units get stronger instead of more numerous
      expect(w.statScale).toBeGreaterThanOrEqual(prevScale);
      prevScale = w.statScale;
    }
    expect(waveComposition(20, rival).statScale).toBeGreaterThan(1);
    expect(waveComposition(LAST, rival).statScale).toBeGreaterThan(waveComposition(20, rival).statScale);
  });

  it('keeps the mini-boss cadence every third wave forever', () => {
    for (const rival of RIVALS) {
      const bossWaves = waves.filter((n) => miniBossFor(n, rival) !== null);
      expect(bossWaves).toEqual([3, 6, 9, 12, 15, 18, 21, 24, 27, 30]);
    }
  });

  it('brings the Crystal Queen on night 7 only', () => {
    expect(waves.filter(isBossNight)).toEqual([7]);
  });

  it('keeps paying a growing clear reward', () => {
    for (const n of waves.slice(1)) {
      expect(waveClearReward(n, false).minerals).toBeGreaterThan(waveClearReward(n - 1, false).minerals);
    }
  });
});
