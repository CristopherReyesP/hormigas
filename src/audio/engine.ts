import type { AudioEvent } from './events';
import { VoiceLimiter } from './limiter';
import { planVoice, type VoicePlan } from './mixer';
import type { busLevels } from './settings';
import { SOUND_SPECS, type BusName, type SoundId, type SoundParams } from './sounds';
import type { Listener } from './spatial';
import { RECIPES, type Recipe } from './synth/recipes';
import { gainNode } from './synth/primitives';

export type BusLevels = ReturnType<typeof busLevels>;

/** Voices the pool holds at once, across every bus. */
export const MAX_VOICES = 24;
/** Small lead so a voice scheduled "now" never starts in the past */
const LEAD = 0.005;
/** Level changes glide (seconds, time constant) instead of stepping */
const LEVEL_GLIDE = 0.04;

interface LiveVoice {
  sound: SoundId;
  out: GainNode;
  end: number;
}

/** Soft saturation curve for the last stage: transparent at normal levels, rounded instead of clipped at the top. */
function softClipCurve(samples = 1024, drive = 1.2): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(samples);
  const norm = Math.tanh(drive);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

/**
 * The WebAudio side: buses, the master chain, voices. Each bus (music, sfx,
 * ui) feeds the master gain, then a compressor and a soft clipper, so a
 * pile-up of sounds gets denser, never harsher. Events go through the pure
 * mixer plan (layer, distance, voice budget) before any node is built.
 */
export class AudioEngine {
  readonly ctx: BaseAudioContext;
  private readonly master: GainNode;
  private readonly buses: Record<BusName, GainNode>;
  private readonly limiter = new VoiceLimiter(MAX_VOICES);
  private readonly voices = new Map<number, LiveVoice>();
  private readonly recipes: Partial<Record<SoundId, Recipe>>;
  private listener: () => Listener | null = () => null;
  private readonly rng: () => number;

  constructor(ctx: BaseAudioContext, options: { recipes?: Partial<Record<SoundId, Recipe>>; rng?: () => number } = {}) {
    this.ctx = ctx;
    this.recipes = options.recipes ?? RECIPES;
    this.rng = options.rng ?? Math.random;

    this.master = gainNode(ctx, 0);
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.25;
    const clipper = ctx.createWaveShaper();
    clipper.curve = softClipCurve();
    clipper.oversample = '2x';
    const trim = gainNode(ctx, 0.9);

    this.master.connect(compressor).connect(clipper).connect(trim).connect(ctx.destination);
    this.buses = { music: gainNode(ctx, 0), sfx: gainNode(ctx, 0), ui: gainNode(ctx, 0) };
    for (const bus of Object.values(this.buses)) bus.connect(this.master);
  }

  /** Where the player's ears are; world sounds are filtered and panned by it. */
  setListener(listener: () => Listener | null): void {
    this.listener = listener;
  }

  /** The music bus is exposed for the ambient bed. */
  bus(name: BusName): AudioNode {
    return this.buses[name];
  }

  applyLevels(levels: BusLevels): void {
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(levels.master, now, LEVEL_GLIDE);
    for (const name of ['music', 'sfx', 'ui'] as const) this.buses[name].gain.setTargetAtTime(levels[name], now, LEVEL_GLIDE);
  }

  /** One game event: heard or not, and how, is the mixer's call. */
  handle(event: AudioEvent): void {
    const plan = planVoice(event, this.listener(), this.ctx.currentTime, this.limiter);
    if (!plan) return;
    if (plan.evicted !== null) this.fadeVoice(plan.evicted);
    this.startVoice(plan);
  }

  /** Play a sound directly, centered, outside the voice budget (the preview page). */
  play(sound: SoundId, params: SoundParams = {}): number {
    const spec = SOUND_SPECS[sound];
    return this.startVoice({ token: -1, evicted: null, sound, bus: spec.bus, params, pan: 0, gain: spec.gain, duration: spec.duration });
  }

  /** Fade out every playing voice that matches (the intro skip, a run ending). */
  stopVoices(match: (sound: SoundId) => boolean, fade = 0.12): void {
    for (const [token, voice] of this.voices) if (match(voice.sound)) this.fadeVoice(token, fade);
  }

  /** Voices still sounding (stopped and finished ones excluded). */
  activeVoices(): number {
    this.pruneVoices();
    return this.voices.size;
  }

  /** Forget the voice budget's cooldowns (a new run). */
  resetLimiter(): void {
    this.limiter.reset();
  }

  private startVoice(plan: VoicePlan): number {
    const recipe = this.recipes[plan.sound];
    if (!recipe) {
      if (plan.token > 0) this.limiter.release(plan.token);
      return 0;
    }
    const { ctx } = this;
    this.pruneVoices();
    const out = gainNode(ctx, plan.gain);
    if (typeof ctx.createStereoPanner === 'function' && plan.pan !== 0) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = plan.pan;
      out.connect(panner).connect(this.buses[plan.bus]);
    } else {
      out.connect(this.buses[plan.bus]);
    }
    const t = ctx.currentTime + LEAD;
    let duration = 0;
    try {
      duration = recipe({ ctx, out, t, rng: this.rng }, plan.params);
    } catch (e) {
      // A broken recipe must never take the game down with it
      console.warn(`[audio] ${plan.sound} failed`, e);
    }
    if (plan.token > 0) {
      this.voices.set(plan.token, { sound: plan.sound, out, end: t + duration });
      setTimeout(() => this.dropVoice(plan.token), (duration + 0.3) * 1000);
    }
    return duration;
  }

  private fadeVoice(token: number, fade = 0.08): void {
    const voice = this.voices.get(token);
    if (!voice) return;
    const now = this.ctx.currentTime;
    voice.out.gain.cancelScheduledValues(now);
    voice.out.gain.setTargetAtTime(0, now, fade / 3);
    this.limiter.release(token);
    this.voices.delete(token);
    setTimeout(() => voice.out.disconnect(), (fade + 0.2) * 1000);
  }

  /** Finished voices leave the map even if their cleanup timer has not fired yet. */
  private pruneVoices(): void {
    const now = this.ctx.currentTime;
    for (const [token, voice] of this.voices) if (voice.end <= now) this.dropVoice(token);
  }

  private dropVoice(token: number): void {
    const voice = this.voices.get(token);
    if (!voice) return;
    voice.out.disconnect();
    this.voices.delete(token);
  }
}
