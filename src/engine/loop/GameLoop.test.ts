import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameLoop } from './GameLoop';

describe('GameLoop', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a frame stamped before start() is not a negative step back in time', () => {
    // requestAnimationFrame stamps a frame with when it began, which can be
    // before start() read performance.now() (a run built during a long task,
    // like loading a save): render time must never run backwards
    let frame: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frame = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const now = vi.spyOn(performance, 'now').mockReturnValue(10_000);
    const renders: number[] = [];
    const updates: number[] = [];
    const loop = new GameLoop((dt) => updates.push(dt), (_i, dt) => renders.push(dt));
    loop.start();
    frame!(9_400);
    expect(renders.at(-1)).toBe(0);
    expect(updates).toHaveLength(0);
    frame!(9_400 + 1000 / 60);
    expect(renders.at(-1)).toBeGreaterThan(0);
    loop.stop();
    now.mockRestore();
  });
});
