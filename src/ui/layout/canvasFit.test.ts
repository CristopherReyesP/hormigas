import { describe, expect, it } from 'vitest';
import { fitCanvasToViewport, pickDefaultZoom, visibleCanvasRect } from './canvasFit';

describe('fitCanvasToViewport', () => {
  it('covers a 16:9 window with the 4:3 canvas at an exact integer scale', () => {
    expect(fitCanvasToViewport(1600, 900, 800, 600, 1)).toEqual({
      scale: 2, width: 1600, height: 1200, left: 0, top: -150,
    });
  });

  it('snaps to a whole number of device pixels when that crops only a little more', () => {
    const fit = fitCanvasToViewport(1512, 982, 800, 600, 2);
    expect(fit.scale).toBe(2);
    expect(fit.width).toBe(1600);
    expect(fit.left).toBe(-44);
    expect(fit.top).toBe(-109);
  });

  it('keeps the exact cover scale when an integer scale would crop too much', () => {
    const fit = fitCanvasToViewport(1920, 1080, 800, 600, 1);
    expect(fit.scale).toBeCloseTo(2.4);
    expect(fit.width).toBeCloseTo(1920);
    expect(fit.height).toBeCloseTo(1440);
    expect(fit.top).toBe(-180);
  });

  it('shows the canvas 1:1 when the window matches it', () => {
    expect(fitCanvasToViewport(800, 600, 800, 600, 1)).toEqual({
      scale: 1, width: 800, height: 600, left: 0, top: 0,
    });
  });

  it('falls back to 1:1 while the window has no size yet', () => {
    expect(fitCanvasToViewport(0, 0, 800, 600, 1).scale).toBe(1);
  });
});

describe('visibleCanvasRect', () => {
  it('is the part of the canvas between the top strip and the bottom console', () => {
    const fit = fitCanvasToViewport(1600, 900, 800, 600, 1);
    expect(visibleCanvasRect(fit, 1600, 900, { top: 28, bottom: 180 }, 800, 600)).toEqual({
      x: 0, y: 89, w: 800, h: 346,
    });
  });

  it('never extends outside the canvas', () => {
    const fit = fitCanvasToViewport(800, 600, 800, 600, 1);
    const rect = visibleCanvasRect(fit, 800, 600, { top: 0, bottom: 0 }, 800, 600);
    expect(rect).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  });

  it('keeps at least one pixel of view when the HUD covers the whole window', () => {
    const fit = fitCanvasToViewport(800, 150, 800, 600, 1);
    const rect = visibleCanvasRect(fit, 800, 150, { top: 28, bottom: 180 }, 800, 600);
    expect(rect.h).toBeGreaterThanOrEqual(1);
  });
});

describe('pickDefaultZoom', () => {
  it('picks the 0.5 step that keeps an ant closest to 32 screen pixels long', () => {
    expect(pickDefaultZoom(2)).toBe(0.5);
    expect(pickDefaultZoom(1.28)).toBe(0.5);
    expect(pickDefaultZoom(1)).toBe(1);
    expect(pickDefaultZoom(0.8)).toBe(1);
  });

  it('never goes below the minimum zoom on very large displays', () => {
    expect(pickDefaultZoom(3.2)).toBe(0.5);
  });
});
