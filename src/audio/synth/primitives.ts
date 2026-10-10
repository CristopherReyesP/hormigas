/**
 * Procedural synthesis building blocks: oscillators, noise, filters and
 * envelopes on a WebAudio graph. No asset files: every sound in the game is
 * a recipe built from these. All times are AudioContext seconds.
 */

/** One playing sound: where it starts and where its nodes connect. */
export interface Voice {
  ctx: BaseAudioContext;
  /** The voice's own input (its level → pan → bus) */
  out: AudioNode;
  /** Start time */
  t: number;
  /** 0..1, varies repeated sounds (filter jitter, pitch spread) */
  rng: () => number;
}

/** Exponential ramps cannot reach 0: they fall to this, then snap to 0. */
export const SILENT = 0.0001;

const pos = (v: number): number => Math.max(SILENT, v);

export function gainNode(ctx: BaseAudioContext, value = 1): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

export interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  /** Sweep the cutoff to this over the sound */
  to?: number;
  q?: number;
}

export function filterNode(ctx: BaseAudioContext, spec: FilterSpec, t0: number, t1: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = spec.type;
  f.Q.value = spec.q ?? 0.7;
  sweep(f.frequency, spec.freq, spec.to ?? spec.freq, t0, t1);
  return f;
}

/** A param glides from `from` to `to` between t0 and t1 (exponential: pitch and cutoff move in ratios). */
export function sweep(param: AudioParam, from: number, to: number, t0: number, t1: number, curve: 'exp' | 'lin' = 'exp'): void {
  param.setValueAtTime(pos(from), t0);
  if (to === from || t1 <= t0) return;
  if (curve === 'exp') param.exponentialRampToValueAtTime(pos(to), t1);
  else param.linearRampToValueAtTime(to, t1);
}

/**
 * Attack, optional hold, then an exponential fall to silence. Returns the
 * end time. The attack is linear from 0 so even a 2 ms attack never clicks.
 */
export function envelope(param: AudioParam, t: number, peak: number, attack: number, decay: number, hold = 0): number {
  const top = pos(peak);
  const a = Math.max(0.001, attack);
  const end = t + a + hold + Math.max(0.005, decay);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(top, t + a);
  if (hold > 0) param.setValueAtTime(top, t + a + hold);
  param.exponentialRampToValueAtTime(SILENT, end);
  param.setValueAtTime(0, end + 0.001);
  return end;
}

export interface ToneSpec {
  type?: OscillatorType;
  freq: number;
  /** Glide the pitch to this over the note */
  to?: number;
  /** Seconds after the voice start */
  at?: number;
  /** Seconds from the note start to silence */
  dur: number;
  attack?: number;
  hold?: number;
  peak: number;
  /** Cents */
  detune?: number;
  filter?: FilterSpec;
  dest?: AudioNode;
}

/** One oscillator note with its own envelope. Returns its end, in seconds after the voice start. */
export function tone(v: Voice, s: ToneSpec): number {
  const { ctx } = v;
  const t0 = v.t + (s.at ?? 0);
  const attack = s.attack ?? 0.004;
  const hold = s.hold ?? 0;
  const t1 = t0 + Math.max(attack + hold + 0.005, s.dur);
  const osc = ctx.createOscillator();
  osc.type = s.type ?? 'sine';
  if (s.detune) osc.detune.value = s.detune;
  sweep(osc.frequency, s.freq, s.to ?? s.freq, t0, t1);
  const g = gainNode(ctx, 0);
  envelope(g.gain, t0, s.peak, attack, t1 - t0 - attack - hold, hold);
  let head: AudioNode = osc;
  if (s.filter) head = head.connect(filterNode(ctx, s.filter, t0, t1));
  head.connect(g).connect(s.dest ?? v.out);
  osc.start(t0);
  osc.stop(t1 + 0.02);
  return t1 - v.t;
}

export type NoiseColor = 'white' | 'crackle';

export interface NoiseSpec {
  color?: NoiseColor;
  at?: number;
  dur: number;
  attack?: number;
  hold?: number;
  peak: number;
  /** Applied in order (e.g. a highpass, then a sweeping bandpass) */
  filters?: FilterSpec[];
  /** Playback rate: below 1 darkens and slows the grain */
  rate?: number;
  dest?: AudioNode;
}

