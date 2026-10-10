import { describe, expect, it } from 'vitest';
import { LONG_PRESS_MS, TOUCH_SLOP_PX, TouchTracker, type TouchUpdate } from './touchGesture';

/** Kinds of the updates a sequence produced, `none` left out. */
function kinds(updates: TouchUpdate[]): string[] {
  return updates.map((u) => u.kind).filter((k) => k !== 'none');
}

describe('one finger', () => {
  it('a short press that barely moves is a tap, at the press point', () => {
    const t = new TouchTracker();
    const out = [t.down(1, 100, 100, 0), t.move(1, 100 + TOUCH_SLOP_PX - 1, 101, 80), t.up(1, 103, 101, 150)];
    expect(kinds(out)).toEqual(['tap']);
    expect(out[2]).toMatchObject({ kind: 'tap', x: 100, y: 100 });
  });

  it('moving past the slop starts a drag from the press point, then reports each step', () => {
    const t = new TouchTracker();
    t.down(1, 100, 100, 0);
    const start = t.move(1, 100 + TOUCH_SLOP_PX + 1, 100, 50);
    expect(start).toMatchObject({ kind: 'drag-start', startX: 100, startY: 100, x: 100 + TOUCH_SLOP_PX + 1, y: 100 });
    expect(t.move(1, 130, 110, 70)).toMatchObject({ kind: 'drag', x: 130, y: 110, dx: 130 - (100 + TOUCH_SLOP_PX + 1), dy: 10 });
    expect(t.up(1, 130, 110, 90)).toMatchObject({ kind: 'drag-end', x: 130, y: 110 });
  });

  it('a drag never turns back into a tap, even if the finger returns home', () => {
    const t = new TouchTracker();
    t.down(1, 0, 0, 0);
    t.move(1, 40, 0, 20);
    t.move(1, 0, 0, 40);
    expect(t.up(1, 0, 0, 60).kind).toBe('drag-end');
  });

  it('holding still for LONG_PRESS_MS fires a long press once, and the release is no tap', () => {
    const t = new TouchTracker();
    t.down(1, 50, 60, 1000);
    expect(t.tick(1000 + LONG_PRESS_MS - 1).kind).toBe('none');
    expect(t.tick(1000 + LONG_PRESS_MS)).toMatchObject({ kind: 'long-press', x: 50, y: 60 });
    expect(t.tick(1000 + LONG_PRESS_MS + 100).kind).toBe('none');
    expect(t.up(1, 50, 60, 1000 + LONG_PRESS_MS + 200).kind).toBe('none');
  });

  it('a press released late without a tick is still no tap', () => {
    const t = new TouchTracker();
    t.down(1, 50, 60, 0);
    expect(t.up(1, 50, 60, LONG_PRESS_MS + 10).kind).toBe('none');
  });

  it('a finger that moved away never long-presses', () => {
    const t = new TouchTracker();
    t.down(1, 0, 0, 0);
    t.move(1, TOUCH_SLOP_PX + 5, 0, 100);
    expect(t.tick(LONG_PRESS_MS + 50).kind).toBe('none');
  });

  it('a cancelled touch (the browser took it) ends a drag without a tap', () => {
    const t = new TouchTracker();
    t.down(1, 0, 0, 0);
    t.move(1, 30, 0, 10);
    expect(t.cancel(1).kind).toBe('drag-cancel');
    expect(t.isIdle()).toBe(true);
  });
});

describe('two fingers', () => {
  it('a second finger turns the press into a pinch: no tap, scale from the spread, center moves', () => {
    const t = new TouchTracker();
    t.down(1, 100, 100, 0);
    expect(t.down(2, 200, 100, 30)).toMatchObject({ kind: 'pinch-start', centerX: 150, centerY: 100 });
    // Spread the fingers to twice the distance, shifting the center by 10 px
    const pinch = t.move(2, 310, 110, 60);
    expect(pinch.kind).toBe('pinch');
    if (pinch.kind !== 'pinch') return;
    expect(pinch.scale).toBeCloseTo(Math.hypot(210, 10) / 100, 5);
    expect(pinch.centerX).toBeCloseTo(205);
    expect(pinch.dx).toBeCloseTo(55);
    expect(pinch.dy).toBeCloseTo(5);
    expect(t.up(2, 310, 110, 90).kind).toBe('pinch-end');
    // The finger left behind does nothing: no tap, no drag
    expect(t.move(1, 160, 160, 100).kind).toBe('none');
    expect(t.up(1, 160, 160, 120).kind).toBe('none');
    expect(t.isIdle()).toBe(true);
  });

  it('a second finger during a drag cancels the drag first', () => {
    const t = new TouchTracker();
    t.down(1, 0, 0, 0);
    t.move(1, 40, 0, 10);
    const out = t.down(2, 100, 0, 20);
    expect(out.kind).toBe('drag-cancel');
    expect(t.move(2, 140, 0, 30).kind).toBe('pinch');
  });

  it('pinch scale is relative to the spread when the pinch began', () => {
    const t = new TouchTracker();
    t.down(1, 0, 0, 0);
    t.down(2, 100, 0, 0);
    const closer = t.move(2, 50, 0, 10);
    expect(closer.kind === 'pinch' && closer.scale).toBeCloseTo(0.5);
  });

  it('a third finger is ignored', () => {
    const t = new TouchTracker();
    t.down(1, 0, 0, 0);
    t.down(2, 100, 0, 0);
    expect(t.down(3, 50, 50, 5).kind).toBe('none');
    expect(t.move(3, 90, 90, 6).kind).toBe('none');
  });
});
