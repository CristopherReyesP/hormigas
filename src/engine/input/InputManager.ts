import type { Camera } from '../camera/Camera';
import { PointerGesture } from './pointerGesture';
import { TouchTracker, type TouchUpdate } from './touchGesture';

/** Modifier keys held during an input event; Cmd counts as Ctrl on macOS. */
export interface InputModifiers {
  shift: boolean;
  ctrl: boolean;
}

/** Rectangle in canvas px, normalized so x0 <= x1 and y0 <= y1. */
export interface ScreenBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A key press: its modifiers, and whether the OS is auto-repeating a held key. */
export interface KeyPress extends InputModifiers {
  repeat: boolean;
}

export type KeyHandler = (press: KeyPress) => void;
export type PointHandler = (screenX: number, screenY: number, mods: InputModifiers) => void;

/** What a one-finger drag does: move the camera, draw a selection box, or paint build tiles. */
export type TouchDragMode = 'pan' | 'box' | 'paint';
export type PaintPhase = 'start' | 'move' | 'end';

/** Pointer gestures beyond the plain click, wired at construction. */
export interface PointerHandlers {
  /** Left button released after a drag (or a finger drag in box mode): the selection box */
  onSelectBox?: (box: ScreenBox, mods: InputModifiers) => void;
  /** Right button tapped (short press, little movement): an order */
  onCommand?: PointHandler;
  /** A finger tap. Without it a tap counts as a left click. */
  onTap?: (screenX: number, screenY: number) => void;
  /** A finger held still (LONG_PRESS_MS) */
  onLongPress?: (screenX: number, screenY: number) => void;
  /** Finger drag in paint mode: the stroke, from the press point */
  onPaint?: (screenX: number, screenY: number, phase: PaintPhase) => void;
  /** Asked when a finger drag starts; 'pan' when absent */
  touchDragMode?: () => TouchDragMode;
  /** The mouse moved over the canvas with no button held (canvas px): hover feedback */
  onHover?: (screenX: number, screenY: number) => void;
}

const NO_MODS: InputModifiers = { shift: false, ctrl: false };

/** How often a held finger is checked for a long press. */
const LONG_PRESS_POLL_MS = 50;

