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
