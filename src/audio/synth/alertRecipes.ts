import type { AntRole } from '../../game/components/components';
import { bell, gainNode, noise, tone } from './primitives';
import type { Recipe } from './uiRecipes';

/** Each caste's hatch chime sits on its own note of A minor pentatonic. */
export const HATCH_NOTES: Record<AntRole, number> = {
  worker: 1318.5, // E6
  soldier: 880, // A5
  scout: 1975.5, // B6
  nurse: 784, // G5
  defender: 587.3, // D5
  bomber: 659.3, // E5
};

/**
 * Alerts the player must not miss, but that never shout: the nightfall
 * horn, the egg plops, the hatch chime and the evolution chamber's swell.
 */
export const ALERT_RECIPES = {
  waveAlarm: (v) => {
    // A low horn (root, fifth, octave) whose filter opens and closes, under three red pulses
    const { ctx, t } = v;
    const horn = ctx.createBiquadFilter();
    horn.type = 'lowpass';
    horn.Q.value = 2.5;
    horn.frequency.setValueAtTime(220, t);
    horn.frequency.exponentialRampToValueAtTime(950, t + 0.5);
    horn.frequency.exponentialRampToValueAtTime(300, t + 2.6);
    horn.connect(v.out);
    let end = Math.max(
      tone(v, { type: 'sawtooth', freq: 55, dur: 2.65, attack: 0.35, hold: 1.2, peak: 0.34, dest: horn }),
      tone(v, { type: 'sawtooth', freq: 82.4, detune: 5, dur: 2.65, attack: 0.4, hold: 1.1, peak: 0.24, dest: horn }),
      tone(v, { type: 'sawtooth', freq: 110, detune: -4, dur: 2.5, attack: 0.45, hold: 1.0, peak: 0.16, dest: horn }),
    );
    for (const at of [0.55, 1.15, 1.75]) {
      end = Math.max(
        end,
        tone(v, { freq: 84, to: 60, at, dur: 0.36, attack: 0.01, peak: 0.42 }),
        noise(v, { at, dur: 0.1, peak: 0.28, filters: [{ type: 'lowpass', freq: 320 }] }),
      );
    }
    return end;
  },

  /** "Huevo encargado": a bubble rising out of something wet */
  eggQueued: (v) => Math.max(
    tone(v, { freq: 260, to: 820, dur: 0.07, attack: 0.003, peak: 0.5 }),
    tone(v, { freq: 180, to: 120, dur: 0.1, attack: 0.004, peak: 0.28 }),
    noise(v, { dur: 0.03, peak: 0.18, filters: [{ type: 'lowpass', freq: 900 }] }),
  ),

  /** The queen lays: a lower, softer plop with a squish */
  eggLaid: (v) => Math.max(
    tone(v, { freq: 160, to: 420, dur: 0.09, attack: 0.005, peak: 0.34 }),
    noise(v, { dur: 0.15, attack: 0.01, peak: 0.34, filters: [{ type: 'lowpass', freq: 1200, to: 300, q: 2 }] }),
  ),

  /** A shell cracks, then two glassy notes a fifth apart */
  hatchChime: (v, params) => {
    const note = HATCH_NOTES[params.caste ?? 'worker'];
    return Math.max(
      tone(v, { freq: 300, to: 700, dur: 0.05, attack: 0.003, peak: 0.2 }),
      bell(v, { freq: note, at: 0.03, dur: 1.1, peak: 0.4 }),
      bell(v, { freq: note * 1.5, at: 0.12, dur: 0.9, peak: 0.24 }),
    );
  },

  dawnSwell: (v) => {
    // The evolution chamber opens: an A minor add9 pad that blooms, a breath, and a rising shimmer
    const { ctx, t } = v;
    const bloom = ctx.createBiquadFilter();
    bloom.type = 'lowpass';
    bloom.Q.value = 1.1;
    bloom.frequency.setValueAtTime(250, t);
    bloom.frequency.exponentialRampToValueAtTime(2600, t + 2.2);
    bloom.frequency.exponentialRampToValueAtTime(700, t + 3.7);
    const pad = gainNode(ctx, 1);
    bloom.connect(pad).connect(v.out);
    let end = 0;
    for (const [freq, detune] of [[110, -6], [110, 6], [164.8, 0], [246.9, 4], [261.6, -4]] as const) {
      end = Math.max(end, tone(v, { type: 'sawtooth', freq, detune, dur: 3.7, attack: 1.2, hold: 1.0, peak: 0.12, dest: bloom }));
    }
    end = Math.max(
      end,
      tone(v, { freq: 55, dur: 3.5, attack: 1.0, peak: 0.3 }),
      noise(v, { dur: 2.5, attack: 1.2, peak: 0.1, filters: [{ type: 'bandpass', freq: 600, to: 1800, q: 0.8 }] }),
    );
    [880, 1046.5, 1318.5, 1975.5].forEach((freq, i) => {
      end = Math.max(end, bell(v, { freq, at: 1.0 + i * 0.25, dur: 1.4, peak: 0.16 }));
    });
    return end;
  },

  /** A pick lands: a squelch as the flesh takes it, then a chime that climbs */
  mutationChosen: (v) => {
    let end = Math.max(
      noise(v, { dur: 0.25, attack: 0.01, peak: 0.45, filters: [{ type: 'lowpass', freq: 2000, to: 300, q: 4 }] }),
      tone(v, { freq: 90, to: 45, dur: 0.25, attack: 0.004, peak: 0.42 }),
    );
    [659.3, 987.8, 1318.5].forEach((freq, i) => {
      end = Math.max(end, bell(v, { freq, at: 0.08 + i * 0.1, dur: 1.0, peak: 0.24 }));
    });
    return end;
  },

  /** A Mejoras level bought: a quick rising arpeggio over a soft thump, one step higher per level */
  levelUp: (v, params) => {
    const lift = Math.pow(2, Math.min(4, Math.max(0, (params.index ?? 1) - 1)) / 12);
    let end = tone(v, { freq: 110, to: 70, dur: 0.18, attack: 0.004, peak: 0.3 });
    [523.3, 659.3, 784, 1046.5].forEach((freq, i) => {
      end = Math.max(end, bell(v, { freq: freq * lift, at: 0.04 + i * 0.07, dur: 0.6, peak: 0.2 }));
    });
    return end;
  },
} satisfies Record<string, Recipe>;
