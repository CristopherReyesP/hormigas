import { INTRO_TIMELINE as T, SPIRE_COUNT } from '../game/render/introTimeline';
import type { AudioEvent, IntroCue } from './events';

/** One beat of the intro's sound: the intro time it fires at, and what it plays. */
export interface IntroCueSpec {
  at: number;
  cue: IntroCue;
  index?: number;
  /** Real seconds the sound must last */
  duration?: number;
}

/**
 * Real seconds between two intro times. Intro time runs at `slowMoScale`
 * through the last stretch of the flight and at full speed elsewhere (see
 * IntroClock), so a sound that must end on the impact has to be longer than
 * the intro times suggest.
 */
export function introRealSeconds(from: number, to: number): number {
  const slow = Math.max(0, Math.min(to, T.impact) - Math.max(from, T.slowMoStart));
  return to - from - slow + slow / T.slowMoScale;
}

function buildIntroCues(): IntroCueSpec[] {
  const cues: IntroCueSpec[] = [
    { at: T.meteorStart, cue: 'whoosh', duration: introRealSeconds(T.meteorStart, T.impact) },
    { at: T.impact, cue: 'impact' },
    { at: T.pulseStart, cue: 'pulse' },
    { at: T.droneStart, cue: 'hum', duration: introRealSeconds(T.droneStart, T.returnEnd) },
    { at: T.titleStart, cue: 'title' },
    { at: T.end, cue: 'end' },
  ];
  for (let i = 0; i < SPIRE_COUNT; i++) cues.push({ at: T.spireStart + i * T.spireStagger, cue: 'crystal', index: i });
  return cues.sort((a, b) => a.at - b.at);
}

/** The intro's sound schedule, straight off the intro timeline, in time order. */
export const INTRO_CUES: readonly IntroCueSpec[] = buildIntroCues();

const toEvent = (c: IntroCueSpec): AudioEvent => ({ type: 'intro', cue: c.cue, index: c.index, duration: c.duration });

/**
 * Turns the intro clock into cue events, once per rendered frame. It fires
 * every cue whose beat the clock passed since the last frame. A clock that
 * jumped further than the frame's real time (the skip lands it on the end
 * state) fires one `introSkip` instead of the rest of the schedule.
 */
export class IntroCueTracker {
  private last = 0;
  private done = false;

  get finished(): boolean {
    return this.done;
  }

  reset(): void {
    this.last = 0;
    this.done = false;
  }

  /** `t`: intro time now; `dt`: the frame's real seconds (0 while paused). */
  frame(t: number, dt: number): AudioEvent[] {
    if (this.done) return [];
    const jumped = t - this.last > Math.max(0, dt) + 1e-6;
    if (jumped && t >= T.end) {
      this.last = t;
      this.done = true;
      return [{ type: 'introSkip' }];
    }
    const due = INTRO_CUES.filter((c) => c.at > this.last && c.at <= t).map(toEvent);
    this.last = t;
    if (t >= T.end) this.done = true;
    return due;
  }
}
