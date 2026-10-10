import { bell, gainNode, lfo, noise, tone } from './primitives';
import type { Recipe } from './uiRecipes';

/** The spires climb A minor pentatonic as they grow, one note per spire. */
export const SPIRE_NOTES = [880, 1046.5, 1174.7, 1318.5, 1568, 1760, 2093] as const;

/** Fallback lengths when a cue arrives without one (the preview page). */
const WHOOSH_SECONDS = 2.6;
const HUM_SECONDS = 3.2;

/**
 * The opening cinematic, cue by cue (introCues.ts fires them from the intro
 * clock): the meteor's rising whoosh, the impact's boom and sub rumble, a
 * glass chime per crystal spire, the cyan pulse, the drones' hum and the
 * title sting.
 */
export const INTRO_RECIPES = {
  introWhoosh: (v, params) => {
    // Everything swells until the impact and is cut by it
    const d = params.duration ?? WHOOSH_SECONDS;
    const rise = d - 0.05;
    return Math.max(
      noise(v, { dur: d + 0.12, attack: rise, peak: 0.5, filters: [{ type: 'bandpass', freq: 250, to: 3200, q: 0.9 }] }),
      noise(v, { dur: d + 0.15, attack: rise, peak: 0.34, rate: 0.5, filters: [{ type: 'lowpass', freq: 400, to: 1200 }] }),
      noise(v, { color: 'crackle', dur: d + 0.1, attack: rise * 0.9, peak: 0.32, filters: [{ type: 'highpass', freq: 2000 }] }),
      tone(v, { type: 'sawtooth', freq: 60, to: 180, dur: d + 0.12, attack: rise, peak: 0.14, filter: { type: 'lowpass', freq: 500 } }),
    );
  },

  introImpact: (v) => Math.max(
    noise(v, { dur: 0.06, peak: 0.85, filters: [{ type: 'highpass', freq: 800 }] }),
    noise(v, { dur: 1.6, attack: 0.005, peak: 0.9, filters: [{ type: 'lowpass', freq: 1400, to: 90, q: 0.8 }] }),
    tone(v, { freq: 62, to: 26, dur: 2.8, attack: 0.01, peak: 0.9 }),
    tone(v, { freq: 45, to: 24, detune: 12, dur: 3.0, attack: 0.02, peak: 0.55 }),
    noise(v, { color: 'crackle', at: 0.1, dur: 1.2, attack: 0.05, peak: 0.5, filters: [{ type: 'lowpass', freq: 3000 }] }),
  ),

  introCrystal: (v, params) => {
    const i = Math.max(0, Math.min(SPIRE_NOTES.length - 1, params.index ?? 0));
    const note = SPIRE_NOTES[i];
    return Math.max(
      // The glassy push of the spire breaking the ground, then its ring and a detuned twin for shimmer
      noise(v, { dur: 0.28, attack: 0.15, peak: 0.12, filters: [{ type: 'bandpass', freq: note * 2, q: 8 }] }),
      bell(v, { freq: note, at: 0.12, dur: 2.0, peak: 0.45 }),
      bell(v, { freq: note * 1.003, at: 0.13, dur: 1.6, peak: 0.18 }),
    );
  },

  introPulse: (v) => Math.max(
    tone(v, { freq: 110, dur: 1.6, attack: 0.03, peak: 0.4 }),
    tone(v, { freq: 220.5, dur: 1.4, attack: 0.03, peak: 0.2 }),
    noise(v, { dur: 1.1, attack: 0.02, peak: 0.2, filters: [{ type: 'bandpass', freq: 300, to: 2400, q: 6 }] }),
    bell(v, { freq: 1760, dur: 1.2, peak: 0.12 }),
  ),

  introHum: (v, params) => {
    // Two close sines beat slowly under a filtered octave; a thin shimmer flutters on top
    const d = params.duration ?? HUM_SECONDS;
    const hold = Math.max(0, d - 1.4);
    const flutter = gainNode(v.ctx, 0.5);
    flutter.connect(v.out);
    lfo(v, { freq: 5.5, depth: 0.45, dur: d, target: flutter.gain });
    return Math.max(
      tone(v, { freq: 98, dur: d, attack: 0.6, hold, peak: 0.3 }),
      tone(v, { freq: 98.9, dur: d, attack: 0.6, hold, peak: 0.28 }),
      tone(v, { type: 'triangle', freq: 196, dur: d, attack: 0.7, hold, peak: 0.15, filter: { type: 'lowpass', freq: 700 } }),
      tone(v, { freq: 392, to: 330, dur: d, attack: 0.8, peak: 0.06 }),
      tone(v, { freq: 1568, detune: 6, dur: d, attack: 0.8, hold, peak: 0.05, dest: flutter }),
    );
  },

  introTitle: (v) => {
    // "EL ENJAMBRE DESPIERTA": a hit, a dark D minor chord that snaps open, a growl and one crystal ping
    const { ctx, t } = v;
    const snap = ctx.createBiquadFilter();
    snap.type = 'lowpass';
    snap.Q.value = 1.4;
    snap.frequency.setValueAtTime(300, t);
    snap.frequency.exponentialRampToValueAtTime(3000, t + 0.25);
    snap.frequency.exponentialRampToValueAtTime(500, t + 2.6);
    snap.connect(v.out);
    const growl = gainNode(ctx, 0.6);
    growl.connect(v.out);
    lfo(v, { freq: 9, depth: 0.4, dur: 1.6, target: growl.gain });
    let end = Math.max(
      noise(v, { dur: 0.6, peak: 0.6, filters: [{ type: 'lowpass', freq: 900, to: 120 }] }),
      tone(v, { freq: 70, to: 35, dur: 1.2, attack: 0.005, peak: 0.75 }),
      tone(v, { type: 'sawtooth', freq: 55, dur: 1.6, attack: 0.02, peak: 0.3, filter: { type: 'lowpass', freq: 380 }, dest: growl }),
      bell(v, { freq: 1174.7, at: 0.05, dur: 1.8, peak: 0.25 }),
    );
    for (const [freq, detune] of [[73.4, -5], [110, 4], [146.8, -3], [174.6, 5]] as const) {
      end = Math.max(end, tone(v, { type: 'sawtooth', freq, detune, dur: 2.6, attack: 0.02, hold: 0.6, peak: 0.14, dest: snap }));
    }
    return end;
  },
} satisfies Record<string, Recipe>;
