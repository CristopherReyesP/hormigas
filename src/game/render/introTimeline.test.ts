import { describe, expect, it } from 'vitest';
import {
  INTRO_TIMELINE as T,
  DRONE_COUNT,
  DRONE_FRAME_COUNT,
  DRONE_HOVER,
  IntroClock,
  SHARD_COUNT,
  SHARD_ORBIT,
  SPIRE_COUNT,
  SPORE_COUNT,
  canSkipIntro,
  crackPulseStep,
  crystalPulseProgress,
  droneBob,
  droneState,
  droneTrail,
  ejectaChunk,
  INTRO_TITLE,
  INTRO_TITLE_LINES,
  flashAlpha,
  impactGlowAlpha,
  introCameraFocus,
  introCameraZoom,
  introLitAreas,
  introPhase,
  introTimeScale,
  letterboxAmount,
  meteorAltitude,
  meteorGround,
  meteorProgress,
  shakeOffset,
  shardOffset,
  shockwaveProgress,
  spireGrowth,
  sporeMote,
  titleAlpha,
  INTRO_VARIANTS,
  introDrones,
  introFlashAlpha,
  introPulse,
  introRivalLine,
  introSpireGrowth,
  introVariantFor,
} from './introTimeline';
import {
  HUMAN_LANDING,
  WAKE_CRITTERS,
  WILDLIFE_WAKE,
  dropshipState,
  humanBuildProgress,
  landingDustProgress,
  searchlightSpot,
  troopState,
  wakeCritter,
} from './introArrival';
import { hasGlyph } from '../../engine/renderer/pixelart/PixelFont';

const magnitude = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
/** Sample `fn` every `step` intro seconds over [from, to). */
const sample = <R>(from: number, to: number, step: number, fn: (t: number) => R): R[] => {
  const out: R[] = [];
  for (let t = from; t < to; t += step) out.push(fn(t));
  return out;
};

const NEST = { x: 1936, y: 1456 };
const IMPACT = { x: 3300, y: 600 };

