import { describe, expect, it } from 'vitest';
import {
  INTRO_TIMELINE as T,
  SPORE_COUNT,
  canSkipIntro,
  crackPulseStep,
  INTRO_TITLE,
  INTRO_TITLE_LINES,
  flashAlpha,
  impactGlowAlpha,
  introPhase,
  meteorProgress,
  meteorScreenPath,
  pointOnPath,
  shakeOffset,
  shockwaveProgress,
  sporeMote,
  titleAlpha,
} from './introTimeline';

const magnitude = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);

describe('intro timeline', () => {
  it('walks calm → meteor → impact → aftermath → done inside the first 6 seconds', () => {
    expect(introPhase(0)).toBe('calm');
    expect(introPhase(T.meteorStart + 0.1)).toBe('meteor');
    expect(introPhase(T.impact + 0.05)).toBe('impact');
    expect(introPhase(T.impact + T.shakeDuration + 0.05)).toBe('aftermath');
    expect(introPhase(T.end)).toBe('done');
    expect(T.end).toBeLessThanOrEqual(6);
    expect(T.titleEnd).toBeLessThanOrEqual(T.end);
    expect(T.sporeEnd).toBeLessThanOrEqual(T.end);
  });

  it('flies the meteor only before the impact, accelerating toward it', () => {
    expect(meteorProgress(T.meteorStart - 0.01)).toBeNull();
    expect(meteorProgress(T.impact)).toBeNull();
    const samples = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => meteorProgress(T.meteorStart + f * (T.impact - T.meteorStart))!);
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    // Accelerating: the second half of the flight covers more ground than the first
    expect(samples[4] - samples[2]).toBeGreaterThan(samples[2] - samples[0]);
    expect(meteorProgress(T.impact - 1e-6)!).toBeCloseTo(1, 3);
  });
});

describe('screen shake', () => {
  it('is still before the impact and after it settles', () => {
    expect(shakeOffset(0)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(T.impact - 0.01)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(T.impact + T.shakeDuration)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(T.impact + 5)).toEqual({ x: 0, y: 0 });
  });

  it('kicks hard at the impact and decays', () => {
    const peak = (from: number, to: number) => {
      let m = 0;
      for (let t = from; t < to; t += 0.005) m = Math.max(m, magnitude(shakeOffset(T.impact + t)));
      return m;
    };
    const early = peak(0, 0.1);
    const late = peak(T.shakeDuration - 0.1, T.shakeDuration);
    expect(early).toBeGreaterThanOrEqual(6);
    expect(late).toBeLessThan(early / 2);
  });

  it('moves in whole art pixels (even screen px) and is deterministic', () => {
    for (let t = 0; t < T.shakeDuration; t += 0.013) {
      const o = shakeOffset(T.impact + t);
      expect(Math.abs(o.x) % 2).toBe(0);
      expect(Math.abs(o.y) % 2).toBe(0);
      expect(shakeOffset(T.impact + t)).toEqual(o);
    }
  });
});

describe('impact flash', () => {
  it('lasts exactly two frames', () => {
    expect(flashAlpha(-1)).toBe(0);
    expect(flashAlpha(0)).toBeGreaterThan(0);
    expect(flashAlpha(1)).toBeGreaterThan(0);
    expect(flashAlpha(1)).toBeLessThan(flashAlpha(0));
    expect(flashAlpha(2)).toBe(0);
    expect(flashAlpha(10)).toBe(0);
  });

  it('opens on a full white frame', () => {
    expect(flashAlpha(0)).toBe(1);
  });

  it('leaves a short warm afterglow that steps down and clears', () => {
    expect(impactGlowAlpha(T.impact - 0.01)).toBe(0);
    const samples = [0.05, 0.1, 0.2, 0.3].map((s) => impactGlowAlpha(T.impact + s));
    for (const a of samples) expect(a).toBeGreaterThan(0);
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
    expect(samples[3]).toBeLessThan(samples[0]);
    expect(impactGlowAlpha(T.impact + 0.5)).toBe(0);
  });
});