function modifiersOf(e: MouseEvent | KeyboardEvent): InputModifiers {
  return { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
}

/** PointerEvent.buttons bit of a PointerEvent.button (left 1, right 2, middle 4). */
function buttonBit(button: number): number {
  return button === 0 ? 1 : button === 1 ? 4 : button === 2 ? 2 : 1 << button;
}

/**
 * Pointer and keyboard input for the canvas, on Pointer Events so mouse and
 * touch share one path.
 * Mouse, StarCraft style: left click selects, left drag draws a selection
 * box, a right tap gives an order, and a right or middle drag pans.
 * Touch: a tap (the game decides: select or order), a long press, a
 * one-finger drag that pans, boxes or paints (touchDragMode), and a
 * two-finger pinch that zooms on the 0.5 grid and pans with the fingers.
 * Nothing here runs while a cinematic directs the camera.
 */
export class InputManager {
  private keysDown: Set<string> = new Set();
  private keyHandlers: Map<string, KeyHandler> = new Map();
  private clickHandlers: PointHandler[] = [];
  private canvas: HTMLCanvasElement;
  private handlers: PointerHandlers;
  private camera: Camera | null = null;

  /** The mouse press in progress (one button at a time) */
  private gesture: PointerGesture | null = null;
  /** Canvas px of the mouse over the canvas (build-tool ghosts), null once it leaves */
  private hoverAt: { x: number; y: number } | null = null;
  /** Canvas px where the press started and where the pointer is now */
  private pressAt = { x: 0, y: 0 };
  private pointerAt = { x: 0, y: 0 };
  /** Client px of the last pan step */
  private panFromX = 0;
  private panFromY = 0;

  /** Fingers on the canvas */
  private touch = new TouchTracker();
  /** What the current finger drag does, from its start */
  private touchDrag: TouchDragMode | null = null;
  /** Camera zoom when the pinch began; pinch scale multiplies it */
  private pinchZoom: number | null = null;
  private longPressTimer: ReturnType<typeof setInterval> | null = null;

  constructor(canvas: HTMLCanvasElement, handlers: PointerHandlers = {}) {
    this.canvas = canvas;
    this.handlers = handlers;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    // Move/up live on the window so a drag keeps going over the HUD
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    // A left drag that wanders over the HUD must not select its text
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
  }

  /**
   * Run `handler` on a key press. `key` is a KeyboardEvent.code ("Digit1",
   * "Space"), or a printed character ("+") used when no code is bound: that
   * one works wherever the layout puts the key, numpad included.
   */
  onKeyAction(key: string, handler: KeyHandler): void {
    this.keyHandlers.set(key, handler);
  }

  /** Left click that did not turn into a drag. */
  onCanvasClick(handler: PointHandler): void {
    this.clickHandlers.push(handler);
  }

  isKeyDown(key: string): boolean {
    return this.keysDown.has(key);
  }

  /** Where the mouse rests over the canvas (canvas px), or null when it is elsewhere or not a mouse. */
  getHoverPoint(): { x: number; y: number } | null {
    return this.hoverAt;
  }

  /** The selection box being dragged right now (canvas px), or null. */
  getDragBox(): ScreenBox | null {
    if (this.touchDrag === 'box') return this.normalizedBox();
    if (!this.gesture || this.gesture.button !== 0 || !this.gesture.dragging) return null;
    return this.normalizedBox();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.stopLongPressTimer();
  }

  private isDirected(): boolean {
    return this.camera?.isDirected() ?? false;
  }

  private normalizedBox(): ScreenBox {
    return {
      x0: Math.min(this.pressAt.x, this.pointerAt.x),
      y0: Math.min(this.pressAt.y, this.pointerAt.y),
      x1: Math.max(this.pressAt.x, this.pointerAt.x),
      y1: Math.max(this.pressAt.y, this.pointerAt.y),
    };
  }

  /** Convert a CSS (client) position to canvas coordinate space */
  private clientToCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  private cssToCanvas(e: MouseEvent): { x: number; y: number } {
    return this.clientToCanvas(e.clientX, e.clientY);
  }

  /** Convert a CSS pixel delta to canvas coordinate delta */
  private cssDeltaToCanvas(cssDx: number, cssDy: number): { dx: number; dy: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      dx: cssDx * scaleX,
      dy: cssDy * scaleY,
    };
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keysDown.add(e.code);
    const handler = this.keyHandlers.get(e.code) ?? this.keyHandlers.get(e.key);
    if (handler) {
      // Also keeps Ctrl+digit (a control group) from switching browser tabs
      e.preventDefault();
      handler({ ...modifiersOf(e), repeat: e.repeat });
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  // ── Pointer dispatch ────────────────────────────────────────

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') this.mouseDown(e);
    else this.touchDown(e);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') {
      this.hoverAt = e.target === this.canvas ? this.cssToCanvas(e) : null;
      this.mouseMove(e);
    }
    else this.applyTouch(this.touch.move(e.pointerId, e.clientX, e.clientY, performance.now()));
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') this.mouseUp(e, e.button);
    else this.touchUp(e);
  };

  private onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') {
      this.dropMouseGesture();
      return;
    }
    this.applyTouch(this.touch.cancel(e.pointerId));
    if (this.touch.isIdle()) this.stopLongPressTimer();
  };

  // ── Mouse ───────────────────────────────────────────────────

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0 && !this.isDirected()) e.preventDefault();
  };

  private mouseDown(e: PointerEvent): void {
    if (this.gesture || this.isDirected()) return;
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    this.gesture = new PointerGesture(e.button, e.clientX, e.clientY, performance.now());
    this.pressAt = this.cssToCanvas(e);
    this.pointerAt = this.pressAt;
    this.panFromX = e.clientX;
    this.panFromY = e.clientY;
  }

  private mouseMove(e: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture) {
      if (this.handlers.onHover && e.target === this.canvas && !this.isDirected()) {
        const at = this.cssToCanvas(e);
        this.handlers.onHover(at.x, at.y);
      }
      return;
    }
    // A chorded release (another button still held) arrives as a move, not an up
    if ((e.buttons & buttonBit(gesture.button)) === 0) {
      this.mouseUp(e, gesture.button);
      return;
    }
    gesture.move(e.clientX, e.clientY);
    if (gesture.button === 0) {
      this.pointerAt = this.cssToCanvas(e);
      return;
    }
    // Right/middle: pan once past the threshold, catching up the first few px
    if (!gesture.dragging || !this.camera) return;
    const { dx, dy } = this.cssDeltaToCanvas(e.clientX - this.panFromX, e.clientY - this.panFromY);
    this.camera.pan(dx, dy);
    this.panFromX = e.clientX;
    this.panFromY = e.clientY;
    this.canvas.style.cursor = 'grabbing';
  }

  private mouseUp(e: PointerEvent, button: number): void {
    const gesture = this.gesture;
    if (!gesture || button !== gesture.button) return;
    this.gesture = null;
    this.canvas.style.cursor = 'crosshair';
    this.pointerAt = this.cssToCanvas(e);
    const kind = gesture.end(e.clientX, e.clientY, performance.now());
    if (this.isDirected()) return;
    const mods = modifiersOf(e);

    if (kind === 'click') {
      for (const handler of this.clickHandlers) handler(this.pressAt.x, this.pressAt.y, mods);
    } else if (kind === 'box') {
      this.handlers.onSelectBox?.(this.normalizedBox(), mods);
    } else if (kind === 'command') {
      this.handlers.onCommand?.(this.pressAt.x, this.pressAt.y, mods);
    }
  }

  private dropMouseGesture(): void {
    this.gesture = null;
    this.canvas.style.cursor = 'crosshair';
  }

  // ── Touch (and pen) ─────────────────────────────────────────

  private touchDown(e: PointerEvent): void {
    if (this.isDirected()) return;
    e.preventDefault();
    const update = this.touch.down(e.pointerId, e.clientX, e.clientY, performance.now());
    this.applyTouch(update);
    if (!this.touch.isIdle()) this.startLongPressTimer();
  }

  private touchUp(e: PointerEvent): void {
    this.applyTouch(this.touch.up(e.pointerId, e.clientX, e.clientY, performance.now()));
    if (this.touch.isIdle()) this.stopLongPressTimer();
  }

  private startLongPressTimer(): void {
    if (this.longPressTimer !== null) return;
    this.longPressTimer = setInterval(() => {
      this.applyTouch(this.touch.tick(performance.now()));
      if (this.touch.isIdle()) this.stopLongPressTimer();
    }, LONG_PRESS_POLL_MS);
  }

  private stopLongPressTimer(): void {
    if (this.longPressTimer === null) return;
    clearInterval(this.longPressTimer);
    this.longPressTimer = null;
  }

  /** Act on what the finger tracker made of the last pointer event (client px in, canvas px out). */
  private applyTouch(update: TouchUpdate): void {
    if (update.kind === 'none') return;
    if (this.isDirected()) {
      this.touchDrag = null;
      return;
    }
    switch (update.kind) {
      case 'tap': {
        const at = this.clientToCanvas(update.x, update.y);
        if (this.handlers.onTap) this.handlers.onTap(at.x, at.y);
        else for (const handler of this.clickHandlers) handler(at.x, at.y, NO_MODS);
        return;
      }
      case 'long-press': {
        const at = this.clientToCanvas(update.x, update.y);
        this.handlers.onLongPress?.(at.x, at.y);
        return;
      }
      case 'drag-start': {
        this.touchDrag = this.handlers.touchDragMode?.() ?? 'pan';
        this.pressAt = this.clientToCanvas(update.startX, update.startY);
        this.pointerAt = this.clientToCanvas(update.x, update.y);
        if (this.touchDrag === 'pan') {
          this.panBy(update.x - update.startX, update.y - update.startY);
        } else if (this.touchDrag === 'paint') {
          this.handlers.onPaint?.(this.pressAt.x, this.pressAt.y, 'start');
          this.handlers.onPaint?.(this.pointerAt.x, this.pointerAt.y, 'move');
        }
        return;
      }
      case 'drag': {
        this.pointerAt = this.clientToCanvas(update.x, update.y);
        if (this.touchDrag === 'pan') this.panBy(update.dx, update.dy);
        else if (this.touchDrag === 'paint') this.handlers.onPaint?.(this.pointerAt.x, this.pointerAt.y, 'move');
        return;
      }
      case 'drag-end': {
        this.pointerAt = this.clientToCanvas(update.x, update.y);
        const mode = this.touchDrag;
        this.touchDrag = null;
        if (mode === 'box') this.handlers.onSelectBox?.(this.normalizedBox(), NO_MODS);
        else if (mode === 'paint') this.handlers.onPaint?.(this.pointerAt.x, this.pointerAt.y, 'end');
        return;
      }
      case 'drag-cancel': {
        // A paint stroke keeps what it painted; a box is dropped
        if (this.touchDrag === 'paint') this.handlers.onPaint?.(this.pointerAt.x, this.pointerAt.y, 'end');
        this.touchDrag = null;
        return;
      }
      case 'pinch-start':
        this.pinchZoom = this.camera?.getZoom() ?? null;
        return;
      case 'pinch': {
        if (!this.camera) return;
        this.pinchZoom ??= this.camera.getZoom();
        this.panBy(update.dx, update.dy);
        const at = this.clientToCanvas(update.centerX, update.centerY);
        this.camera.zoomTo(at.x, at.y, this.pinchZoom * update.scale);
        return;
      }
      case 'pinch-end':
        this.pinchZoom = null;
        return;
    }
  }

  private panBy(cssDx: number, cssDy: number): void {
    if (!this.camera) return;
    const { dx, dy } = this.cssDeltaToCanvas(cssDx, cssDy);
    if (dx !== 0 || dy !== 0) this.camera.pan(dx, dy);
  }

  /** A release outside the window never arrives: drop the press on focus loss. */
  private onBlur = (): void => {
    this.dropMouseGesture();
    this.applyTouch(this.touch.cancelAll());
    this.stopLongPressTimer();
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault(); // Prevent right-click menu (and the long-press menu on touch)
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (!this.camera) return;

    // Line/page wheel modes (Firefox) report tiny numbers; the camera counts pixels
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    const pos = this.cssToCanvas(e);
    this.camera.zoomAt(pos.x, pos.y, e.deltaY * unit);
  };
}