describe('intro timeline', () => {
  it('walks calm → meteor → impact → deploy → return → aftermath → done', () => {
    const phases = sample(0, T.end + 0.5, 0.02, introPhase);
    const order = phases.filter((p, i) => i === 0 || p !== phases[i - 1]);
    expect(order).toEqual(['calm', 'meteor', 'impact', 'deploy', 'return', 'aftermath', 'done']);
    expect(introPhase(T.meteorStart)).toBe('meteor');
    expect(introPhase(T.impact)).toBe('impact');
    expect(introPhase(T.returnStart)).toBe('return');
    expect(introPhase(T.returnEnd)).toBe('aftermath');
    expect(introPhase(T.end)).toBe('done');
  });

  it('stages every beat in story order and stays short', () => {
    const beats = [
      T.letterboxIn, T.meteorStart, T.slowMoStart, T.impact, T.spireStart, T.pulseStart,
      T.droneStart, T.returnStart, T.returnEnd, T.letterboxOutStart, T.end,
    ];
    for (let i = 1; i < beats.length; i++) expect(beats[i]).toBeGreaterThan(beats[i - 1]);
    // The title shows up as the camera lands back on the colony
    expect(T.titleStart).toBeGreaterThan(T.returnStart);
    expect(T.titleStart).toBeLessThanOrEqual(T.returnEnd);
    expect(T.titleEnd).toBeLessThanOrEqual(T.end);
    expect(T.sporeEnd).toBeLessThanOrEqual(T.end);
    expect(T.letterboxOutStart + T.letterboxOut).toBeLessThanOrEqual(T.end);
    expect(T.end).toBeLessThanOrEqual(11);
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

describe('slow motion and the intro clock', () => {
  it('slows time only for the last stretch before the impact', () => {
    expect(introTimeScale(0)).toBe(1);
    expect(introTimeScale(T.slowMoStart - 0.01)).toBe(1);
    expect(introTimeScale(T.slowMoStart)).toBeLessThan(0.5);
    expect(introTimeScale(T.impact - 0.01)).toBe(introTimeScale(T.slowMoStart));
    expect(introTimeScale(T.impact)).toBe(1);
    expect(introTimeScale(T.end)).toBe(1);
  });

  it('takes longer in real time to reach the impact than the timeline says', () => {
    const clock = new IntroClock();
    let real = 0;
    while (clock.elapsed < T.impact) {
      clock.advance(1 / 60);
      real += 1 / 60;
    }
    const expected = T.slowMoStart + (T.impact - T.slowMoStart) / introTimeScale(T.slowMoStart);
    expect(real).toBeCloseTo(expected, 1);
    expect(real).toBeGreaterThan(T.impact + 0.2);
  });

  it('lands on the same moment whether the frames are short or long', () => {
    const fine = new IntroClock();
    for (let i = 0; i < 400; i++) fine.advance(0.01);
    const coarse = new IntroClock();
    coarse.advance(1.5);
    coarse.advance(2.5);
    expect(coarse.elapsed).toBeCloseTo(fine.elapsed, 6);
  });

  it('holds while paused and stops at the end', () => {
    const clock = new IntroClock();
    clock.advance(1);
    const held = clock.elapsed;
    clock.advance(0);
    expect(clock.elapsed).toBe(held);
    clock.advance(100);
    expect(clock.elapsed).toBe(T.end);
    expect(clock.isPlaying()).toBe(false);
  });
});

describe('skipping', () => {
  it('ignores skip input until the meteor has landed', () => {
    expect(canSkipIntro(0)).toBe(false);
    expect(canSkipIntro(T.meteorStart + 0.5)).toBe(false);
    expect(canSkipIntro(T.impact - 0.01)).toBe(false);
    expect(canSkipIntro(T.impact)).toBe(true);
    expect(canSkipIntro(T.end)).toBe(true);
  });

  it('refuses during the flight and leaves the clock alone', () => {
    const clock = new IntroClock();
    clock.advance(1);
    const before = clock.elapsed;
    expect(clock.skip()).toBe(false);
    expect(clock.elapsed).toBe(before);
    expect(clock.isPlaying()).toBe(true);
  });

  it('jumps to the end state once allowed: crater kept, camera home, letterbox gone', () => {
    const clock = new IntroClock();
    while (clock.elapsed < T.impact + 0.1) clock.advance(1 / 60);
    expect(clock.skip()).toBe(true);
    expect(clock.elapsed).toBe(T.end);
    expect(clock.isPlaying()).toBe(false);
    const t = clock.elapsed;
    expect(introPhase(t)).toBe('done');
    expect(letterboxAmount(t)).toBe(0);
    expect(titleAlpha(t)).toBe(0);
    expect(introCameraFocus(t, NEST, IMPACT)).toEqual(NEST);
    expect(introCameraZoom(t, 1)).toBe(1);
    expect(shakeOffset(t)).toEqual({ x: 0, y: 0 });
    for (let i = 0; i < SPIRE_COUNT; i++) expect(spireGrowth(i, t)).toBe(1); // the spires stay with the crater
    for (let i = 0; i < DRONE_COUNT; i++) expect(droneState(i, t, IMPACT, NEST)).toBeNull();
    expect(introLitAreas(t, NEST, IMPACT)).toEqual([]);
  });
});

describe('letterbox', () => {
  it('slides in at the start, holds, and slides out at the end', () => {
    expect(letterboxAmount(0)).toBe(0);
    expect(letterboxAmount(T.letterboxIn)).toBe(1);
    expect(letterboxAmount((T.impact + T.returnStart) / 2)).toBe(1);
    expect(letterboxAmount(T.letterboxOutStart)).toBe(1);
    expect(letterboxAmount(T.letterboxOutStart + T.letterboxOut)).toBe(0);
    const slideIn = sample(0, T.letterboxIn, 0.01, letterboxAmount);
    for (let i = 1; i < slideIn.length; i++) expect(slideIn[i]).toBeGreaterThanOrEqual(slideIn[i - 1]);
    const slideOut = sample(T.letterboxOutStart, T.end, 0.01, letterboxAmount);
    for (let i = 1; i < slideOut.length; i++) expect(slideOut[i]).toBeLessThanOrEqual(slideOut[i - 1]);
  });
});

describe('cinematic camera', () => {
  it('starts on the colony and holds there until the meteor shows up', () => {
    expect(introCameraFocus(0, NEST, IMPACT)).toEqual(NEST);
    expect(introCameraFocus(T.meteorStart, NEST, IMPACT)).toEqual(NEST);
  });

  it('follows the meteor all the way to the impact point', () => {
    const settled = T.impact + T.cameraSettle;
    const atCrater = introCameraFocus(settled, NEST, IMPACT);
    expect(dist(atCrater, IMPACT)).toBeLessThan(1);
    expect(introCameraFocus((settled + T.returnStart) / 2, NEST, IMPACT)).toEqual(IMPACT);
    // Never drifts away from the impact on the way there, and never overtakes the meteor
    const away = sample(0, settled, 0.01, (t) => dist(introCameraFocus(t, NEST, IMPACT), NEST));
    for (let i = 1; i < away.length; i++) expect(away[i]).toBeGreaterThanOrEqual(away[i - 1] - 1e-9);
    for (let t = T.meteorStart; t < T.impact; t += 0.01) {
      const cam = dist(introCameraFocus(t, NEST, IMPACT), NEST);
      const rock = dist(meteorGround(t, NEST, IMPACT)!, NEST);
      expect(cam).toBeLessThanOrEqual(rock + 1e-9);
      // ...but keeps it close enough to stay in the shot
      expect(rock - cam).toBeLessThan(400);
    }
  });

  it('eases the pan in and settles onto the crater without a jolt', () => {
    const speed = (t: number) => dist(introCameraFocus(t + 0.01, NEST, IMPACT), introCameraFocus(t, NEST, IMPACT)) / 0.01;
    const panStart = T.meteorStart + T.cameraLag;
    expect(speed(panStart + 0.05)).toBeLessThan(speed((panStart + T.impact) / 2));
    // Speed right after the impact matches the speed right before it (within 25%)
    const before = speed(T.impact - 0.02);
    const after = speed(T.impact + 0.001);
    expect(Math.abs(after - before) / before).toBeLessThan(0.25);
    expect(speed(T.impact + T.cameraSettle - 0.02)).toBeLessThan(after / 4);
  });

  it('glides back to the colony with an eased in-out pan', () => {
    const home = sample(T.returnStart, T.returnEnd + 0.01, 0.01, (t) => dist(introCameraFocus(t, NEST, IMPACT), NEST));
    for (let i = 1; i < home.length; i++) expect(home[i]).toBeLessThanOrEqual(home[i - 1] + 1e-9);
    expect(introCameraFocus(T.returnStart, NEST, IMPACT)).toEqual(IMPACT);
    expect(introCameraFocus(T.returnEnd, NEST, IMPACT)).toEqual(NEST);
    expect(introCameraFocus(T.end - 0.01, NEST, IMPACT)).toEqual(NEST);
    const span = T.returnEnd - T.returnStart;
    const step = (f: number) => dist(
      introCameraFocus(T.returnStart + (f + 0.02) * span, NEST, IMPACT),
      introCameraFocus(T.returnStart + f * span, NEST, IMPACT),
    );
    expect(step(0.02)).toBeLessThan(step(0.48) / 3);
    expect(step(0.96)).toBeLessThan(step(0.48) / 3);
  });

  it('punches in one zoom step for the crater shot and stays on the 0.5 grid', () => {
    expect(introCameraZoom(0, 1)).toBe(1);
    expect(introCameraZoom(T.impact - 0.01, 1)).toBe(1);
    expect(introCameraZoom(T.impact, 1)).toBe(1.5);
    expect(introCameraZoom(T.returnStart - 0.01, 0.5)).toBe(1);
    expect(introCameraZoom(T.returnStart, 1)).toBe(1);
    for (let t = 0; t < T.end; t += 0.05) expect((introCameraZoom(t, 1) / 0.5) % 1).toBe(0);
  });
});

describe('meteor in world space', () => {
  it('runs its ground track from the colony to the impact point', () => {
    expect(meteorGround(T.meteorStart - 0.01, NEST, IMPACT)).toBeNull();
    expect(meteorGround(T.meteorStart, NEST, IMPACT)).toEqual(NEST);
    expect(dist(meteorGround(T.impact - 1e-6, NEST, IMPACT)!, IMPACT)).toBeLessThan(1);
    expect(meteorGround(T.impact, NEST, IMPACT)).toBeNull();
  });

  it('falls from high in the sky to the ground at the impact', () => {
    expect(meteorAltitude(T.meteorStart, 600)).toBe(600);
    const alt = sample(T.meteorStart, T.impact, 0.02, (t) => meteorAltitude(t, 600));
    for (let i = 1; i < alt.length; i++) expect(alt[i]).toBeLessThan(alt[i - 1]);
    expect(meteorAltitude(T.impact - 1e-6, 600)).toBeLessThan(1);
  });

  it('lights the ground under the meteor, then the crater until the camera leaves', () => {
    expect(introLitAreas(0, NEST, IMPACT)).toEqual([]);
    const mid = (T.meteorStart + T.impact) / 2;
    const [spot] = introLitAreas(mid, NEST, IMPACT);
    expect(dist(spot, meteorGround(mid, NEST, IMPACT)!)).toBeLessThan(1);
    const [crater] = introLitAreas(T.impact + 1, NEST, IMPACT);
    expect(crater).toMatchObject(IMPACT);
    expect(crater.r).toBeGreaterThan(spot.r);
    expect(introLitAreas(T.returnEnd, NEST, IMPACT)).toEqual([]);
  });

  it('throws ejecta out of the crater that land again', () => {
    for (let i = 0; i < 24; i++) {
      expect(ejectaChunk(i, T.impact - 0.01, IMPACT)).toBeNull();
      const early = ejectaChunk(i, T.impact + 0.05, IMPACT)!;
      const late = ejectaChunk(i, T.impact + 0.5, IMPACT)!;
      expect(dist(late, IMPACT)).toBeGreaterThan(dist(early, IMPACT));
      expect(ejectaChunk(i, T.impact + 2, IMPACT)).toBeNull();
    }
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

describe('enemy deployment at the crater', () => {
  it('grows every spire from nothing to full height, one after another', () => {
    for (let i = 0; i < SPIRE_COUNT; i++) {
      expect(spireGrowth(i, T.impact)).toBe(0);
      const g = sample(T.spireStart, T.droneStart + 1, 0.01, (t) => spireGrowth(i, t));
      for (let k = 1; k < g.length; k++) expect(g[k]).toBeGreaterThanOrEqual(g[k - 1]);
      for (const v of g) expect(v >= 0 && v <= 1).toBe(true);
      expect(spireGrowth(i, T.returnStart)).toBe(1);
    }
    const firstMove = (i: number) => sample(T.spireStart, T.returnStart, 0.01, (t) => t).find((t) => spireGrowth(i, t) > 0)!;
    for (let i = 1; i < SPIRE_COUNT; i++) expect(firstMove(i)).toBeGreaterThan(firstMove(i - 1));
  });

  it('rings a cyan pulse out of the crater once the spires are up', () => {
    expect(crystalPulseProgress(T.pulseStart - 0.01)).toBeNull();
    expect(crystalPulseProgress(T.pulseStart)).toBe(0);
    expect(crystalPulseProgress(T.pulseStart + T.pulseDuration / 2)).toBeCloseTo(0.5);
    expect(crystalPulseProgress(T.pulseStart + T.pulseDuration)).toBeNull();
  });

  /** Intro time drone `i` appears, has risen to hover height, and starts to glide. */
  const droneStart = (i: number) => T.droneStart + i * T.droneStagger;
  const droneUp = (i: number) => droneStart(i) + T.droneEmerge + T.droneRise;
  const droneGlides = (i: number) => droneUp(i) + T.droneUnfold;

  it('pushes each drone up out of the crater floor, then lifts it straight up to hover', () => {
    for (let i = 0; i < DRONE_COUNT; i++) {
      expect(droneState(i, droneStart(i) - 0.01, IMPACT, NEST)).toBeNull();
      const first = droneState(i, droneStart(i), IMPACT, NEST)!;
      expect(first.lift).toBe(0);
      expect(first.emerge).toBeLessThan(1);
      const rising = sample(droneStart(i), droneUp(i), 0.01, (t) => droneState(i, t, IMPACT, NEST)!);
      for (let k = 1; k < rising.length; k++) {
        expect(rising[k].emerge).toBeGreaterThanOrEqual(rising[k - 1].emerge);
        expect(rising[k].lift).toBeGreaterThanOrEqual(rising[k - 1].lift);
        // Straight up: the ground point holds still and the shards stay docked
        expect(dist(rising[k], first)).toBe(0);
        expect(rising[k].spread).toBe(0);
      }
      const up = droneState(i, droneUp(i), IMPACT, NEST)!;
      expect(up.emerge).toBe(1);
      expect(up.lift).toBeGreaterThan(0);
      // It rises inside the crater bowl
      expect(dist(first, IMPACT)).toBeLessThan(50);
    }
  });

  it('wakes the energy core and unfolds the shards into orbit once it hovers', () => {
    for (let i = 0; i < DRONE_COUNT; i++) {
      const frames = sample(droneStart(i), T.returnEnd, 0.01, (t) => droneState(i, t, IMPACT, NEST)!.frame);
      const wake = frames.filter((f, k) => k === 0 || f !== frames[k - 1]).slice(0, 3);
      expect(wake).toEqual([0, 1, 2]);
      // Only core states (dormant, waking, lit, bright): no walk cycle
      for (const f of frames) expect(f >= 0 && f < DRONE_FRAME_COUNT).toBe(true);
      expect(frames.includes(3)).toBe(true);

      const spread = sample(droneUp(i), droneGlides(i) + 0.1, 0.01, (t) => droneState(i, t, IMPACT, NEST)!.spread);
      expect(spread[0]).toBe(0);
      for (let k = 1; k < spread.length; k++) expect(spread[k]).toBeGreaterThanOrEqual(spread[k - 1]);
      expect(spread[spread.length - 1]).toBe(1);
      // The shards keep turning once they are out
      const a = droneState(i, droneGlides(i) + 0.1, IMPACT, NEST)!.orbit;
      const b = droneState(i, droneGlides(i) + 0.4, IMPACT, NEST)!.orbit;
      expect(b).not.toBeCloseTo(a);
    }
  });

  it('glides the drones out of the crater toward the colony, hovering the whole way', () => {
    for (let i = 0; i < DRONE_COUNT; i++) {
      const states = sample(droneStart(i), T.returnEnd, 0.01, (t) => droneState(i, t, IMPACT, NEST)!);
      const d = states.map((s) => dist(s, IMPACT));
      for (let k = 1; k < d.length; k++) expect(d[k]).toBeGreaterThanOrEqual(d[k - 1] - 1e-9);
      // Whenever it moves it floats above the ground with its core lit: it never walks
      for (let k = 1; k < states.length; k++) {
        if (d[k] === d[k - 1]) continue;
        expect(states[k].lift).toBeGreaterThan(0);
        expect(states[k].frame).toBeGreaterThanOrEqual(2);
        expect(states[k].spread).toBe(1);
      }
      expect(states.some((s) => s.gliding)).toBe(true);
      const last = droneState(i, T.returnStart - 0.01, IMPACT, NEST)!;
      expect(dist(last, IMPACT)).toBeGreaterThan(60); // past the crater rim
      expect(dist(last, IMPACT)).toBeLessThan(220); // a short glide, not a march
      // Out toward the colony's side of the crater
      const toNest = { x: NEST.x - IMPACT.x, y: NEST.y - IMPACT.y };
      expect((last.x - IMPACT.x) * toNest.x + (last.y - IMPACT.y) * toNest.y).toBeGreaterThan(0);
      expect(droneState(i, T.returnEnd, IMPACT, NEST)).toBeNull();
    }
  });

  it('bobs the hovering drones gently, periodically and out of step with each other', () => {
    // An odd step so no sample lands on a bob step boundary
    const times = sample(0, 4, 0.0137, (s) => s);
    for (let i = 0; i < DRONE_COUNT; i++) {
      const bobs = times.map((s) => droneBob(i, s));
      for (const [k, b] of bobs.entries()) {
        expect(Math.abs(b)).toBeLessThanOrEqual(DRONE_HOVER.bob);
        expect(Math.abs(b % 2)).toBe(0); // whole art pixels
        expect(droneBob(i, times[k] + DRONE_HOVER.bobPeriod)).toBe(b);
      }
      expect(Math.max(...bobs)).toBe(DRONE_HOVER.bob);
      expect(Math.min(...bobs)).toBe(-DRONE_HOVER.bob);
    }
    expect(times.some((s) => droneBob(0, s) !== droneBob(1, s))).toBe(true);
    // The bob never sets a hovering drone down
    expect(DRONE_HOVER.lift - DRONE_HOVER.bob).toBeGreaterThan(0);
  });

  it('docks the shards on the body, then swings them out onto a tilted orbit ring', () => {
    // Docked: level with the core, hugging both sides of the body
    const docked = [0, 1].map((k) => shardOffset(k, 0, 0));
    expect(docked.map((o) => o.dy)).toEqual([0, 0]);
    expect(docked[0].dx).toBe(SHARD_ORBIT.dock);
    expect(docked[1].dx).toBe(-SHARD_ORBIT.dock);
    // The ring widens as the shards unfold
    const reach = [0, 0.25, 0.5, 0.75, 1].map((f) => shardOffset(0, f, 0).dx);
    for (let k = 1; k < reach.length; k++) expect(reach[k]).toBeGreaterThan(reach[k - 1]);
    expect(reach[4]).toBe(SHARD_ORBIT.rx);

    const ring = sample(0, Math.PI * 2, 0.05, (a) => [0, 1].map((k) => shardOffset(k, 1, a)));
    for (const [p, q] of ring) {
      for (const o of [p, q]) {
        expect(Math.abs(o.dx % 2) + Math.abs(o.dy % 2)).toBe(0); // whole art pixels
        expect(Math.abs(Math.hypot(o.dx / SHARD_ORBIT.rx, o.dy / SHARD_ORBIT.ry) - 1)).toBeLessThan(0.15);
        if (o.dy < 0) expect(o.behind).toBe(true); // the far half of the ring passes behind the body
        if (o.dy > 0) expect(o.behind).toBe(false);
      }
      // The two shards stay on opposite sides of the core
      expect(Math.abs(p.dx + q.dx)).toBeLessThanOrEqual(2);
      expect(Math.abs(p.dy + q.dy)).toBeLessThanOrEqual(2);
    }
    expect(ring.some(([p]) => p.behind) && ring.some(([p]) => !p.behind)).toBe(true);
    expect(SHARD_COUNT).toBe(2);
  });

  it('leaves a faint light trail only while a drone glides', () => {
    for (let i = 0; i < DRONE_COUNT; i++) {
      expect(droneTrail(i, droneGlides(i) - 0.05, IMPACT, NEST)).toEqual([]);
      const t = droneGlides(i) + 0.4;
      const now = droneState(i, t, IMPACT, NEST)!;
      const trail = droneTrail(i, t, IMPACT, NEST);
      expect(trail.length).toBeGreaterThan(2);
      // Behind the drone, back toward the crater, oldest last and fading out
      for (const [k, p] of trail.entries()) {
        expect(dist(p, IMPACT)).toBeLessThan(dist(now, IMPACT));
        expect(p.lift).toBeGreaterThan(0);
        if (k > 0) {
          expect(dist(p, IMPACT)).toBeLessThanOrEqual(dist(trail[k - 1], IMPACT));
          expect(p.age).toBeGreaterThan(trail[k - 1].age);
        }
      }
      expect(droneTrail(i, T.returnEnd, IMPACT, NEST)).toEqual([]);
    }
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
});

// ── One opening per rival ─────────────────────────────────────────────

describe('intro variant per rival', () => {
  it('picks the arrival from the rival chosen in the race picker', () => {
    expect(introVariantFor('crystal')).toBe('crystal');
    expect(introVariantFor('human')).toBe('human');
    expect(introVariantFor('wildlife')).toBe('wildlife');
    // A mirror match has no alien base to bring in either
    expect(introVariantFor('swarm')).toBe('wildlife');
  });

  it('brings a meteor for the Hive and the wildlife, and a dropship for the Humans', () => {
    expect(INTRO_VARIANTS.crystal.arrival).toBe('meteor');
    expect(INTRO_VARIANTS.wildlife.arrival).toBe('meteor');
    expect(INTRO_VARIANTS.human.arrival).toBe('dropship');
  });

  it('deploys Crystal spires, pulse and drones only against the Crystal Hive', () => {
    expect(INTRO_VARIANTS.crystal.crystalDeploy).toBe(true);
    expect(INTRO_VARIANTS.human.crystalDeploy).toBe(false);
    expect(INTRO_VARIANTS.wildlife.crystalDeploy).toBe(false);
    expect(INTRO_VARIANTS.wildlife.wildlifeWake).toBe(true);
    expect(INTRO_VARIANTS.human.humanDeploy).toBe(true);
    expect(INTRO_VARIANTS.crystal.humanDeploy || INTRO_VARIANTS.crystal.wildlifeWake).toBe(false);
  });

  it('shows no crystal deploy at any moment of the wildlife or the human opening', () => {
    const nest = { x: 1000, y: 1000 };
    const impact = { x: 2200, y: 400 };
    for (const variant of ['wildlife', 'human'] as const) {
      for (let t = 0; t <= T.end; t += 0.05) {
        expect(introDrones(variant, t, impact, nest), `${variant} @${t}`).toEqual([]);
        expect(introPulse(variant, t)).toBeNull();
        for (let i = 0; i < SPIRE_COUNT; i++) expect(introSpireGrowth(variant, i, t)).toBe(0);
      }
    }
  });

  it('keeps today\'s spires, pulse and drones against the Crystal Hive', () => {
    const nest = { x: 1000, y: 1000 };
    const impact = { x: 2200, y: 400 };
    expect(introDrones('crystal', T.droneStart + 1, impact, nest)).toHaveLength(DRONE_COUNT);
    expect(introPulse('crystal', T.pulseStart + 0.1)).toBe(crystalPulseProgress(T.pulseStart + 0.1));
    expect(introSpireGrowth('crystal', 0, T.end)).toBe(1);
  });

  it('names the rival under the title, in the pixel font', () => {
    expect(introRivalLine('human')).toBe('RIVAL: HUMANOS');
    expect(introRivalLine('crystal')).toBe('RIVAL: COLMENA DE CRISTAL');
    expect(introRivalLine('wildlife')).toBe('RIVAL: FAUNA SALVAJE');
    for (const rival of ['human', 'crystal', 'wildlife'] as const) {
      for (const ch of introRivalLine(rival)) expect(hasGlyph(ch), ch).toBe(true);
    }
  });
});

describe('the Humans\' dropship', () => {
  const nest = { x: 1000, y: 1000 };
  const site = { x: 300, y: 2100 };
  const ALT = 400;

  it('flies from the colony and touches down on the human base site', () => {
    expect(meteorGround(T.meteorStart, nest, site, 'human')).toEqual(nest);
    const ship = dropshipState(T.impact, nest, site, ALT)!;
    expect(ship).toMatchObject({ x: site.x, y: site.y, alt: 0, landed: true });
    expect(ship.facingLeft).toBe(true);
  });

  it('brakes into a soft landing instead of slamming in like the meteor', () => {
    const speed = (variant: 'human' | 'crystal', t: number) =>
      magnitude({
        x: meteorGround(t + 0.01, nest, site, variant)!.x - meteorGround(t, nest, site, variant)!.x,
        y: meteorGround(t + 0.01, nest, site, variant)!.y - meteorGround(t, nest, site, variant)!.y,
      });
    const mid = (T.meteorStart + T.impact) / 2;
    expect(speed('human', T.impact - 0.02)).toBeLessThan(speed('human', mid));
    expect(speed('crystal', T.impact - 0.02)).toBeGreaterThan(speed('crystal', mid));
    expect(meteorAltitude(T.impact - 0.05, ALT, 'human')).toBeLessThan(meteorAltitude(T.impact - 0.05, ALT, 'crystal'));
  });

  it('fires its engines on the way down and lifts off once the base is dropped', () => {
    expect(dropshipState(T.meteorStart - 0.1, nest, site, ALT)).toBeNull();
    expect(dropshipState((T.meteorStart + T.impact) / 2, nest, site, ALT)!.thrust).toBeGreaterThan(0);
    expect(dropshipState(T.impact + 0.2, nest, site, ALT)!.thrust).toBe(0);
    const up = dropshipState(HUMAN_LANDING.liftoffStart + HUMAN_LANDING.liftoffDuration * 0.6, nest, site, ALT)!;
    expect(up.alt).toBeGreaterThan(0);
    expect(up.landed).toBe(false);
    expect(dropshipState(HUMAN_LANDING.liftoffStart + HUMAN_LANDING.liftoffDuration, nest, site, ALT)).toBeNull();
  });

  it('chases the dropship with the camera, settles on the base site and lights it, not the crater', () => {
    const focus = introCameraFocus(T.impact + T.cameraSettle + 0.1, nest, site, 'human');
    expect(focus.x).toBeCloseTo(site.x);
    expect(focus.y).toBeCloseTo(site.y);
    const lit = introLitAreas(T.impact + 1, nest, site, 'human');
    expect(lit).toHaveLength(1);
    expect(lit[0]).toMatchObject({ x: site.x, y: site.y });
    // The base spreads over several tiles: the light covers more than the crater's 8
    expect(lit[0].r).toBeGreaterThan(8);
    const trail = introLitAreas((T.meteorStart + T.impact) / 2, nest, site, 'human')[0];
    const ground = meteorGround((T.meteorStart + T.impact) / 2, nest, site, 'human')!;
    expect(trail).toMatchObject({ x: ground.x, y: ground.y });
  });

  it('kicks up a dust ring on touchdown, with no white meteor flash', () => {
    expect(landingDustProgress(T.impact - 0.01)).toBeNull();
    expect(landingDustProgress(T.impact + 0.3)).toBeGreaterThan(0);
    expect(introFlashAlpha('human', 0)).toBe(0);
    expect(introFlashAlpha('crystal', 0)).toBe(flashAlpha(0));
    expect(magnitude(shakeOffset(T.impact + 0.01, 0.5))).toBeLessThan(magnitude(shakeOffset(T.impact + 0.01)));
  });

  it('raises the command center first, then the rest of the base, floor by floor', () => {
    expect(humanBuildProgress(0, HUMAN_LANDING.buildStart - 0.01)).toBe(0);
    const mid = humanBuildProgress(0, HUMAN_LANDING.buildStart + HUMAN_LANDING.buildDuration / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(mid * 8).toBe(Math.floor(mid * 8));
    expect(humanBuildProgress(1, HUMAN_LANDING.buildStart + HUMAN_LANDING.buildDuration / 2)).toBeLessThan(mid);
    for (let i = 0; i < 4; i++) expect(humanBuildProgress(i, T.returnStart)).toBe(1);
  });

  it('marches the soldiers out of the command center to their posts', () => {
    const door = { x: 300, y: 2140 };
    const post = { x: 240, y: 2060 };
    expect(troopState(0, HUMAN_LANDING.troopStart - 0.01, door, post)).toBeNull();
    const out = troopState(0, HUMAN_LANDING.troopStart + 0.01, door, post)!;
    expect(magnitude({ x: out.x - door.x, y: out.y - door.y })).toBeLessThan(5);
    expect(out.marching).toBe(true);
    const there = troopState(0, T.returnStart, door, post)!;
    expect(there).toMatchObject({ x: post.x, y: post.y, marching: false });
  });

  it('sweeps a searchlight across the ground once the command center stands', () => {
    const origin = { x: 300, y: 2100 };
    expect(searchlightSpot(HUMAN_LANDING.searchlightStart - 0.01, origin, nest)).toBeNull();
    const a = searchlightSpot(HUMAN_LANDING.searchlightStart + 0.4, origin, nest)!;
    const b = searchlightSpot(HUMAN_LANDING.searchlightStart + 1.2, origin, nest)!;
    expect(magnitude({ x: a.x - b.x, y: a.y - b.y })).toBeGreaterThan(20);
    expect(searchlightSpot(T.returnEnd, origin, nest)).toBeNull();
  });
});

describe('the wildlife wakes', () => {
  const nest = { x: 1000, y: 1000 };
  const impact = { x: 2200, y: 400 };

  it('bursts beetles and leapers out of the ground around the crater, then scatters them', () => {
    expect(WAKE_CRITTERS).toContain('beetle');
    expect(WAKE_CRITTERS).toContain('leaper');
    for (let i = 0; i < WAKE_CRITTERS.length; i++) {
      expect(wakeCritter(i, WILDLIFE_WAKE.start - 0.01, impact, nest)).toBeNull();
      const start = WILDLIFE_WAKE.start + i * WILDLIFE_WAKE.stagger;
      const rumble = wakeCritter(i, start + 0.01, impact, nest)!;
      expect(rumble.emerge).toBe(0);
      const d0 = magnitude({ x: rumble.x - impact.x, y: rumble.y - impact.y });
      expect(d0).toBeGreaterThan(60);
      const later = wakeCritter(i, T.returnStart, impact, nest)!;
      expect(later.emerge).toBe(1);
      expect(later.kind).toBe(WAKE_CRITTERS[i]);
      expect(magnitude({ x: later.x - impact.x, y: later.y - impact.y })).toBeGreaterThan(d0 + 60);
      expect(wakeCritter(i, T.returnEnd, impact, nest)).toBeNull();
    }
  });

  it('hops the leapers and keeps the beetles on the ground', () => {
    const lifts = (i: number) => {
      const out: number[] = [];
      for (let t = WILDLIFE_WAKE.start; t < T.returnEnd; t += 0.02) out.push(wakeCritter(i, t, impact, nest)?.lift ?? 0);
      return out;
    };
    const leaper = WAKE_CRITTERS.indexOf('leaper');
    const beetle = WAKE_CRITTERS.indexOf('beetle');
    expect(Math.max(...lifts(leaper))).toBeGreaterThan(10);
    expect(Math.max(...lifts(beetle))).toBe(0);
  });
});
