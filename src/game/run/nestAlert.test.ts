import { describe, expect, it } from 'vitest';
import {
  NEST_ALERT_SECONDS,
  NEST_CLEAR_GRACE,
  NEST_REALERT_SECONDS,
  NestAlertTracker,
  nestAlertTitle,
  tabAlerts,
  type NestSample,
} from './nestAlert';

const QUIET: NestSample = { invaders: 0, surfaceInvaders: 0, fight: null, queen: { health: 100, max: 100, attacked: false }, eggsAttacked: false };
const sample = (over: Partial<NestSample> = {}): NestSample => ({ ...QUIET, ...over });

/** Feed the same sample for `seconds`, collecting the events */
function run(tracker: NestAlertTracker, seconds: number, s: NestSample, dt = 0.1): string[] {
  const events: string[] = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    const e = tracker.update(dt, s);
    if (e) events.push(e);
  }
  return events;
}

describe('NestAlertTracker', () => {
  it('stays silent while the nest is empty', () => {
    const tracker = new NestAlertTracker();
    expect(run(tracker, 30, QUIET)).toEqual([]);
    expect(tracker.getState()).toMatchObject({ nestInvaders: 0, alert: null, cleared: null });
  });

  it('raises the breach alert once when the first invader gets in, with the live count', () => {
    const tracker = new NestAlertTracker();
    const fight = { x: 40, y: 12 };
    expect(tracker.update(0.1, sample({ invaders: 1, fight }))).toBe('breach');
    const first = tracker.getState().alert!;
    expect(first).toMatchObject({ kind: 'breach', invaders: 1 });
    expect(nestAlertTitle(first)).toBe('¡Invasores en el nido! (1)');
    // More break in: no new alert, but the count follows
    expect(run(tracker, 5, sample({ invaders: 4, fight }))).toEqual([]);
    expect(tracker.getState().alert).toMatchObject({ id: first.id, kind: 'breach', invaders: 4 });
    expect(nestAlertTitle(tracker.getState().alert!)).toBe('¡Invasores en el nido! (4)');
    expect(tracker.getState().fight).toEqual(fight);
  });

  it('lets the banner go after a while, but keeps counting the invaders for the badge', () => {
    const tracker = new NestAlertTracker();
    run(tracker, NEST_ALERT_SECONDS + 1, sample({ invaders: 3 }));
    expect(tracker.getState().alert).toBeNull();
    expect(tracker.getState().nestInvaders).toBe(3);
  });

  it('re-alerts when the queen is attacked, at most once every 10 s', () => {
    const tracker = new NestAlertTracker();
    tracker.update(0.1, sample({ invaders: 2 }));
    const biting = sample({ invaders: 2, queen: { health: 80, max: 100, attacked: true } });
    // Right after the breach: throttled
    expect(run(tracker, NEST_REALERT_SECONDS - 1, biting)).toEqual([]);
    expect(run(tracker, 1.5, biting)).toEqual(['queen']);
    const alert = tracker.getState().alert!;
    expect(alert).toMatchObject({ kind: 'queen', queen: { health: 80, max: 100 }, critical: false });
    expect(nestAlertTitle(alert)).toBe('¡Atacan a la reina!');
    // Still biting: the next one only after another 10 s
    expect(run(tracker, NEST_REALERT_SECONDS - 0.6, biting)).toEqual([]);
    expect(run(tracker, 1, biting)).toEqual(['queen']);
  });

  it('turns the queen warning critical below half health', () => {
    const tracker = new NestAlertTracker();
    tracker.update(0.1, sample({ invaders: 2 }));
    run(tracker, NEST_REALERT_SECONDS + 0.5, sample({ invaders: 2, queen: { health: 45, max: 100, attacked: true } }));
    expect(tracker.getState().alert).toMatchObject({ kind: 'queen', critical: true, queen: { health: 45, max: 100 } });
  });

  it('re-alerts when the eggs are attacked', () => {
    const tracker = new NestAlertTracker();
    tracker.update(0.1, sample({ invaders: 1 }));
    expect(run(tracker, NEST_REALERT_SECONDS + 0.5, sample({ invaders: 1, eggsAttacked: true }))).toEqual(['eggs']);
    expect(nestAlertTitle(tracker.getState().alert!)).toBe('¡Atacan los huevos!');
  });

  it('announces the clear once the nest stays empty, then is ready for the next breach', () => {
    const tracker = new NestAlertTracker();
    tracker.update(0.1, sample({ invaders: 2 }));
    // A short gap (the next invader still coming through the tunnel) is not a clear
    expect(run(tracker, NEST_CLEAR_GRACE / 2, QUIET)).toEqual([]);
    expect(run(tracker, 0.5, sample({ invaders: 1 }))).toEqual([]);
    expect(run(tracker, NEST_CLEAR_GRACE + 0.2, QUIET)).toEqual(['cleared']);
    expect(tracker.getState()).toMatchObject({ nestInvaders: 0, alert: null, cleared: { id: expect.any(Number) } });
    run(tracker, 10, QUIET);
    expect(tracker.getState().cleared).toBeNull();
    expect(tracker.update(0.1, sample({ invaders: 1 }))).toBe('breach');
  });
});

describe('tabAlerts', () => {
  it('flags the NIDO tab with the count while invaders are inside and the player is on the surface', () => {
    expect(tabAlerts('surface', 4, 0)).toEqual({ underground: { count: 4, pulse: true }, surface: null });
  });

  it('keeps the NIDO count while looking at the nest, and flags SUPERFICIE when the surface is under attack', () => {
    expect(tabAlerts('underground', 4, 3)).toEqual({ underground: { count: 4, pulse: false }, surface: { count: 3, pulse: true } });
    expect(tabAlerts('underground', 0, 0)).toEqual({ underground: null, surface: null });
  });

  it('shows no surface badge while the player is already on the surface', () => {
    expect(tabAlerts('surface', 0, 5)).toEqual({ underground: null, surface: null });
  });
});
