import type { SoundId, SoundSpec } from './sounds';

/** What the limiter needs to know about a sound: a slice of its SoundSpec. */
export type LimitSpec = Pick<SoundSpec, 'cooldown' | 'maxInstances' | 'priority'>;

export interface VoiceGrant {
  /** Handle for the new voice */
  token: number;
  /** A lower-priority voice that gave up its slot: the engine fades it out */
  evicted: number | null;
}

interface ActiveVoice {
  token: number;
  sound: SoundId;
  end: number;
  priority: number;
}

/**
 * Voice budget for the mixer. Pure bookkeeping on an injected clock, so it
 * is deterministic under test:
 * - a sound cannot restart within its cooldown (a swarm's hits become a
 *   rhythm, not a buzz);
 * - at most `maxInstances` copies of one sound play at once;
 * - the whole pool holds `maxVoices`; when it is full a new sound steals the
 *   oldest voice of the lowest priority below its own, or is dropped.
 */
export class VoiceLimiter {
  private readonly maxVoices: number;
  private active: ActiveVoice[] = [];
  private readonly lastStart = new Map<SoundId, number>();
  private nextToken = 1;

  constructor(maxVoices = 24) {
    this.maxVoices = maxVoices;
  }

  /** Ask for a voice that plays from `now` for `duration` seconds; null means "stay silent". */
  tryStart(sound: SoundId, spec: LimitSpec, now: number, duration: number): VoiceGrant | null {
    this.active = this.active.filter((v) => v.end > now);

    const last = this.lastStart.get(sound);
    if (last !== undefined && now - last < spec.cooldown) return null;
    if (this.active.filter((v) => v.sound === sound).length >= spec.maxInstances) return null;

    let evicted: number | null = null;
    if (this.active.length >= this.maxVoices) {
      const victim = this.pickVictim(spec.priority);
      if (!victim) return null;
      this.active = this.active.filter((v) => v !== victim);
      evicted = victim.token;
    }

    const token = this.nextToken++;
    this.active.push({ token, sound, end: now + duration, priority: spec.priority });
    this.lastStart.set(sound, now);
    return { token, evicted };
  }

  /** A voice was stopped early (skip, eviction): free its slot now. */
  release(token: number): void {
    this.active = this.active.filter((v) => v.token !== token);
  }

  /** Voices still sounding at `now`. */
  activeCount(now: number): number {
    return this.active.filter((v) => v.end > now).length;
  }

  /** Forget everything (a new run). */
  reset(): void {
    this.active = [];
    this.lastStart.clear();
  }

  /** The oldest voice of the lowest priority, if that priority is below `priority`. */
  private pickVictim(priority: number): ActiveVoice | null {
    let victim: ActiveVoice | null = null;
    for (const v of this.active) {
      if (v.priority >= priority) continue;
      if (!victim || v.priority < victim.priority) victim = v;
    }
    return victim;
  }
}
