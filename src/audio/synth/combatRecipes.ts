import { gainNode, lfo, noise, tone, type Voice } from './primitives';
import type { Recipe } from './uiRecipes';

/** ±10% so a swarm's hits never sound like one sample on repeat. */
const spread = (v: Voice): number => 0.9 + v.rng() * 0.2;

/** A chitin crack: a short band of noise. */
function crack(v: Voice, at: number, freq: number, peak: number): number {
  return noise(v, { at, dur: 0.035, peak, filters: [{ type: 'bandpass', freq, q: 1.4 }] });
}

/** The wet part of a death: resonant noise closing down, a sinking warbled note and a few goo bubbles. */
function squelch(v: Voice, at: number, dur: number, from: number, pitch: number, peak: number): number {
  let end = Math.max(
    noise(v, { at, dur, attack: 0.01, peak, filters: [{ type: 'lowpass', freq: from, to: 220, q: 4 }] }),
    tone(v, { freq: pitch, to: pitch * 0.25, at, dur: dur * 0.9, attack: 0.01, peak: peak * 0.5, vibrato: { freq: 22, depth: pitch * 0.08 } }),
  );
  for (let i = 0; i < 3; i++) {
    const pop = at + dur * (0.25 + i * 0.22) * spread(v);
    end = Math.max(end, tone(v, { freq: 380 * spread(v), to: 900, at: pop, dur: 0.03, attack: 0.003, peak: peak * 0.28 }));
  }
  return end;
}

/**
 * Combat: the Swarm spits acid (a puff, then a sizzle of crackle), wildlife
 * bites (chitin cracks over a thump), and every death is wet.
 */
export const COMBAT_RECIPES = {
  acidHit: (v) => {
    const k = spread(v);
    return Math.max(
      noise(v, { dur: 0.05, peak: 0.55, filters: [{ type: 'highpass', freq: 1800 }, { type: 'bandpass', freq: 3000 * k, to: 1500, q: 1.2 }] }),
      tone(v, { freq: 900 * k, to: 260, dur: 0.06, attack: 0.002, peak: 0.28 }),
      noise(v, { color: 'crackle', at: 0.03, dur: 0.28, attack: 0.01, peak: 0.9, filters: [{ type: 'highpass', freq: 3500 }] }),
      noise(v, { at: 0.03, dur: 0.22, attack: 0.02, peak: 0.1, filters: [{ type: 'highpass', freq: 6500 }] }),
    );
  },

  chitinCrunch: (v) => {
    const k = spread(v);
    return Math.max(
      crack(v, 0, 1800 * k, 0.8),
      crack(v, 0.022, 950 * k, 0.6),
      tone(v, { freq: 160 * k, to: 55, dur: 0.08, attack: 0.002, peak: 0.45 }),
      noise(v, { color: 'crackle', dur: 0.07, peak: 0.6, filters: [{ type: 'bandpass', freq: 2500, q: 1 }] }),
    );
  },

  deathAnt: (v) => Math.max(
    crack(v, 0, 3000 * spread(v), 0.35),
    squelch(v, 0.01, 0.34, 2400, 320 * spread(v), 0.6),
  ),

  deathBeetle: (v) => Math.max(
    crack(v, 0, 1200, 0.8),
    crack(v, 0.03, 820, 0.7),
    crack(v, 0.07, 600, 0.6),
    tone(v, { freq: 110, to: 38, dur: 0.4, attack: 0.004, peak: 0.55 }),
    squelch(v, 0.06, 0.45, 1600, 180, 0.55),
  ),

  deathCricket: (v) => {
    // A last chirp, its wings rasping out of rhythm, then the crunch and the squelch
    const rasp = gainNode(v.ctx, 0.5);
    rasp.connect(v.out);
    lfo(v, { type: 'square', freq: 38, depth: 0.5, dur: 0.3, target: rasp.gain });
    return Math.max(
      tone(v, { type: 'square', freq: 4300, to: 2400, dur: 0.3, attack: 0.01, peak: 0.16, filter: { type: 'bandpass', freq: 3800, q: 2 }, dest: rasp }),
      crack(v, 0.06, 1400, 0.6),
      crack(v, 0.09, 900, 0.5),
      squelch(v, 0.12, 0.38, 1800, 240, 0.5),
    );
  },
} satisfies Record<string, Recipe>;
