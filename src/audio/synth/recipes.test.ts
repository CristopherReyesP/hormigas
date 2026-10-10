import { describe, expect, it } from 'vitest';
import { SOUND_SPECS, type SoundId } from '../sounds';
import { FakeAudioContext, type FakeGain, type FakeSource } from '../testing/fakeAudio';
import { RECIPES } from './recipes';

const entries = Object.entries(RECIPES) as Array<[SoundId, NonNullable<(typeof RECIPES)[SoundId]>]>;

function build(id: SoundId, params = {}) {
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
    for (const g of fake.ofKind<FakeGain>('gain')) expect(g.gain.peak()).toBeLessThanOrEqual(1);
  });

  it.each(entries.map(([id]) => id))('%s lasts about as long as the mixer budgets for it', (id) => {
    const { duration } = build(id);
    expect(duration).toBeLessThanOrEqual(SOUND_SPECS[id].duration * 1.5 + 0.05);
  });
});
