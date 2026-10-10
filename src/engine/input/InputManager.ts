import type { Camera } from '../camera/Camera';
import { PointerGesture } from './pointerGesture';

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

export type KeyHandler = (mods: InputModifiers) => void;
export type PointHandler = (screenX: number, screenY: number, mods: InputModifiers) => void;

/** Pointer gestures beyond the plain click, wired at construction. */
export interface PointerHandlers {
  /** Left button released after a drag: the selection box */
  onSelectBox?: (box: ScreenBox, mods: InputModifiers) => void;
  /** Right button tapped (short press, little movement): an order */
  onCommand?: PointHandler;
}

function modifiersOf(e: MouseEvent | KeyboardEvent): InputModifiers {
  return { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
}

/**
 * Mouse and keyboard for the canvas, StarCraft style: left click selects,
 * left drag draws a selection box, a right tap gives an order, and a right or
 * middle drag pans. Nothing here runs while a cinematic directs the camera.
 */
export class InputManager {
  private keysDown: Set<string> = new Set();
  private keyHandlers: Map<string, KeyHandler> = new Map();
  private clickHandlers: PointHandler[] = [];
  private canvas: HTMLCanvasElement;
  private handlers: PointerHandlers;
  private camera: Camera | null = null;

  /** The press in progress (one button at a time) */
  private gesture: PointerGesture | null = null;
  /** Canvas px where the press started and where the pointer is now */
  private pressAt = { x: 0, y: 0 };
  private pointerAt = { x: 0, y: 0 };
  /** Client px of the last pan step */
  private panFromX = 0;
  private panFromY = 0;

  constructor(canvas: HTMLCanvasElement, handlers: PointerHandlers = {}) {
    this.canvas = canvas;
    this.handlers = handlers;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    // Move/up live on the window so a drag keeps going over the HUD
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
  }

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

  /** The selection box being dragged right now (canvas px), or null. */
  getDragBox(): ScreenBox | null {
    if (!this.gesture || this.gesture.button !== 0 || !this.gesture.dragging) return null;
    return this.normalizedBox();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('wheel', this.onWheel);
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

  /** Convert CSS mouse position to canvas coordinate space */
  private cssToCanvas(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
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
    const handler = this.keyHandlers.get(e.code);
    if (handler) {
      e.preventDefault();
      handler(modifiersOf(e));
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (this.gesture || this.isDirected()) return;
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    this.gesture = new PointerGesture(e.button, e.clientX, e.clientY, performance.now());
    this.pressAt = this.cssToCanvas(e);
    this.pointerAt = this.pressAt;
    this.panFromX = e.clientX;
    this.panFromY = e.clientY;
  };

  private onMouseMove = (e: MouseEvent): void => {
    const gesture = this.gesture;
    if (!gesture) return;
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
  };

  private onMouseUp = (e: MouseEvent): void => {
    const gesture = this.gesture;
    if (!gesture || e.button !== gesture.button) return;
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
  };

  /** A release outside the window never arrives: drop the press on focus loss. */
  private onBlur = (): void => {
    this.gesture = null;
    this.canvas.style.cursor = 'crosshair';
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault(); // Prevent right-click menu
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