/** A burst of filtered noise with its own envelope. Returns its end, in seconds after the voice start. */
export function noise(v: Voice, s: NoiseSpec): number {
  const { ctx } = v;
  const t0 = v.t + (s.at ?? 0);
  const attack = s.attack ?? 0.002;
  const hold = s.hold ?? 0;
  const t1 = t0 + Math.max(attack + hold + 0.005, s.dur);
  const src = ctx.createBufferSource();
  const buffer = noiseBuffer(ctx, s.color ?? 'white');
  src.buffer = buffer;
  src.loop = true;
  if (s.rate) src.playbackRate.value = s.rate;
  let head: AudioNode = src;
  for (const f of s.filters ?? []) head = head.connect(filterNode(ctx, f, t0, t1));
  const g = gainNode(ctx, 0);
  envelope(g.gain, t0, s.peak, attack, t1 - t0 - attack - hold, hold);
  head.connect(g).connect(s.dest ?? v.out);
  // A random read offset, so two hits in a row never share their grain
  src.start(t0, v.rng() * buffer.duration * 0.9);
  src.stop(t1 + 0.02);
  return t1 - v.t;
}

export interface LfoSpec {
  type?: OscillatorType;
  freq: number;
  /** Swing in the target's units */
  depth: number;
  at?: number;
  dur: number;
  target: AudioParam;
}

/** Modulate a param (vibrato, tremolo, a filter wobble) for a stretch of the voice. */
export function lfo(v: Voice, s: LfoSpec): number {
  const { ctx } = v;
  const t0 = v.t + (s.at ?? 0);
  const osc = ctx.createOscillator();
  osc.type = s.type ?? 'sine';
  osc.frequency.value = s.freq;
  osc.connect(gainNode(ctx, s.depth)).connect(s.target);
  osc.start(t0);
  osc.stop(t0 + s.dur + 0.02);
  return t0 + s.dur - v.t;
}

/** Inharmonic partials of a small glass bell: struck, bright, and quick to lose its top. */
export const GLASS_PARTIALS: ReadonlyArray<readonly [ratio: number, level: number, decay: number]> = [
  [1, 1, 1],
  [2.32, 0.5, 0.6],
  [4.25, 0.28, 0.35],
  [6.63, 0.14, 0.2],
];

export interface BellSpec {
  freq: number;
  at?: number;
  /** Decay of the fundamental; higher partials die sooner */
  dur: number;
  peak: number;
  partials?: ReadonlyArray<readonly [number, number, number]>;
  dest?: AudioNode;
}

/** A struck bell or chime. Returns its end, in seconds after the voice start. */
export function bell(v: Voice, s: BellSpec): number {
  let end = 0;
  for (const [ratio, level, decay] of s.partials ?? GLASS_PARTIALS) {
    end = Math.max(end, tone(v, {
      freq: s.freq * ratio,
      at: s.at,
      dur: s.dur * decay,
      attack: 0.002,
      peak: s.peak * level,
      detune: (v.rng() - 0.5) * 8,
      dest: s.dest,
    }));
  }
  return end;
}

// ── Noise buffers (built once per context, deterministic) ──

const NOISE_SECONDS = 1.5;
const buffers = new WeakMap<BaseAudioContext, Map<NoiseColor, AudioBuffer>>();

/** A tiny LCG: the same noise every run, so a sound never changes between sessions. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function noiseBuffer(ctx: BaseAudioContext, color: NoiseColor): AudioBuffer {
  let byColor = buffers.get(ctx);
  if (!byColor) buffers.set(ctx, (byColor = new Map()));
  const cached = byColor.get(color);
  if (cached) return cached;

  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rnd = seeded(color === 'white' ? 0x5eed : 0xc4ac);
  if (color === 'white') {
    for (let i = 0; i < length; i++) data[i] = rnd() * 2 - 1;
  } else {
    // Crackle: sparse pops of random size and sign, the sizzle of acid on chitin
    for (let i = 0; i < length; i++) data[i] = rnd() < 0.012 ? (rnd() * 2 - 1) * (0.4 + rnd() * 0.6) : 0;
  }
  byColor.set(color, buffer);
  return buffer;
}
