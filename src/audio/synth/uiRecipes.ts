import type { SoundParams } from '../sounds';
import { bell, filterNode, gainNode, noise, tone, type Voice } from './primitives';

/** Builds one sound on a voice; returns how long it lasts (seconds after `v.t`). */
export type Recipe = (v: Voice, params: SoundParams) => number;

/**
 * The chrome: short, dry and quiet, so the HUD feels alive without ever
 * covering the world. Hover is a glassy tick, a click a chitin tap, a
 * command press a two-step organic blip, a refused command a low buzz.
 */
export const UI_RECIPES = {
  uiHover: (v) => Math.max(
    tone(v, { freq: 2300, to: 2600, dur: 0.035, attack: 0.002, peak: 0.35 }),
    tone(v, { freq: 4700, dur: 0.02, attack: 0.001, peak: 0.06 }),
  ),

  uiClick: (v) => Math.max(
    noise(v, { dur: 0.014, peak: 0.45, filters: [{ type: 'highpass', freq: 2800 }] }),
    tone(v, { type: 'triangle', freq: 920, to: 610, dur: 0.06, attack: 0.002, peak: 0.45 }),
  ),

  uiCommand: (v) => Math.max(
    noise(v, { dur: 0.02, peak: 0.4, filters: [{ type: 'bandpass', freq: 2600, q: 2 }] }),
    tone(v, { type: 'triangle', freq: 430, to: 760, dur: 0.075, attack: 0.003, peak: 0.55 }),
    tone(v, { type: 'triangle', freq: 760, to: 1020, at: 0.045, dur: 0.06, attack: 0.003, peak: 0.32 }),
  ),

  uiError: (v) => {
    // Two low, slightly detuned buzzes through a dull filter: "not enough minerals"
    const dull = filterNode(v.ctx, { type: 'lowpass', freq: 1300, q: 0.9 }, v.t, v.t + 0.3);
    dull.connect(v.out);
    let end = 0;
    for (const at of [0, 0.13]) {
      end = Math.max(
        end,
        tone(v, { type: 'sawtooth', freq: 96, at, dur: 0.1, attack: 0.004, hold: 0.05, peak: 0.42, dest: dull }),
        tone(v, { type: 'square', freq: 101, at, dur: 0.1, attack: 0.004, hold: 0.05, peak: 0.22, dest: dull }),
      );
    }
    return end;
  },

  uiStart: (v) => {
    // COMENZAR: a fleshy swell that opens up, capped by one crystal ping
    const open = filterNode(v.ctx, { type: 'lowpass', freq: 260, to: 2600, q: 1.2 }, v.t, v.t + 0.55);
    const body = gainNode(v.ctx, 1);
    open.connect(body).connect(v.out);
    const end = Math.max(
      tone(v, { type: 'sawtooth', freq: 110, dur: 1.1, attack: 0.18, peak: 0.32, dest: open }),
      tone(v, { type: 'sawtooth', freq: 165, detune: 6, dur: 1.0, attack: 0.2, peak: 0.24, dest: open }),
      tone(v, { type: 'sine', freq: 55, dur: 0.9, attack: 0.05, peak: 0.4 }),
      bell(v, { freq: 1318.5, at: 0.22, dur: 1.0, peak: 0.22 }),
    );
    return end;
  },
} satisfies Record<string, Recipe>;
