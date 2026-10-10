import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputManager, type KeyPress } from './InputManager';

// Node has no DOM: window and the canvas are bare event targets
let win: EventTarget;

function canvas(): HTMLCanvasElement {
  return Object.assign(new EventTarget(), { style: {}, width: 800, height: 600 }) as unknown as HTMLCanvasElement;
}

function keydown(init: { code: string; key: string; repeat?: boolean; ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean }): Event {
  const event = Object.assign(new Event('keydown', { cancelable: true }), { repeat: false, ctrlKey: false, shiftKey: false, metaKey: false, ...init });
  win.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  win = new EventTarget();
  vi.stubGlobal('window', win);
});

afterEach(() => vi.unstubAllGlobals());

describe('key actions', () => {
  it('hand the handler the modifiers and whether the key is auto-repeating', () => {
    const input = new InputManager(canvas());
    const presses: KeyPress[] = [];
    input.onKeyAction('Digit1', (press) => presses.push(press));
    keydown({ code: 'Digit1', key: '1', ctrlKey: true });
    keydown({ code: 'Digit1', key: '!', shiftKey: true, repeat: true });
    keydown({ code: 'Digit1', key: '1', metaKey: true });
    expect(presses).toEqual([
      { shift: false, ctrl: true, repeat: false },
      { shift: true, ctrl: false, repeat: true },
      { shift: false, ctrl: true, repeat: false },
    ]);
    input.destroy();
  });

  it('match a printed character when no key code is bound, so + works on any layout and the numpad', () => {
    const input = new InputManager(canvas());
    const plus = vi.fn();
    input.onKeyAction('+', plus);
    keydown({ code: 'BracketRight', key: '+' }); // Spanish layout
    keydown({ code: 'NumpadAdd', key: '+' });
    keydown({ code: 'Equal', key: '+', shiftKey: true }); // US layout
    expect(plus).toHaveBeenCalledTimes(3);
    expect(keydown({ code: 'NumpadAdd', key: '+' }).defaultPrevented).toBe(true);
    input.destroy();
  });

  it('a bound key code wins over the character it prints', () => {
    const input = new InputManager(canvas());
    const byCode = vi.fn();
    const byChar = vi.fn();
    input.onKeyAction('Digit2', byCode);
    input.onKeyAction('2', byChar);
    keydown({ code: 'Digit2', key: '2' });
    expect(byCode).toHaveBeenCalledTimes(1);
    expect(byChar).not.toHaveBeenCalled();
    input.destroy();
  });
});

// ── Pointer events: the mouse keeps its StarCraft gestures, touch gets its own ──

function pointerCanvas(): HTMLCanvasElement {
  return Object.assign(new EventTarget(), {
    style: {},
    width: 800,
    height: 600,
    // Shown at half size: canvas px are twice the CSS px
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
  }) as unknown as HTMLCanvasElement;
}

interface PointerInit {
  pointerId?: number;
  pointerType?: string;
  button?: number;
  buttons?: number;
  clientX: number;
  clientY: number;
}

function pointer(target: EventTarget, type: string, init: PointerInit): void {
  const event = Object.assign(new Event(type, { cancelable: true }), {
    pointerId: 1, pointerType: 'touch', button: 0, buttons: type === 'pointerup' ? 0 : 1,
    shiftKey: false, ctrlKey: false, metaKey: false, ...init,
  });
  target.dispatchEvent(event);
}

function fakeCamera() {
  let zoom = 2;
  return {
    pan: vi.fn(),
    zoomAt: vi.fn(),
    zoomTo: vi.fn((_x: number, _y: number, z: number) => { zoom = z; }),
    getZoom: () => zoom,
    isDirected: () => false,
  };
}

