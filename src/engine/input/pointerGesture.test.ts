import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD_PX, PointerGesture, TAP_MAX_MS } from './pointerGesture';

function gesture(button: number, path: Array<[number, number]>, durationMs: number) {
  const g = new PointerGesture(button, path[0][0], path[0][1], 1000);
  for (const [x, y] of path.slice(1)) g.move(x, y);
  const [ex, ey] = path[path.length - 1];
  return { g, kind: g.end(ex, ey, 1000 + durationMs) };
}

describe('pointer gestures', () => {
  it('a left press that barely moves is a click', () => {
    expect(gesture(0, [[100, 100], [102, 101]], 120).kind).toBe('click');
  });

  it('a left drag past the threshold is a selection box, and stays one', () => {
    const { g, kind } = gesture(0, [[100, 100], [100 + DRAG_THRESHOLD_PX + 1, 100], [101, 100]], 400);
    expect(kind).toBe('box');
    expect(g.dragging).toBe(true);
  });

  it('a quick right tap is a command; a right drag pans', () => {
    expect(gesture(2, [[50, 50], [51, 52]], 90).kind).toBe('command');
    expect(gesture(2, [[50, 50], [50, 50 + DRAG_THRESHOLD_PX + 2]], 90).kind).toBe('pan');
  });

  it('a long right press without moving does nothing', () => {
    expect(gesture(2, [[50, 50]], TAP_MAX_MS + 50).kind).toBe('none');
  });

  it('the middle button only pans', () => {
    expect(gesture(1, [[50, 50]], 50).kind).toBe('none');
    expect(gesture(1, [[50, 50], [90, 50]], 50).kind).toBe('pan');
  });

  it('reports the threshold crossing once, so a pan can start there', () => {
    const g = new PointerGesture(2, 0, 0, 0);
    expect(g.move(3, 0)).toBe(false);
    expect(g.move(DRAG_THRESHOLD_PX + 1, 0)).toBe(true);
    expect(g.move(DRAG_THRESHOLD_PX + 5, 0)).toBe(false);
  });
});
