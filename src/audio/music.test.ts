import { describe, expect, it } from 'vitest';
import { MusicBed, type Timers } from './music';
import { BED_MOODS } from './musicPlan';
import { FakeAudioContext, type FakeBiquad, type FakeGain, type FakeOscillator } from './testing/fakeAudio';

/** Timers the test fires by hand */
function manualTimers() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  const timers: Timers = {
    setTimeout: (fn, ms) => {
      pending.set(next, { fn, ms });
      return next++;
    },
    clearTimeout: (id) => {
      pending.delete(id as number);
    },
  };
  const fireAll = () => {
    const due = [...pending.values()];
    pending.clear();
    for (const t of due) t.fn();
  };
  return { timers, pending, fireAll };
}

function setup() {
  const fake = new FakeAudioContext();
  const bus = fake.createGain();
  const { timers, pending, fireAll } = manualTimers();
  const bed = new MusicBed(fake.asContext(), bus as unknown as AudioNode, () => 0.5, timers);
  return { fake, bus, bed, pending, fireAll };
}

const padFilter = (fake: FakeAudioContext) => fake.ofKind<FakeBiquad>('biquad')[0];
const lastTarget = (events: Array<[string, number, number]>) => events.filter(([kind]) => kind === 'target').at(-1)?.[1];

describe('music bed', () => {
  it('fades in on the music bus with the day mood and schedules a chime', () => {
    const { fake, bus, bed, pending } = setup();
    bed.start(false);
    expect(bed.playing).toBe(true);
    const bedGain = fake.ofKind<FakeGain>('gain')[1];
    expect(bedGain.outputs).toEqual([bus]);
    expect(lastTarget(bedGain.gain.events)).toBe(1);
    expect(lastTarget(padFilter(fake).frequency.events)).toBe(BED_MOODS.day.cutoff);
    expect(pending.size).toBe(1);
  });

  it('turns dark at night: the filter closes, the chord shifts and the pulse rises', () => {
    const { fake, bed } = setup();
    bed.start(false);
    bed.setNight(true);
    expect(lastTarget(padFilter(fake).frequency.events)).toBe(BED_MOODS.night.cutoff);
    const fifth = fake.ofKind<FakeOscillator>('oscillator')[3];
    expect(lastTarget(fifth.frequency.events)).toBe(BED_MOODS.night.chord[2]);
    const levels = fake.ofKind<FakeGain>('gain').map((g) => lastTarget(g.gain.events)).filter((v) => v !== undefined);
    expect(levels.some((v) => v! > 0 && v! < 0.5)).toBe(true);
    expect(bed.isNight).toBe(true);
  });

  it('rings chimes into the bed and keeps scheduling them', () => {
    const { fake, bed, pending, fireAll } = setup();
    bed.start(false);
    const before = fake.sources.length;
    fireAll();
    expect(fake.sources.length).toBeGreaterThan(before);
    expect(pending.size).toBe(1);
  });

  it('starts once: a second start only sets the mood', () => {
    const { fake, bed } = setup();
    bed.start(false);
    const nodes = fake.nodes.length;
    bed.start(true);
    expect(fake.nodes.length).toBe(nodes);
    expect(lastTarget(padFilter(fake).frequency.events)).toBe(BED_MOODS.night.cutoff);
  });

  it('fades out, stops every source and cancels the next chime', () => {
    const { fake, bed, pending } = setup();
    bed.start(false);
    bed.stop(2);
    expect(bed.playing).toBe(false);
    for (const source of fake.sources) expect(source.stopTime).not.toBeNull();
    // The disconnect timer stays; the chime timer is gone
    expect([...pending.values()].every((t) => t.ms > 2000)).toBe(true);
  });
});
