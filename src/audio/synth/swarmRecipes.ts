import type { AntRole } from '../../game/components/components';
import { noise, tone } from './primitives';
import type { Recipe } from './uiRecipes';

interface ChitterVoice {
  /** Center of the clicks' band (Hz): small castes click high, big ones low */
  band: number;
  q: number;
  clicks: number;
  /** Seconds between clicks */
  gap: number;
  /** The pitched chirp under the clicks, from → to (Hz) */
  chirp: readonly [number, number];
  chirpPeak: number;
  /** A low growl under the heavy castes (Hz) */
  body?: number;
}

/** Every caste answers a selection with its own chitter: same family, different throat. */
export const CHITTER_VOICES: Record<AntRole, ChitterVoice> = {
  worker: { band: 3200, q: 4, clicks: 4, gap: 0.03, chirp: [1500, 2100], chirpPeak: 0.16 },
  soldier: { band: 1700, q: 3, clicks: 3, gap: 0.042, chirp: [720, 520], chirpPeak: 0.14, body: 92 },
  scout: { band: 5200, q: 5, clicks: 6, gap: 0.02, chirp: [2600, 3700], chirpPeak: 0.12 },
  nurse: { band: 2500, q: 3, clicks: 3, gap: 0.055, chirp: [880, 1260], chirpPeak: 0.2 },
  defender: { band: 1250, q: 2.5, clicks: 3, gap: 0.048, chirp: [470, 390], chirpPeak: 0.14, body: 68 },
};

/** The Swarm talking back: wet clicks, chirps and hisses, never a voice. */
export const SWARM_RECIPES = {
  chitter: (v, params) => {
    const c = CHITTER_VOICES[params.caste ?? 'worker'];
    const span = c.clicks * c.gap;
    let end = 0;
    for (let i = 0; i < c.clicks; i++) {
      end = Math.max(end, noise(v, {
        at: i * c.gap * (0.85 + v.rng() * 0.3),
        dur: 0.014,
        peak: 0.55 + v.rng() * 0.25,
        filters: [{ type: 'bandpass', freq: c.band * (0.9 + v.rng() * 0.2), q: c.q }],
      }));
    }
    end = Math.max(end, tone(v, { type: 'triangle', freq: c.chirp[0], to: c.chirp[1], dur: span + 0.04, attack: 0.01, peak: c.chirpPeak }));
    if (c.body) {
      end = Math.max(end, tone(v, {
        type: 'sawtooth',
        freq: c.body,
        to: c.body * 0.85,
        dur: span + 0.06,
        attack: 0.01,
        peak: 0.3,
        filter: { type: 'lowpass', freq: 420, q: 1.5 },
      }));
    }
    return end;
  },

  /** Acknowledged: two quick clicks and an upward chirp */
  orderMove: (v) => Math.max(
    noise(v, { dur: 0.012, peak: 0.6, filters: [{ type: 'bandpass', freq: 3600, q: 4 }] }),
    noise(v, { at: 0.036, dur: 0.012, peak: 0.45, filters: [{ type: 'bandpass', freq: 3000, q: 4 }] }),
    tone(v, { freq: 1300, to: 2300, at: 0.02, dur: 0.075, attack: 0.006, peak: 0.3 }),
  ),

  /** Attack: a wet hiss that brightens, a gurgle under it and an acid fizz at the tail */
  orderAttack: (v) => Math.max(
    noise(v, { dur: 0.32, attack: 0.02, peak: 0.55, filters: [{ type: 'bandpass', freq: 1400, to: 5200, q: 1.6 }] }),
    noise(v, { at: 0.03, dur: 0.2, attack: 0.02, peak: 0.22, filters: [{ type: 'highpass', freq: 6000 }] }),
    noise(v, { color: 'crackle', at: 0.08, dur: 0.26, attack: 0.02, peak: 0.7, filters: [{ type: 'bandpass', freq: 4200, q: 1.2 }] }),
    tone(v, { freq: 150, to: 72, dur: 0.18, attack: 0.008, peak: 0.32, vibrato: { freq: 26, depth: 22 } }),
  ),
} satisfies Record<string, Recipe>;
