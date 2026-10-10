import { describe, expect, it } from 'vitest';
import { ART_PX } from '../../engine/renderer/sprites/spriteScale';
import { LEAP, LEAP_CYCLE, LeapTracker, leapFrame } from './leapMotion';

const AIR_START = LEAP.crouch;
const AIR_END = LEAP.crouch + LEAP.air;
const LAND_END = AIR_END + LEAP.land;

describe('leapFrame: one hop cycle (crouch → air → land → rest)', () => {
  it('runs the phases in order and repeats every cycle', () => {
    expect(LEAP_CYCLE).toBeCloseTo(LEAP.crouch + LEAP.air + LEAP.land + LEAP.rest);
    expect(leapFrame(0).phase).toBe('crouch');
    expect(leapFrame(AIR_START + 0.01).phase).toBe('air');
    expect(leapFrame(AIR_END + 0.01).phase).toBe('land');
    expect(leapFrame(LAND_END + 0.01).phase).toBe('rest');
    expect(leapFrame(LEAP_CYCLE + 0.01).phase).toBe('crouch');
    expect(leapFrame(LEAP_CYCLE + AIR_START + 0.05)).toEqual(leapFrame(AIR_START + 0.05));
  });

  it('pauses between hops: a rest at least as long as the crouch', () => {
    expect(LEAP.rest).toBeGreaterThanOrEqual(LEAP.crouch);
    expect(LEAP.rest + LEAP.crouch + LEAP.land).toBeGreaterThan(LEAP.air * 0.5);
  });

  it('stays on the ground and in place outside the air phase', () => {
    for (const t of [0, AIR_START - 0.01]) {
      expect(leapFrame(t)).toMatchObject({ lift: 0, travel: 0 });
    }
    for (const t of [AIR_END + 0.01, LAND_END + 0.01, LEAP_CYCLE - 0.01]) {
      expect(leapFrame(t)).toMatchObject({ lift: 0, travel: 1 });
    }
  });

  it('travels forward monotonically through the air', () => {
    let last = 0;
    for (let i = 0; i <= 20; i++) {
      const f = leapFrame(AIR_START + (LEAP.air * i) / 20 - 1e-9 * (i === 20 ? 1 : 0));
      expect(f.travel).toBeGreaterThanOrEqual(last);
      last = f.travel;
    }
    expect(last).toBeGreaterThan(0.95);
  });

  it('draws an arc that peaks mid-air at the leap height, in whole art pixels', () => {
    const mid = leapFrame(AIR_START + LEAP.air / 2);
    expect(mid.lift).toBe(LEAP.height);
    const early = leapFrame(AIR_START + LEAP.air * 0.15).lift;
    const late = leapFrame(AIR_START + LEAP.air * 0.85).lift;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(mid.lift);
    expect(late).toBe(early);
    for (let i = 0; i <= 40; i++) {
      expect(leapFrame((LEAP_CYCLE * i) / 40).lift % ART_PX).toBe(0);
    }
  });

  it('squashes on take-off and landing and stretches in the air', () => {
    expect(leapFrame(0.01).pose).toBe('crouch');
    expect(leapFrame(AIR_START + LEAP.air / 2).pose).toBe('leap');
    expect(leapFrame(AIR_END + 0.01).pose).toBe('crouch');
    expect(leapFrame(LAND_END + 0.01).pose).toBe('walk');
  });
});

describe('LeapTracker: hops over the unchanged gameplay position', () => {
  const DT = 1 / 60;

  function run(tracker: LeapTracker, from: number, speed: number, seconds: number) {
    const out: Array<{ live: number; x: number; lift: number }> = [];
    let x = from;
    for (let t = 0; t < seconds; t += DT) {
      x += speed * DT;
      const d = tracker.step(1, x, 5, DT);
      out.push({ live: x, x: d.x, lift: d.lift });
    }
    return out;
  }

  it('keeps a standing leaper planted with no lift', () => {
    const tracker = new LeapTracker();
    for (let i = 0; i < 120; i++) {
      const d = tracker.step(7, 3, 4, DT);
      expect(d).toMatchObject({ x: 3, y: 4, lift: 0, pose: 'walk' });
    }
  });

  it('turns steady walking into hops with planted pauses in between', () => {
    const frames = run(new LeapTracker(), 0, 1.2, 4);
    const airborne = frames.filter(f => f.lift > 0).length;
    expect(airborne).toBeGreaterThan(0);
    expect(airborne).toBeLessThan(frames.length);
    // Planted frames: the drawn position does not move while the live one does
    let planted = 0;
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].lift === 0 && frames[i].x === frames[i - 1].x) planted++;
    }
    expect(planted).toBeGreaterThan(frames.length * 0.25);
    // Never runs ahead of the real position, never trails far behind
    for (const f of frames) {
      expect(f.x).toBeLessThanOrEqual(f.live + 1e-9);
      expect(f.live - f.x).toBeLessThan(2);
    }
  });

  it('lands on the real position at the end of each hop', () => {
    const tracker = new LeapTracker();
    let x = 0;
    let wasAir = false;
    let landings = 0;
    for (let t = 0; t < 4; t += DT) {
      x += 1.2 * DT;
      const d = tracker.step(1, x, 0, DT);
      if (wasAir && d.lift === 0 && d.pose === 'crouch') {
        expect(Math.abs(d.x - x)).toBeLessThan(1e-9);
        landings++;
      }
      wasAir = d.pose === 'leap';
    }
    expect(landings).toBeGreaterThan(1);
  });

  it('snaps to a teleported position and forgets dropped entities', () => {
    const tracker = new LeapTracker();
    tracker.step(2, 0, 0, DT);
    expect(tracker.step(2, 40, 40, DT)).toMatchObject({ x: 40, y: 40, lift: 0 });
    tracker.retain(new Set());
    expect(tracker.size).toBe(0);
  });
});
