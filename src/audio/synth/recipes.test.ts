import { describe, expect, it } from 'vitest';
import { SOUND_IDS, SOUND_SPECS, type SoundId, type SoundParams } from '../sounds';
import { FakeAudioContext, type FakeBiquad, type FakeGain, type FakeOscillator, type FakeSource } from '../testing/fakeAudio';
import { RECIPES } from './recipes';

const entries = Object.entries(RECIPES) as Array<[SoundId, NonNullable<(typeof RECIPES)[SoundId]>]>;

function build(id: SoundId, params: SoundParams = {}) {
  const fake = new FakeAudioContext();
  const out = fake.createGain();
  const t = 1;
  const duration = entries.find(([key]) => key === id)![1]({ ctx: fake.asContext(), out: out as unknown as AudioNode, t, rng: () => 0.37 }, params);
  return { fake, out, t, duration };
}

describe('sound recipes', () => {
  it.each(entries.map(([id]) => id))('%s builds a finite, self-ending sound', (id) => {
    const { fake, t, duration } = build(id);
    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeLessThan(6);
    expect(fake.sources.length).toBeGreaterThan(0);
    for (const source of fake.sources as FakeSource[]) {
      expect(source.startTime!).toBeGreaterThanOrEqual(t);
      // Nothing rings on past the reported duration (plus the stop margin)
      expect(source.stopTime!).toBeLessThanOrEqual(t + duration + 0.05);
    }
  });

  it.each(entries.map(([id]) => id))('%s keeps its envelopes under full scale', (id) => {
    const { fake } = build(id);
    // Audio-carrying gains only: an LFO's depth feeds a param (a vibrato's Hz), not a node
    const levels = fake.ofKind<FakeGain>('gain').filter((g) => g.outputs.length > 0);
    expect(levels.length).toBeGreaterThan(0);
    for (const g of levels) expect(g.gain.peak()).toBeLessThanOrEqual(1);
  });

  it.each(entries.map(([id]) => id))('%s lasts about as long as the mixer budgets for it', (id) => {
    const { duration } = build(id);
    expect(duration).toBeLessThanOrEqual(SOUND_SPECS[id].duration * 1.5 + 0.05);
  });

  it('has a recipe for every sound in the catalog', () => {
    expect(Object.keys(RECIPES).sort()).toEqual([...SOUND_IDS].sort());
  });

  it('gives each caste its own chitter', () => {
    const bands = (['worker', 'soldier', 'scout', 'nurse', 'defender'] as const).map((caste) => {
      const { fake } = build('chitter', { caste });
      return fake.ofKind<FakeBiquad>('biquad')[0].frequency.events[0][1];
    });
    expect(new Set(bands.map(Math.round)).size).toBe(5);
  });

  it('gives the heavy castes a growl under their chitter', () => {
    const saws = (caste: 'worker' | 'soldier') =>
      build('chitter', { caste }).fake.ofKind<FakeOscillator>('oscillator').filter((o) => o.type === 'sawtooth').length;
    expect(saws('worker')).toBe(0);
    expect(saws('soldier')).toBe(1);
  });

  it('climbs the crystal chimes spire by spire', () => {
    const pitch = (index: number) => build('introCrystal', { index }).fake.ofKind<FakeOscillator>('oscillator')[0].frequency.events[0][1];
    expect(pitch(0)).toBeLessThan(pitch(3));
    expect(pitch(3)).toBeLessThan(pitch(6));
  });

  it('stretches the meteor whoosh to the duration the intro asks for', () => {
    expect(build('introWhoosh', { duration: 2.62 }).duration).toBeCloseTo(2.62 + 0.15);
    expect(build('introHum', { duration: 3.25 }).duration).toBeCloseTo(3.25);
  });
});
