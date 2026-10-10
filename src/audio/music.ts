import { BED_MOODS, nextChime, type ChimePlan } from './musicPlan';
import { bell, gainNode, noiseBuffer } from './synth/primitives';

export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

const browserTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** Seconds (time constants are a third of these): the bed fades in slowly and moods cross over long. */
const FADE_IN = 6;
const MOOD_GLIDE = 6;
const PULSE_LEVEL = 0.2;
const RUMBLE_LEVEL = 0.05;

interface BedGraph {
  bed: GainNode;
  padFilter: BiquadFilterNode;
  /** Root, octave (two detuned), fifth, ninth */
  chord: OscillatorNode[];
  pulseLevel: GainNode;
  rumbleLevel: GainNode;
  chimeIn: AudioNode;
  sources: AudioScheduledSourceNode[];
}

/**
 * The ambient music bed: an evolving alien drone pad, with sparse
 * bioluminescent chimes by day. At night the filter closes, the chord
 * sinks into a tritone and a flat second, a heartbeat pulse and a dark wind
 * rise under it, and the chimes thin out and drop. Everything is
 * synthesized and crossfades slowly between moods.
 */
export class MusicBed {
  private readonly ctx: BaseAudioContext;
  private readonly out: AudioNode;
  private readonly rng: () => number;
  private readonly timers: Timers;
  private graph: BedGraph | null = null;
  private night = false;
  private chimeTimer: unknown = null;

  constructor(ctx: BaseAudioContext, out: AudioNode, rng: () => number = Math.random, timers: Timers = browserTimers) {
    this.ctx = ctx;
    this.out = out;
    this.rng = rng;
    this.timers = timers;
  }

  get playing(): boolean {
    return this.graph !== null;
  }

  get isNight(): boolean {
    return this.night;
  }

  /** Fade the bed in (or just set the mood if it already plays). */
  start(night: boolean): void {
    this.night = night;
    if (this.graph) {
      this.applyMood(false);
      return;
    }
    this.graph = this.build();
    this.applyMood(true);
    const now = this.ctx.currentTime;
    this.graph.bed.gain.setValueAtTime(0, now);
    this.graph.bed.gain.setTargetAtTime(1, now, FADE_IN / 3);
    this.scheduleChime();
  }

  setNight(night: boolean): void {
    if (night === this.night) return;
    this.night = night;
    if (this.graph) this.applyMood(false);
  }

  stop(fade = 2): void {
    const g = this.graph;
    if (!g) return;
    this.graph = null;
    if (this.chimeTimer !== null) this.timers.clearTimeout(this.chimeTimer);
    this.chimeTimer = null;
    const now = this.ctx.currentTime;
    g.bed.gain.cancelScheduledValues(now);
    g.bed.gain.setTargetAtTime(0, now, Math.max(0.01, fade / 3));
    for (const source of g.sources) source.stop(now + fade + 0.5);
    this.timers.setTimeout(() => g.bed.disconnect(), (fade + 0.6) * 1000);
  }

  private build(): BedGraph {
    const { ctx } = this;
    const now = ctx.currentTime;
    const sources: AudioScheduledSourceNode[] = [];
    const osc = (type: OscillatorType, freq: number, dest: AudioNode, level: number, detune = 0): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(gainNode(ctx, level)).connect(dest);
      o.start(now);
      sources.push(o);
      return o;
    };
    /** A slow modulator on a param: `depth` in the param's units */
    const modulate = (freq: number, target: AudioParam, depth: number): void => {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      o.connect(gainNode(ctx, depth)).connect(target);
      o.start(now);
      sources.push(o);
    };

    const bed = gainNode(ctx, 0);
    bed.connect(this.out);

    // The pad: a slow lowpass wander over a triangle root, a detuned saw octave, the fifth and the ninth
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.Q.value = 0.8;
    padFilter.connect(gainNode(ctx, 0.9)).connect(bed);
    const [root, octave, fifth, ninth] = BED_MOODS.day.chord;
    const fifthLevel = gainNode(ctx, 0.055);
    fifthLevel.connect(padFilter);
    const chord = [
      osc('triangle', root, padFilter, 0.22),
      osc('sawtooth', octave, padFilter, 0.06, -7),
      osc('sawtooth', octave, padFilter, 0.06, 7),
      osc('sawtooth', fifth, fifthLevel, 1),
      osc('sine', ninth, padFilter, 0.05),
    ];
    // Slow LFOs: the cutoff wanders, the fifth breathes
    modulate(0.031, padFilter.frequency, 300);
    modulate(0.07, fifthLevel.gain, 0.025);

    // The night heartbeat: a low sine whose level throbs
    const pulseLevel = gainNode(ctx, 0);
    const throb = gainNode(ctx, 0.5);
    const pulseFilter = ctx.createBiquadFilter();
    pulseFilter.type = 'lowpass';
    pulseFilter.frequency.value = 220;
    throb.connect(pulseFilter).connect(pulseLevel).connect(bed);
    osc('sine', 55, throb, 1);
    modulate(1.2, throb.gain, 0.5);

    // The dark wind: slowed noise, lowpassed
    const rumbleLevel = gainNode(ctx, 0);
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuffer(ctx, 'white');
    wind.loop = true;
    wind.playbackRate.value = 0.6;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 160;
    windFilter.Q.value = 0.5;
    wind.connect(windFilter).connect(rumbleLevel).connect(bed);
    wind.start(now);
    sources.push(wind);

    // Chimes go dry and through a darkening feedback echo
    const chimeIn = gainNode(ctx, 1);
    chimeIn.connect(bed);
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.43;
    const feedback = gainNode(ctx, 0.35);
    const darken = ctx.createBiquadFilter();
    darken.type = 'lowpass';
    darken.frequency.value = 2400;
    chimeIn.connect(echo);
    echo.connect(feedback).connect(darken).connect(echo);
    echo.connect(gainNode(ctx, 0.45)).connect(bed);

    return { bed, padFilter, chord, pulseLevel, rumbleLevel, chimeIn, sources };
  }

  private applyMood(immediate: boolean): void {
    const g = this.graph;
    if (!g) return;
    const mood = BED_MOODS[this.night ? 'night' : 'day'];
    const now = this.ctx.currentTime;
    const tc = immediate ? 0.01 : MOOD_GLIDE / 3;
    g.padFilter.frequency.setTargetAtTime(mood.cutoff, now, tc);
    const [root, octave, fifth, ninth] = mood.chord;
    [root, octave, octave, fifth, ninth].forEach((freq, i) => g.chord[i].frequency.setTargetAtTime(freq, now, tc));
    g.pulseLevel.gain.setTargetAtTime(mood.pulse * PULSE_LEVEL, now, tc);
    g.rumbleLevel.gain.setTargetAtTime(mood.rumble * RUMBLE_LEVEL, now, tc);
  }

  private scheduleChime(): void {
    const plan = nextChime(this.rng, this.night);
    this.chimeTimer = this.timers.setTimeout(() => {
      if (!this.graph) return;
      this.ring(plan);
      this.scheduleChime();
    }, plan.delay * 1000);
  }

  private ring(plan: ChimePlan): void {
    const g = this.graph;
    if (!g) return;
    const { ctx } = this;
    let out: AudioNode = g.chimeIn;
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = plan.pan;
      panner.connect(g.chimeIn);
      out = panner;
    }
    bell({ ctx, out, t: ctx.currentTime + 0.02, rng: this.rng }, { freq: plan.freq, dur: 2.6, peak: plan.gain });
  }
}
