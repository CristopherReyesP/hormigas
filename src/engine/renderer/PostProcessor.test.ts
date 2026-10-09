import { describe, expect, it } from 'vitest';
import { DUSK_ALARM_DURATION, NIGHT_GLOW_MAX, PostProcessor, duskAlarmAlpha, nightGlowAlpha } from './PostProcessor';

/** A post processor that has just watched the day turn into night. */
function atNightfall(): PostProcessor {
  const pp = new PostProcessor();
  pp.setDayPhase('day', 0.99);
  pp.setDayPhase('night', 0);
  return pp;
}

describe('night sky (red-violet, the Swarm hour)', () => {
  it('uses the red-violet edge step at the start and end of the night', () => {
    const pp = new PostProcessor();
    pp.setDayPhase('night', 0.05);
    expect(pp.getSkyState()).toEqual({ color: '#2a0d1e', alpha: 0.28, night: true });
    pp.setDayPhase('night', 0.95);
    expect(pp.getSkyState()).toEqual({ color: '#2a0d1e', alpha: 0.28, night: true });
  });

  it('uses the deep red-violet step in the middle of the night', () => {
    const pp = new PostProcessor();
    pp.setDayPhase('night', 0.5);
    expect(pp.getSkyState()).toEqual({ color: '#1a0612', alpha: 0.5, night: true });
  });
});

describe('dusk alarm', () => {
  it('fires the moment day turns into night', () => {
    expect(atNightfall().getAlarmLevel()).toBeGreaterThan(0);
  });

  it('stays silent during the day', () => {
    const pp = new PostProcessor();
    pp.setDayPhase('day', 0.2);
    pp.setDayPhase('day', 0.9);
    expect(pp.getAlarmLevel()).toBe(0);
  });

  it('does not fire when the first frame it sees is already night', () => {
    const pp = new PostProcessor();
    pp.setDayPhase('night', 0.3);
    expect(pp.getAlarmLevel()).toBe(0);
  });

  it('is brief: gone once its duration has elapsed', () => {
    const pp = atNightfall();
    pp.advance(DUSK_ALARM_DURATION + 0.01);
    expect(pp.getAlarmLevel()).toBe(0);
    pp.setDayPhase('night', 0.1);
    expect(pp.getAlarmLevel()).toBe(0); // later night frames never re-fire it
  });

  it('holds still while the game is paused (dt = 0)', () => {
    const pp = atNightfall();
    pp.advance(0.1);
    const held = pp.getAlarmLevel();
    for (let i = 0; i < 100; i++) pp.advance(0);
    expect(pp.getAlarmLevel()).toBe(held);
  });

  it('fires again at the next nightfall', () => {
    const pp = atNightfall();
    pp.advance(DUSK_ALARM_DURATION + 1);
    pp.setDayPhase('day', 0);
    pp.setDayPhase('night', 0);
    expect(pp.getAlarmLevel()).toBeGreaterThan(0);
  });
});

describe('duskAlarmAlpha (stepped double pulse)', () => {
  const samples = Array.from({ length: Math.ceil(DUSK_ALARM_DURATION * 100) + 50 }, (_, i) => duskAlarmAlpha(i / 100));

  it('is quantized to a handful of stepped levels, never a smooth fade', () => {
    expect(new Set(samples).size).toBeLessThanOrEqual(4);
  });

  it('starts at full strength and ends at zero', () => {
    expect(duskAlarmAlpha(0)).toBe(Math.max(...samples));
    expect(duskAlarmAlpha(DUSK_ALARM_DURATION)).toBe(0);
    expect(duskAlarmAlpha(-1)).toBe(0);
  });

  it('beats twice, the second beat weaker than the first', () => {
    const half = DUSK_ALARM_DURATION / 2;
    expect(duskAlarmAlpha(half)).toBeGreaterThan(0);
    expect(duskAlarmAlpha(half)).toBeLessThan(duskAlarmAlpha(0));
    expect(duskAlarmAlpha(half - 0.01)).toBeLessThan(duskAlarmAlpha(half));
  });
});

describe('nightGlowAlpha (post-tint bioluminescence)', () => {
  it('is off during the day', () => {
    for (const p of [0, 0.3, 0.6, 0.99]) expect(nightGlowAlpha('day', p)).toBe(0);
  });

  it('glows at full strength in the deep night', () => {
    expect(nightGlowAlpha('night', 0.5)).toBe(NIGHT_GLOW_MAX);
  });

  it('scales with night depth: the dusk/dawn edge glows less than the deep night', () => {
    const edge = nightGlowAlpha('night', 0.05);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(NIGHT_GLOW_MAX);
    expect(nightGlowAlpha('night', 0.95)).toBe(edge);
    // Proportional to the tint it has to shine through (0.28 vs 0.5)
    expect(edge / NIGHT_GLOW_MAX).toBeCloseTo(0.28 / 0.5);
  });
});
