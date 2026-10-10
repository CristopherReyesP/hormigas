/**
 * Touch gestures on the game canvas, told apart from the raw pointers:
 * a tap, a long press, a one-finger drag and a two-finger pinch. Pure logic
 * (no DOM): the InputManager feeds it pointer positions in CSS px and a clock,
 * and decides what each gesture does (select, order, pan, box, paint, zoom).
 *
 * One finger: still and short → tap on release; still for LONG_PRESS_MS →
 * long press (fired by tick(), once); moved past TOUCH_SLOP_PX → drag.
 * A second finger at any point turns the press into a pinch (a drag in
 * progress is cancelled first). After a pinch nothing fires until every
 * finger is up, so the finger lifted last never taps or drags.
 */

/** CSS px a finger may wander before a press becomes a drag; fingers jitter more than a mouse. */
export const TOUCH_SLOP_PX = 10;
/** A finger held still this long is a long press, not a tap. */
export const LONG_PRESS_MS = 500;

export type TouchUpdate =
  | { kind: 'none' }
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'long-press'; x: number; y: number }
  | { kind: 'drag-start'; startX: number; startY: number; x: number; y: number }
  | { kind: 'drag'; x: number; y: number; dx: number; dy: number }
  | { kind: 'drag-end'; x: number; y: number }
  | { kind: 'drag-cancel' }
  | { kind: 'pinch-start'; centerX: number; centerY: number }
  | { kind: 'pinch'; centerX: number; centerY: number; scale: number; dx: number; dy: number }
  | { kind: 'pinch-end' };

type Phase = 'idle' | 'pressed' | 'dragging' | 'spent' | 'pinching';

interface Finger {
  x: number;
  y: number;
}

const NONE: TouchUpdate = { kind: 'none' };

export class TouchTracker {
  private phase: Phase = 'idle';
  private fingers = new Map<number, Finger>();
  /** The finger that started the gesture */
  private primary = -1;
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  /** Last reported drag point */
  private lastX = 0;
  private lastY = 0;
  /** The two pinching fingers, the spread when the pinch began and the last center */
  private pinchIds: [number, number] = [-1, -1];
  private pinchStartDist = 1;
  private pinchCenter = { x: 0, y: 0 };

  isIdle(): boolean {
    return this.phase === 'idle';
  }

  /** True once a drag started, until the finger lifts. */
  isDragging(): boolean {
    return this.phase === 'dragging';
  }

  down(id: number, x: number, y: number, timeMs: number): TouchUpdate {
    if (this.fingers.has(id)) return NONE;
    if (this.phase === 'idle') {
      this.fingers.set(id, { x, y });
      this.phase = 'pressed';
      this.primary = id;
      this.startX = x;
      this.startY = y;
      this.lastX = x;
      this.lastY = y;
      this.startTime = timeMs;
      return NONE;
    }
    if (this.phase === 'pinching' || this.fingers.size >= 2) return NONE; // a third finger is ignored
    this.fingers.set(id, { x, y });
    const wasDragging = this.phase === 'dragging';
    this.startPinch();
    // The drag gives way first; the pinch starts with the next move
    if (wasDragging) return { kind: 'drag-cancel' };
    return { kind: 'pinch-start', centerX: this.pinchCenter.x, centerY: this.pinchCenter.y };
  }

  move(id: number, x: number, y: number, _timeMs: number): TouchUpdate {
    const finger = this.fingers.get(id);
    if (!finger) return NONE;
    finger.x = x;
    finger.y = y;
    if (this.phase === 'pinching') return this.pinchUpdate();
    if (id !== this.primary) return NONE;
    if (this.phase === 'pressed') {
      if (Math.hypot(x - this.startX, y - this.startY) <= TOUCH_SLOP_PX) return NONE;
      this.phase = 'dragging';
      this.lastX = x;
      this.lastY = y;
      return { kind: 'drag-start', startX: this.startX, startY: this.startY, x, y };
    }
    if (this.phase === 'dragging') {
      const dx = x - this.lastX;
      const dy = y - this.lastY;
      this.lastX = x;
      this.lastY = y;
      return { kind: 'drag', x, y, dx, dy };
    }
    return NONE;
  }

  up(id: number, x: number, y: number, timeMs: number): TouchUpdate {
    if (!this.fingers.has(id)) return NONE;
    this.move(id, x, y, timeMs);
    this.fingers.delete(id);
    const phase = this.phase;
    const primary = this.primary;
    if (this.fingers.size === 0) this.reset();
    else if (phase === 'pinching') this.phase = 'spent';

    if (phase === 'pinching') return { kind: 'pinch-end' };
    if (id !== primary) return NONE;
    if (phase === 'dragging') return { kind: 'drag-end', x, y };
    if (phase === 'pressed' && timeMs - this.startTime < LONG_PRESS_MS) return { kind: 'tap', x: this.startX, y: this.startY };
    return NONE;
  }

  /** The browser took the touch (scroll, system gesture): end it without a tap. */
  cancel(id: number): TouchUpdate {
    if (!this.fingers.has(id)) return NONE;
    this.fingers.delete(id);
    const phase = this.phase;
    if (this.fingers.size === 0) this.reset();
    else this.phase = 'spent';
    if (phase === 'dragging') return { kind: 'drag-cancel' };
    if (phase === 'pinching') return { kind: 'pinch-end' };
    return NONE;
  }

  /** Drop everything (focus lost); a drag in progress is cancelled. */
  cancelAll(): TouchUpdate {
    const phase = this.phase;
    this.fingers.clear();
    this.reset();
    if (phase === 'dragging') return { kind: 'drag-cancel' };
    if (phase === 'pinching') return { kind: 'pinch-end' };
    return NONE;
  }

  /** Call on a timer while a finger is down: fires the long press once. */
  tick(timeMs: number): TouchUpdate {
    if (this.phase !== 'pressed' || timeMs - this.startTime < LONG_PRESS_MS) return NONE;
    this.phase = 'spent';
    return { kind: 'long-press', x: this.startX, y: this.startY };
  }

  private reset(): void {
    this.phase = 'idle';
    this.primary = -1;
  }

  private startPinch(): void {
    const ids = [...this.fingers.keys()].slice(0, 2) as [number, number];
    this.pinchIds = ids;
    this.phase = 'pinching';
    const [a, b] = ids.map((i) => this.fingers.get(i)!);
    this.pinchStartDist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    this.pinchCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private pinchUpdate(): TouchUpdate {
    const a = this.fingers.get(this.pinchIds[0]);
    const b = this.fingers.get(this.pinchIds[1]);
    if (!a || !b) return NONE;
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = center.x - this.pinchCenter.x;
    const dy = center.y - this.pinchCenter.y;
    this.pinchCenter = center;
    return {
      kind: 'pinch',
      centerX: center.x,
      centerY: center.y,
      scale: Math.hypot(b.x - a.x, b.y - a.y) / this.pinchStartDist,
      dx,
      dy,
    };
  }
}
