import type { Camera } from '../camera/Camera';

export type KeyHandler = () => void;

export class InputManager {
  private keysDown: Set<string> = new Set();
  private keyHandlers: Map<string, KeyHandler> = new Map();
  private clickHandlers: Array<(screenX: number, screenY: number) => void> = [];
  private canvas: HTMLCanvasElement;

  // Right-click drag state
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private camera: Camera | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('click', this.onClick);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
  }

  onKeyAction(key: string, handler: KeyHandler): void {
    this.keyHandlers.set(key, handler);
  }

  onCanvasClick(handler: (screenX: number, screenY: number) => void): void {
    this.clickHandlers.push(handler);
  }

  isKeyDown(key: string): boolean {
    return this.keysDown.has(key);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('wheel', this.onWheel);
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
      handler();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    // Right-click drag = pan (use CSS deltas, then convert)
    if (this.isPanning && this.camera) {
      const cssDx = e.clientX - this.panStartX;
      const cssDy = e.clientY - this.panStartY;
      const { dx, dy } = this.cssDeltaToCanvas(cssDx, cssDy);
      this.camera.pan(dx, dy);
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
    }
  };

  private onMouseDown = (e: MouseEvent): void => {
    // Right-click (button 2) or middle-click (button 1) = start panning
    if (e.button === 2 || e.button === 1) {
      this.isPanning = true;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 2 || e.button === 1) {
      this.isPanning = false;
      this.canvas.style.cursor = 'crosshair';
    }
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault(); // Prevent right-click menu
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (!this.camera) return;

    const pos = this.cssToCanvas(e);
    this.camera.zoomAt(pos.x, pos.y, e.deltaY);
  };

  private onClick = (e: MouseEvent): void => {
    // Only handle left click (button 0)
    if (e.button !== 0) return;

    const pos = this.cssToCanvas(e);

    for (const handler of this.clickHandlers) {
      handler(pos.x, pos.y);
    }
  };
}
