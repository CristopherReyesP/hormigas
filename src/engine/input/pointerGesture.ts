/**
 * Tells the mouse gestures apart from press to release, StarCraft style:
 * left click selects, left drag draws a selection box, a right tap gives an
 * order and a right (or middle) drag pans the camera.
 */

/** CSS px the pointer may wander before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 6;
/** A right press held longer than this is not a tap, even without moving. */
export const TAP_MAX_MS = 350;

export type GestureKind = 'click' | 'box' | 'command' | 'pan' | 'none';

export class PointerGesture {
  readonly button: number;
  readonly startX: number;
  readonly startY: number;
  private readonly startTime: number;
  /** True once the pointer moved past the threshold; it never goes back. */
  dragging = false;

  constructor(button: number, clientX: number, clientY: number, timeMs: number) {
    this.button = button;
    this.startX = clientX;
    this.startY = clientY;
    this.startTime = timeMs;
  }

  /** Track the pointer; true exactly once, on the move that crosses the threshold. */
  move(clientX: number, clientY: number): boolean {
    if (this.dragging) return false;
    if (Math.hypot(clientX - this.startX, clientY - this.startY) <= DRAG_THRESHOLD_PX) return false;
    this.dragging = true;
    return true;
  }

  /** What the press turned out to be, decided on release. */
  end(clientX: number, clientY: number, timeMs: number): GestureKind {
    this.move(clientX, clientY);
    if (this.button === 0) return this.dragging ? 'box' : 'click';
    if (this.dragging) return 'pan';
    if (this.button === 2 && timeMs - this.startTime <= TAP_MAX_MS) return 'command';
    return 'none';
  }
}
