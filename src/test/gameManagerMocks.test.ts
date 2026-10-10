import { describe, expect, it } from 'vitest';
import { fakeCanvas, mockInputManager, mockRenderSystem, tolerantClass } from './gameManagerMocks';

describe('the GameManager mock kit', () => {
  it('answers a method nobody declared with a recording no-op', () => {
    const { RenderSystem } = mockRenderSystem();
    const render = new RenderSystem('world', 'renderer');
    expect(() => render.someMethodAddedLater(1, 'two')).not.toThrow();
    expect(render.someMethodAddedLater(3)).toBeUndefined();
    expect(render.someMethodAddedLater).toHaveBeenCalledTimes(2);
    expect(render.someMethodAddedLater).toHaveBeenCalledWith(1, 'two');
  });

  it('runs the given methods with the instance as this', () => {
    const calls: unknown[] = [];
    const { InputManager } = mockInputManager({
      onKeyAction(key: string) { calls.push(key); },
      ping() { return this; },
    });
    const input = new InputManager();
    input.onKeyAction('Space');
    expect(calls).toEqual(['Space']);
    expect(input.ping()).toBe(input);
    expect(input.setCamera).not.toThrow();
  });

  it('keeps stubs per instance and never looks like a promise', () => {
    const Mock = tolerantClass();
    const a = new Mock();
    const b = new Mock();
    a.destroy();
    expect(a.destroy).toBe(a.destroy);
    expect(b.destroy).not.toHaveBeenCalled();
    expect((a as Record<string, unknown>).then).toBeUndefined();
  });

  it('builds a canvas the manager can listen on', () => {
    const canvas = fakeCanvas();
    expect(canvas.getContext('2d')).toEqual({});
    expect(typeof canvas.addEventListener).toBe('function');
  });
});
