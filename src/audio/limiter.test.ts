import { describe, expect, it } from 'vitest';
import { VoiceLimiter, type LimitSpec } from './limiter';

const HIT: LimitSpec = { cooldown: 0.07, maxInstances: 4, priority: 2 };
const ALARM: LimitSpec = { cooldown: 3, maxInstances: 1, priority: 4 };

describe('voice limiter', () => {
  it('refuses a sound inside its cooldown and allows it once the cooldown has passed', () => {
    const limiter = new VoiceLimiter();
    expect(limiter.tryStart('acidHit', HIT, 0, 0.3)).not.toBeNull();
    expect(limiter.tryStart('acidHit', HIT, 0.05, 0.3)).toBeNull();
    expect(limiter.tryStart('acidHit', HIT, 0.07, 0.3)).not.toBeNull();
  });

  it('keeps cooldowns per sound: a crunch is not blocked by a hit', () => {
    const limiter = new VoiceLimiter();
    limiter.tryStart('acidHit', HIT, 0, 0.3);
    expect(limiter.tryStart('chitinCrunch', HIT, 0.01, 0.2)).not.toBeNull();
  });

  it('caps the copies of one sound playing at once', () => {
    const limiter = new VoiceLimiter();
    const spec: LimitSpec = { cooldown: 0, maxInstances: 2, priority: 2 };
    expect(limiter.tryStart('acidHit', spec, 0, 1)).not.toBeNull();
    expect(limiter.tryStart('acidHit', spec, 0.1, 1)).not.toBeNull();
    expect(limiter.tryStart('acidHit', spec, 0.2, 1)).toBeNull();
    // The first copy ends at t = 1: its slot frees up
    expect(limiter.tryStart('acidHit', spec, 1.0, 1)).not.toBeNull();
  });

  it('turns 60 ants fighting for a second into a handful of hits', () => {
    const limiter = new VoiceLimiter();
    let started = 0;
    // 60 attackers, each landing a hit every 0.8 s, sampled at 60 fps for one second
    for (let frame = 0; frame < 60; frame++) {
      const now = frame / 60;
      for (let ant = 0; ant < 60; ant++) {
        if ((ant * 7 + frame) % 48 === 0 && limiter.tryStart('acidHit', HIT, now, 0.3)) started++;
      }
    }
    expect(started).toBeGreaterThan(5);
    expect(started).toBeLessThanOrEqual(Math.ceil(1 / HIT.cooldown));
    expect(limiter.activeCount(0.99)).toBeLessThanOrEqual(HIT.maxInstances);
  });

  it('steals the oldest lowest-priority voice when the pool is full, and drops a sound that outranks nothing', () => {
    const limiter = new VoiceLimiter(3);
    const free: LimitSpec = { cooldown: 0, maxInstances: 9, priority: 2 };
    const first = limiter.tryStart('acidHit', free, 0, 5)!;
    limiter.tryStart('chitinCrunch', free, 0.1, 5);
    limiter.tryStart('deathAnt', { ...free, priority: 3 }, 0.2, 5);

    expect(limiter.tryStart('acidHit', free, 0.3, 5)).toBeNull();
    const alarm = limiter.tryStart('waveAlarm', ALARM, 0.4, 3);
    expect(alarm?.evicted).toBe(first.token);
    expect(limiter.activeCount(0.5)).toBe(3);
  });

  it('frees a released voice at once and forgets cooldowns on reset', () => {
    const limiter = new VoiceLimiter(1);
    const grant = limiter.tryStart('introHum', { cooldown: 1, maxInstances: 1, priority: 5 }, 0, 4)!;
    limiter.release(grant.token);
    expect(limiter.activeCount(0.1)).toBe(0);
    expect(limiter.tryStart('introHum', { cooldown: 1, maxInstances: 1, priority: 5 }, 0.2, 4)).toBeNull();
    limiter.reset();
    expect(limiter.tryStart('introHum', { cooldown: 1, maxInstances: 1, priority: 5 }, 0.2, 4)).not.toBeNull();
  });
});
