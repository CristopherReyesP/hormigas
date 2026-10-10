import { describe, expect, it } from 'vitest';
import { INTRO_TIMELINE as T, IntroClock, introPhase, SPIRE_COUNT } from '../game/render/introTimeline';
import type { AudioEvent } from './events';
import { INTRO_CUES, IntroCueTracker, introCuesFor, introRealSeconds } from './introCues';

const FRAME = 1 / 60;

/**
 * Drive a real intro clock at 60 fps, the way GameManager.render does, and
 * collect what the tracker fires with the intro time it fired at. A skip
 * lands between frames, like the skip listener.
 */
function play(skipAt?: number): Array<{ t: number; event: AudioEvent }> {
  const clock = new IntroClock();
  const tracker = new IntroCueTracker();
  const fired: Array<{ t: number; event: AudioEvent }> = [];
  for (let i = 0; i < 60 * 30 && clock.isPlaying(); i++) {
    if (skipAt !== undefined && clock.elapsed >= skipAt) clock.skip();
    clock.advance(FRAME);
    for (const event of tracker.frame(clock.elapsed, FRAME)) fired.push({ t: clock.elapsed, event });
  }
  return fired;
}

const cueOf = (e: AudioEvent): string => (e.type === 'intro' ? e.cue : e.type);

describe('intro cue schedule', () => {
  it('lands each cue on its intro timeline beat and phase', () => {
    const at = (cue: string) => INTRO_CUES.filter((c) => c.cue === cue).map((c) => c.at);
    expect(at('whoosh')).toEqual([T.meteorStart]);
    expect(introPhase(T.meteorStart)).toBe('meteor');
    expect(at('impact')).toEqual([T.impact]);
    expect(introPhase(T.impact)).toBe('impact');
    expect(at('crystal')).toEqual(Array.from({ length: SPIRE_COUNT }, (_, i) => T.spireStart + i * T.spireStagger));
    for (const t of at('crystal')) expect(introPhase(t)).toBe('deploy');
    expect(at('pulse')).toEqual([T.pulseStart]);
    expect(at('hum')).toEqual([T.droneStart]);
    expect(introPhase(T.droneStart)).toBe('deploy');
    expect(at('title')).toEqual([T.titleStart]);
    expect(at('end')).toEqual([T.end]);
  });

  it('is in time order, one crystal chime per spire, climbing', () => {
    const times = INTRO_CUES.map((c) => c.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(INTRO_CUES.filter((c) => c.cue === 'crystal').map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('stretches the whoosh over the slow motion so it ends on the impact', () => {
    // 2.06 s at full speed, then 0.14 intro s at quarter speed = 0.56 real s
    expect(introRealSeconds(T.meteorStart, T.impact)).toBeCloseTo(2.06 + 0.14 / T.slowMoScale);
    expect(INTRO_CUES.find((c) => c.cue === 'whoosh')?.duration).toBeCloseTo(2.62);
    expect(introRealSeconds(T.impact, T.end)).toBeCloseTo(T.end - T.impact);
  });

  it('hums from the drones rising until the camera is home', () => {
    expect(INTRO_CUES.find((c) => c.cue === 'hum')?.duration).toBeCloseTo(T.returnEnd - T.droneStart);
  });
});

describe('intro cue tracker', () => {
  it('fires every cue once, in order, as a real 60 fps intro plays through', () => {
    const fired = play();
    expect(fired.map((f) => cueOf(f.event))).toEqual(INTRO_CUES.map((c) => c.cue));
    // Each fires on the first frame at or past its beat
    fired.forEach((f, i) => {
      expect(f.t).toBeGreaterThanOrEqual(INTRO_CUES[i].at);
      expect(f.t - INTRO_CUES[i].at).toBeLessThan(FRAME + 1e-9);
    });
  });

  it('turns a skip into one introSkip and nothing that was still to come', () => {
    const fired = play(T.impact + 0.3);
    const cues = fired.map((f) => cueOf(f.event));
    expect(cues).toEqual(['whoosh', 'impact', 'introSkip']);
  });

  it('stays silent after the intro and starts over on reset', () => {
    const tracker = new IntroCueTracker();
    expect(tracker.frame(T.end, T.end).map(cueOf)).toEqual(INTRO_CUES.map((c) => c.cue));
    expect(tracker.frame(T.end, FRAME)).toEqual([]);
    expect(tracker.finished).toBe(true);
    tracker.reset();
    expect(tracker.frame(T.meteorStart, T.meteorStart).map(cueOf)).toEqual(['whoosh']);
  });

  it('holds while the intro is paused', () => {
    const tracker = new IntroCueTracker();
    tracker.frame(T.impact + 0.1, T.impact + 0.1);
    expect(tracker.frame(T.impact + 0.1, 0)).toEqual([]);
    expect(tracker.finished).toBe(false);
  });
});

describe('intro cues per rival', () => {
  it('only rings the crystal chimes, pulse and hum when the Crystal Hive arrives', () => {
    const cues = (variant: 'crystal' | 'human' | 'wildlife') => introCuesFor(variant).map((c) => c.cue);
    expect(cues('crystal')).toEqual(INTRO_CUES.map((c) => c.cue));
    for (const variant of ['human', 'wildlife'] as const) {
      expect(cues(variant)).not.toContain('crystal');
      expect(cues(variant)).not.toContain('pulse');
      expect(cues(variant)).not.toContain('hum');
      expect(cues(variant)).toEqual(expect.arrayContaining(['whoosh', 'impact', 'title', 'end']));
    }
  });

  it('plays the variant the tracker was reset to', () => {
    const tracker = new IntroCueTracker();
    tracker.reset('human');
    const fired = tracker.frame(T.end, T.end).map(cueOf);
    expect(fired).not.toContain('crystal');
    expect(fired).toContain('impact');
  });
});
