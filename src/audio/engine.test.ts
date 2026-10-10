import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, MAX_VOICES } from './engine';
import { busLevels, DEFAULT_AUDIO_SETTINGS } from './settings';
import type { Listener } from './spatial';
import { FakeAudioContext, type FakeGain, type FakePanner, type FakeNode } from './testing/fakeAudio';
import { tone } from './synth/primitives';

const VIEW = { x: 0, y: 0, w: 40, h: 24 };
const SURFACE: Listener = { layer: 'surface', view: VIEW };

/** A one-note recipe set, so the routing tests do not depend on the sound design */
const blip = (v: Parameters<typeof tone>[0]) => tone(v, { freq: 440, dur: 0.1, peak: 0.5 });
const RECIPES = { acidHit: blip, deathAnt: blip, waveAlarm: blip, uiClick: blip, introHum: blip, introImpact: blip };

function setup() {
  const fake = new FakeAudioContext();
  const engine = new AudioEngine(fake.asContext(), { recipes: RECIPES, rng: () => 0.5 });
  engine.setListener(() => SURFACE);
  return { fake, engine };
}

/** Follow single-output connections from a node down to the destination */
function chain(node: FakeNode): string[] {
  const kinds = [node.kind];
  for (let n = node; n.outputs.length === 1; ) {
    n = n.outputs[0];
    kinds.push(n.kind);
  }
  return kinds;
}

afterEach(() => vi.useRealTimers());

describe('audio engine', () => {
  it('feeds every bus through master, a compressor and a soft clipper to the speakers', () => {
    const { fake } = setup();
    const gains = fake.ofKind<FakeGain>('gain');
    const master = gains[0];
    expect(chain(master)).toEqual(['gain', 'compressor', 'shaper', 'gain', 'destination']);
    // Three buses after the trim, all into the master
    const buses = gains.slice(2, 5);
    expect(buses).toHaveLength(3);
    for (const bus of buses) expect(bus.outputs).toEqual([master]);
  });

  it('applies the settings levels to master and buses, and mutes through the master', () => {
    const { fake, engine } = setup();
    const [master, , music, sfx, ui] = fake.ofKind<FakeGain>('gain');
    engine.applyLevels(busLevels(DEFAULT_AUDIO_SETTINGS));
    expect(master.gain.events.at(-1)).toEqual(['target', DEFAULT_AUDIO_SETTINGS.master, 0]);
    expect(music.gain.events.at(-1)?.[1]).toBe(DEFAULT_AUDIO_SETTINGS.music);
    expect(sfx.gain.events.at(-1)?.[1]).toBe(DEFAULT_AUDIO_SETTINGS.sfx);
    expect(ui.gain.events.at(-1)?.[1]).toBe(DEFAULT_AUDIO_SETTINGS.ui);
    engine.applyLevels(busLevels({ ...DEFAULT_AUDIO_SETTINGS, mode: 'muted' }));
    expect(master.gain.events.at(-1)?.[1]).toBe(0);
  });

  it('builds a panned voice for a hit on screen, on the sfx bus', () => {
    vi.useFakeTimers();
    const { fake, engine } = setup();
    const sfx = fake.ofKind<FakeGain>('gain')[3];
    engine.handle({ type: 'hit', by: 'ant', at: { x: 35, y: 10, layer: 'surface' } });
    expect(engine.activeVoices()).toBe(1);
    const panner = fake.ofKind<FakePanner>('panner')[0];
    expect(panner.pan.value).toBeGreaterThan(0.4);
    expect(panner.outputs).toEqual([sfx]);
    expect(fake.sources).toHaveLength(1);
  });

  it('builds nothing for a hit on the layer the player is not viewing', () => {
    const { fake, engine } = setup();
    const before = fake.nodes.length;
    engine.handle({ type: 'death', kind: 'ant', at: { x: 20, y: 10, layer: 'underground' } });
    expect(engine.activeVoices()).toBe(0);
    expect(fake.nodes.length).toBe(before);
  });

  it('never holds more than the voice pool, however many hits land', () => {
    vi.useFakeTimers();
    const { fake, engine } = setup();
    for (let i = 0; i < 200; i++) {
      fake.currentTime = i * 0.01;
      engine.handle({ type: 'hit', by: 'ant', at: { x: 20, y: 10, layer: 'surface' } });
    }
    expect(engine.activeVoices()).toBeLessThanOrEqual(MAX_VOICES);
    expect(fake.sources.length).toBeLessThan(40);
  });

  it('fades matching voices out on request and frees them', () => {
    vi.useFakeTimers();
    const { fake, engine } = setup();
    engine.handle({ type: 'wave' });
    engine.handle({ type: 'ui', sound: 'click' });
    expect(engine.activeVoices()).toBe(2);
    engine.stopVoices((sound) => sound === 'waveAlarm');
    expect(engine.activeVoices()).toBe(1);
    const alarmOut = fake.ofKind<FakeGain>('gain')[5];
    expect(alarmOut.gain.events.at(-1)?.[0]).toBe('target');
    expect(alarmOut.gain.events.at(-1)?.[1]).toBe(0);
    vi.runAllTimers();
    expect(alarmOut.disconnected).toBe(true);
  });

  it('survives a recipe that throws', () => {
    const fake = new FakeAudioContext();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = new AudioEngine(fake.asContext(), { recipes: { uiClick: () => { throw new Error('bad'); } } });
    expect(() => engine.handle({ type: 'ui', sound: 'click' })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('brings the music bed in when the intro ends, on the music bus', () => {
    vi.useFakeTimers();
    const { engine } = setup();
    engine.handle({ type: 'intro', cue: 'hum', duration: 3 });
    expect(engine.musicPlaying).toBe(false);
    engine.handle({ type: 'intro', cue: 'end' });
    expect(engine.musicPlaying).toBe(true);
  });

  it('cuts the intro sounds on a skip but lets the impact ring, and starts the music', () => {
    vi.useFakeTimers();
    const { engine } = setup();
    engine.handle({ type: 'intro', cue: 'impact' });
    engine.handle({ type: 'intro', cue: 'hum', duration: 3 });
    expect(engine.activeVoices()).toBe(2);
    engine.handle({ type: 'introSkip' });
    expect(engine.activeVoices()).toBe(1);
    expect(engine.musicPlaying).toBe(true);
  });

  it('remembers the night for a bed that starts later, and a new run starts by day in silence', () => {
    vi.useFakeTimers();
    const { fake, engine } = setup();
    engine.handle({ type: 'phase', phase: 'night' });
    engine.startMusic();
    const biquads = fake.ofKind<FakeNode & { frequency: { events: Array<[string, number, number]> } }>('biquad');
    const cutoff = biquads[0].frequency.events.filter(([kind]) => kind === 'target').at(-1)?.[1];
    expect(cutoff).toBeLessThan(600);
    engine.startRun();
    expect(engine.musicPlaying).toBe(false);
  });
});