describe('shockwave and title card', () => {
  it('runs the shockwave from the impact outward', () => {
    expect(shockwaveProgress(T.impact - 0.01)).toBeNull();
    expect(shockwaveProgress(T.impact)).toBe(0);
    expect(shockwaveProgress(T.impact + T.shockwaveDuration / 2)).toBeCloseTo(0.5);
    expect(shockwaveProgress(T.impact + T.shockwaveDuration)).toBeNull();
  });

  it('fades the title in and out in stepped alpha', () => {
    expect(titleAlpha(T.titleStart - 0.01)).toBe(0);
    expect(titleAlpha((T.titleStart + T.titleEnd) / 2)).toBe(1);
    expect(titleAlpha(T.titleEnd)).toBe(0);
    const allowed = new Set([0, 0.25, 0.5, 0.75, 1]);
    for (let t = 0; t < T.end; t += 0.01) expect(allowed.has(titleAlpha(t))).toBe(true);
    // It actually passes through the intermediate steps on the way in
    expect(titleAlpha(T.titleStart + T.titleFade * 0.3)).toBeGreaterThan(0);
    expect(titleAlpha(T.titleStart + T.titleFade * 0.3)).toBeLessThan(1);
  });
});

describe('meteor screen path', () => {
  const screen = { w: 800, h: 600 };
  const inside = (p: { x: number; y: number }) => p.x >= 0 && p.x <= screen.w && p.y >= 0 && p.y <= screen.h;

  it('enters off-screen and crosses the view toward the impact, in every direction', () => {
    const dirs = [-1, 0, 1];
    for (const dx of dirs) {
      for (const dy of dirs) {
        if (dx === 0 && dy === 0) continue;
        const end = { x: 400 + dx * 1500, y: 300 + dy * 1200 };
        const path = meteorScreenPath(end, screen);
        expect(inside(path.start)).toBe(false);
        // Impacts level with or south of the colony come in from the upper sky
        if (dy >= 0) expect(path.start.y).toBeLessThan(screen.h / 2);
        expect(path.end).toEqual(end);
        let crosses = false;
        for (let p = 0; p <= 1; p += 0.01) if (inside(pointOnPath(path, p))) crosses = true;
        expect(crosses).toBe(true);
      }
    }
  });

  it('always streaks diagonally, never straight down', () => {
    const path = meteorScreenPath({ x: 400, y: 1800 }, screen);
    expect(Math.abs(path.end.x - path.start.x)).toBeGreaterThan(200);
  });
});

describe('spore motes', () => {
  const nest = { x: 1000, y: 1000 };
  const impact = { x: 2500, y: 600 };

  it('only drift during the spore window', () => {
    for (let i = 0; i < SPORE_COUNT; i++) {
      expect(sporeMote(i, T.sporeStart - 0.01, nest, impact)).toBeNull();
      expect(sporeMote(i, T.sporeEnd, nest, impact)).toBeNull();
    }
  });

  it('come from the impact side and drift toward the colony', () => {
    let alive = 0;
    const toImpact = { x: impact.x - nest.x, y: impact.y - nest.y };
    for (let i = 0; i < SPORE_COUNT; i++) {
      const samples: Array<{ x: number; y: number }> = [];
      for (let t = T.sporeStart; t < T.sporeEnd; t += 0.05) {
        const m = sporeMote(i, t, nest, impact);
        if (m) samples.push(m);
      }
      if (samples.length < 2) continue;
      alive++;
      const first = samples[0];
      const last = samples[samples.length - 1];
      expect((first.x - nest.x) * toImpact.x + (first.y - nest.y) * toImpact.y).toBeGreaterThan(0);
      expect(Math.hypot(last.x - nest.x, last.y - nest.y)).toBeLessThan(Math.hypot(first.x - nest.x, first.y - nest.y));
    }
    expect(alive).toBe(SPORE_COUNT);
  });
});

describe('crater cracks', () => {
  it('pulse slowly through dim → mid → bright → mid', () => {
    const steps = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => crackPulseStep(0.15 + k * 0.3));
    expect(steps).toEqual([0, 0, 1, 1, 2, 2, 1, 1]);
    expect(crackPulseStep(2.4 + 0.1)).toBe(crackPulseStep(0.1));
  });
});

describe('title card copy', () => {
  it('splits the title over two lines so it can be drawn big', () => {
    expect(INTRO_TITLE_LINES.join(' ')).toBe(INTRO_TITLE);
    expect(INTRO_TITLE_LINES).toHaveLength(2);
  });

  it('ignores skip input until the title appears, so the first click cannot hide the meteor', () => {
    expect(canSkipIntro(0)).toBe(false);
    expect(canSkipIntro(T.impact)).toBe(false);
    expect(canSkipIntro(T.titleStart - 0.01)).toBe(false);
    expect(canSkipIntro(T.titleStart)).toBe(true);
    expect(canSkipIntro(T.end)).toBe(true);
  });
});