describe('touch on the canvas', () => {
  it('a tap reports the press point in canvas px, and is not a mouse click', () => {
    const c = pointerCanvas();
    const onTap = vi.fn();
    const input = new InputManager(c, { onTap });
    const click = vi.fn();
    input.onCanvasClick(click);
    pointer(c, 'pointerdown', { clientX: 50, clientY: 40 });
    pointer(win, 'pointerup', { clientX: 52, clientY: 41 });
    expect(onTap).toHaveBeenCalledWith(100, 80);
    expect(click).not.toHaveBeenCalled();
    input.destroy();
  });

  it('a one-finger drag pans the camera by the finger movement (canvas px)', () => {
    const c = pointerCanvas();
    const onTap = vi.fn();
    const input = new InputManager(c, { onTap, touchDragMode: () => 'pan' });
    const camera = fakeCamera();
    input.setCamera(camera as never);
    pointer(c, 'pointerdown', { clientX: 100, clientY: 100 });
    pointer(win, 'pointermove', { clientX: 130, clientY: 100 });
    pointer(win, 'pointermove', { clientX: 140, clientY: 90 });
    pointer(win, 'pointerup', { clientX: 140, clientY: 90 });
    const total = camera.pan.mock.calls.reduce((s, [dx, dy]) => [s[0] + dx, s[1] + dy], [0, 0]);
    expect(total).toEqual([80, -20]);
    expect(onTap).not.toHaveBeenCalled();
    input.destroy();
  });

  it('a drag in box mode draws a selection box, released as onSelectBox', () => {
    const c = pointerCanvas();
    const onSelectBox = vi.fn();
    const input = new InputManager(c, { onSelectBox, touchDragMode: () => 'box' });
    const camera = fakeCamera();
    input.setCamera(camera as never);
    pointer(c, 'pointerdown', { clientX: 10, clientY: 10 });
    pointer(win, 'pointermove', { clientX: 60, clientY: 40 });
    expect(input.getDragBox()).toEqual({ x0: 20, y0: 20, x1: 120, y1: 80 });
    pointer(win, 'pointerup', { clientX: 60, clientY: 40 });
    expect(onSelectBox).toHaveBeenCalledWith({ x0: 20, y0: 20, x1: 120, y1: 80 }, { shift: false, ctrl: false });
    expect(camera.pan).not.toHaveBeenCalled();
    expect(input.getDragBox()).toBeNull();
    input.destroy();
  });

  it('a drag in paint mode reports the stroke from the press point', () => {
    const c = pointerCanvas();
    const onPaint = vi.fn();
    const input = new InputManager(c, { onPaint, touchDragMode: () => 'paint' });
    pointer(c, 'pointerdown', { clientX: 10, clientY: 10 });
    pointer(win, 'pointermove', { clientX: 40, clientY: 10 });
    pointer(win, 'pointerup', { clientX: 40, clientY: 10 });
    expect(onPaint.mock.calls).toEqual([[20, 20, 'start'], [80, 20, 'move'], [80, 20, 'end']]);
    input.destroy();
  });

  it('a pinch zooms the camera on the 0.5 grid around the fingers', () => {
    const c = pointerCanvas();
    const input = new InputManager(c, {});
    const camera = fakeCamera();
    input.setCamera(camera as never);
    pointer(c, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    pointer(c, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 100 });
    // Twice the spread: zoom 2 → 4
    pointer(win, 'pointermove', { pointerId: 2, clientX: 300, clientY: 100 });
    expect(camera.zoomTo).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), 4);
    pointer(win, 'pointerup', { pointerId: 2, clientX: 300, clientY: 100 });
    pointer(win, 'pointerup', { pointerId: 1, clientX: 100, clientY: 100 });
    input.destroy();
  });
});

describe('the mouse through pointer events', () => {
  it('left click, left drag box and right tap work as before', () => {
    const c = pointerCanvas();
    const onSelectBox = vi.fn();
    const onCommand = vi.fn();
    const onTap = vi.fn();
    const input = new InputManager(c, { onSelectBox, onCommand, onTap });
    const click = vi.fn();
    input.onCanvasClick(click);
    const mouse = { pointerType: 'mouse' };
    pointer(c, 'pointerdown', { ...mouse, clientX: 10, clientY: 10 });
    pointer(win, 'pointerup', { ...mouse, clientX: 10, clientY: 10 });
    expect(click).toHaveBeenCalledWith(20, 20, { shift: false, ctrl: false });

    pointer(c, 'pointerdown', { ...mouse, clientX: 10, clientY: 10 });
    pointer(win, 'pointermove', { ...mouse, clientX: 50, clientY: 30 });
    pointer(win, 'pointerup', { ...mouse, clientX: 50, clientY: 30 });
    expect(onSelectBox).toHaveBeenCalledWith({ x0: 20, y0: 20, x1: 100, y1: 60 }, { shift: false, ctrl: false });

    pointer(c, 'pointerdown', { ...mouse, button: 2, buttons: 2, clientX: 30, clientY: 30 });
    pointer(win, 'pointerup', { ...mouse, button: 2, buttons: 0, clientX: 30, clientY: 30 });
    expect(onCommand).toHaveBeenCalledWith(60, 60, { shift: false, ctrl: false });
    expect(onTap).not.toHaveBeenCalled();
    input.destroy();
  });

  it('a right drag pans; releasing the right button while the left is held still ends it', () => {
    const c = pointerCanvas();
    const onCommand = vi.fn();
    const input = new InputManager(c, { onCommand });
    const camera = fakeCamera();
    input.setCamera(camera as never);
    const mouse = { pointerType: 'mouse' };
    pointer(c, 'pointerdown', { ...mouse, button: 2, buttons: 2, clientX: 10, clientY: 10 });
    pointer(win, 'pointermove', { ...mouse, button: -1, buttons: 2, clientX: 40, clientY: 10 });
    expect(camera.pan).toHaveBeenCalled();
    // Left pressed (a chord: only a pointermove), then right released (another pointermove)
    pointer(win, 'pointermove', { ...mouse, button: 0, buttons: 3, clientX: 40, clientY: 10 });
    pointer(win, 'pointermove', { ...mouse, button: 2, buttons: 1, clientX: 40, clientY: 10 });
    // The pan is over: a later move does not pan
    camera.pan.mockClear();
    pointer(win, 'pointermove', { ...mouse, button: -1, buttons: 1, clientX: 90, clientY: 10 });
    expect(camera.pan).not.toHaveBeenCalled();
    input.destroy();
  });
});
