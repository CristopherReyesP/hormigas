import { describe, expect, it } from 'vitest';
import { BED_MOODS, CHIME_SCALES, nextChime } from './musicPlan';

/** A fixed sequence of "random" draws */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('music bed plan', () => {
  it('rings day chimes often and high, from the day scale', () => {
    for (const r of [0, 0.25, 0.5, 0.99]) {
      const chime = nextChime(sequence([r]), false);
      expect(chime.delay).toBeGreaterThanOrEqual(2.5);
      expect(chime.delay).toBeLessThanOrEqual(7.5);
      expect(CHIME_SCALES.day).toContain(chime.freq);
      expect(Math.abs(chime.pan)).toBeLessThanOrEqual(0.6);
    }
  });

  it('rings night chimes sparser, lower and darker', () => {
    const day = nextChime(sequence([0.5]), false);
    const night = nextChime(sequence([0.5]), true);
    expect(night.delay).toBeGreaterThan(day.delay);
    expect(CHIME_SCALES.night).toContain(night.freq);
    expect(Math.max(...CHIME_SCALES.night)).toBeLessThan(Math.min(...CHIME_SCALES.day));
    expect(night.gain).toBeLessThan(day.gain);
  });

  it('makes the night bed darker and pulsing, and the day bed open and still', () => {
    expect(BED_MOODS.night.cutoff).toBeLessThan(BED_MOODS.day.cutoff);
    expect(BED_MOODS.night.pulse).toBeGreaterThan(0);
    expect(BED_MOODS.day.pulse).toBe(0);
    // The night shifts the chord: the fifth and the ninth sink into tension
    expect(BED_MOODS.night.chord).not.toEqual(BED_MOODS.day.chord);
    expect(BED_MOODS.night.chord[0]).toBe(BED_MOODS.day.chord[0]);
  });
});
