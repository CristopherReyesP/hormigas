import { describe, expect, it } from 'vitest';
import { CanvasRenderer } from './CanvasRenderer';

/** A canvas whose size setters reset the context state, like a real one. */
function fakeCanvas() {
  const ctx = {
    canvas: null as unknown,
    imageSmoothingEnabled: true,
    fillStyle: '',
    fills: [] as number[][],
    fillRect(...a: number[]) { ctx.fills.push(a); },
  };
  let width = 300;
  let height = 150;
  let resets = 0;
  const canvas = {
    get width() { return width; },
    set width(v: number) { width = v; ctx.imageSmoothingEnabled = true; resets++; },
    get height() { return height; },
    set height(v: number) { height = v; ctx.imageSmoothingEnabled = true; resets++; },
    get resets() { return resets; },
    getContext: () => ctx,
  };
  ctx.canvas = canvas;
  return { canvas, ctx } as unknown as { canvas: HTMLCanvasElement & { resets: number }; ctx: typeof ctx };
}

describe('CanvasRenderer', () => {
  it('starts on the default 800×600 buffer until the window is measured', () => {
    const { canvas } = fakeCanvas();
    new CanvasRenderer(canvas);
    expect([canvas.width, canvas.height]).toEqual([800, 600]);
  });

  it('resizes the backing store and keeps pixel art crisp after the context reset', () => {
    const { canvas, ctx } = fakeCanvas();
    const renderer = new CanvasRenderer(canvas);
    renderer.resize(3200, 1800);
    expect([canvas.width, canvas.height]).toEqual([3200, 1800]);
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });

  it('does not touch the canvas when the size is unchanged (a resize clears it)', () => {
    const { canvas } = fakeCanvas();
    const renderer = new CanvasRenderer(canvas);
    renderer.resize(1600, 900);
    const resets = canvas.resets;
    renderer.resize(1600, 900);
    expect(canvas.resets).toBe(resets);
  });

  it('clears the whole canvas', () => {
    const { canvas, ctx } = fakeCanvas();
    const renderer = new CanvasRenderer(canvas);
    renderer.resize(2560, 1440);
    renderer.clear();
    expect(ctx.fills.at(-1)).toEqual([0, 0, 2560, 1440]);
  });
});
