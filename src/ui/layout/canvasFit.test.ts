import { describe, expect, it } from 'vitest';
import { ART_PX } from '../../engine/renderer/sprites/spriteScale';
import {
  ANT_WORLD_PX,
  MAX_PIXEL_RATIO,
  MIN_ANT_SCREEN_PX,
  REFERENCE_VIEW_WORLD_PX,
  canvasPixelRatio,
  fitCanvasToWindow,
  pickDefaultZoom,
  visibleCanvasRect,
} from './canvasFit';

describe('fitCanvasToWindow (the backing store is the real window size)', () => {
  it('matches the window 1:1 at DPR 1, with no CSS scaling or crop', () => {
    expect(fitCanvasToWindow(1600, 900, 1)).toEqual({
      backingWidth: 1600, backingHeight: 900, pixelRatio: 1, scale: 1, width: 1600, height: 900,
    });
  });

  it('holds devicePixelRatio canvas px per CSS px on a 2x display', () => {
    const fit = fitCanvasToWindow(1600, 900, 2);
    expect([fit.backingWidth, fit.backingHeight]).toEqual([3200, 1800]);
    expect(fit.pixelRatio).toBe(2);
    expect(fit.scale).toBe(0.5);
    expect([fit.width, fit.height]).toEqual([1600, 900]);
  });

  it('rounds a fractional window to whole canvas px and sizes the CSS box to match exactly', () => {
    const fit = fitCanvasToWindow(1512.3, 982.6, 2);
    expect([fit.backingWidth, fit.backingHeight]).toEqual([3025, 1965]);
    expect(fit.width * fit.pixelRatio).toBe(fit.backingWidth);
    expect(fit.height * fit.pixelRatio).toBe(fit.backingHeight);
  });

  it('caps the backing store above 2x so fill cost stays bounded', () => {
    const fit = fitCanvasToWindow(1600, 900, 3);
    expect(fit.pixelRatio).toBeLessThanOrEqual(MAX_PIXEL_RATIO);
    expect([fit.backingWidth, fit.backingHeight]).toEqual([2400, 1350]);
  });

  it('falls back to the default 800×600 buffer while the window has no size yet', () => {
    const fit = fitCanvasToWindow(0, 0, 2);
    expect([fit.backingWidth, fit.backingHeight]).toEqual([800, 600]);
    expect(fit.pixelRatio).toBe(1);
  });
});

describe('canvasPixelRatio (DPR cap)', () => {
  it('keeps the device ratio up to the cap', () => {
    expect(canvasPixelRatio(1)).toBe(1);
    expect(canvasPixelRatio(1.25)).toBe(1.25);
    expect(canvasPixelRatio(1.5)).toBe(1.5);
    expect(canvasPixelRatio(2)).toBe(2);
  });

  it('divides a higher ratio by a whole number, so each canvas px still covers whole device px', () => {
    for (const dpr of [2.5, 3, 4]) {
      const ratio = canvasPixelRatio(dpr);
      expect(ratio, `dpr ${dpr}`).toBeLessThanOrEqual(MAX_PIXEL_RATIO);
      expect(Number.isInteger(dpr / ratio), `dpr ${dpr}`).toBe(true);
    }
    expect(canvasPixelRatio(3)).toBe(1.5);
    expect(canvasPixelRatio(4)).toBe(2);
  });

  it('treats a missing or broken ratio as 1', () => {
    expect(canvasPixelRatio(0)).toBe(1);
    expect(canvasPixelRatio(Number.NaN)).toBe(1);
  });
});

describe('visibleCanvasRect', () => {
  it('is the full-width band between the top strip and the bottom console, in canvas px', () => {
    expect(visibleCanvasRect(fitCanvasToWindow(1600, 900, 1), { top: 30, bottom: 140 })).toEqual({
      x: 0, y: 30, w: 1600, h: 730,
    });
  });

  it('scales the CSS insets by the pixel ratio on a 2x display', () => {
    expect(visibleCanvasRect(fitCanvasToWindow(1600, 900, 2), { top: 30, bottom: 140 })).toEqual({
      x: 0, y: 60, w: 3200, h: 1460,
    });
  });

  it('is the whole canvas while the HUD is hidden (the intro)', () => {
    expect(visibleCanvasRect(fitCanvasToWindow(1280, 720, 1), { top: 0, bottom: 0 })).toEqual({
      x: 0, y: 0, w: 1280, h: 720,
    });
  });

  it('keeps at least one pixel of view when the HUD covers the whole window', () => {
    const rect = visibleCanvasRect(fitCanvasToWindow(800, 150, 1), { top: 28, bottom: 180 });
    expect(rect.h).toBeGreaterThanOrEqual(1);
    expect(rect.y).toBeLessThan(150);
  });
});

describe('pickDefaultZoom (real-resolution framing)', () => {
  /** Default zoom for a window of CSS size w×h at a device ratio. */
  const zoomFor = (w: number, h: number, dpr: number) => {
    const fit = fitCanvasToWindow(w, h, dpr);
    return { zoom: pickDefaultZoom(fit.backingWidth, fit.pixelRatio), fit };
  };

  it('picks the zoom for common windows', () => {
    expect(zoomFor(1280, 720, 1).zoom).toBe(1);
    expect(zoomFor(1600, 900, 1).zoom).toBe(1);
    expect(zoomFor(1920, 1080, 1).zoom).toBe(1);
    expect(zoomFor(2560, 1440, 1).zoom).toBe(1.5);
    expect(zoomFor(3840, 2160, 1).zoom).toBe(2);
    expect(zoomFor(1600, 900, 2).zoom).toBe(2);
    expect(zoomFor(1512, 982, 2).zoom).toBe(2);
  });

  it('keeps every art pixel on whole screen pixels', () => {
    for (const [w, h, dpr] of [[1280, 720, 1], [1600, 900, 1], [2560, 1440, 1], [1600, 900, 2], [1440, 900, 1.5]]) {
      const { zoom } = zoomFor(w, h, dpr);
      expect(Number.isInteger(ART_PX * zoom), `${w}x${h}@${dpr}`).toBe(true);
    }
  });

  it('shows at least the old 800×600 framing once the window is that wide, without shrinking ants', () => {
    for (const [w, h, dpr] of [[1600, 900, 1], [1920, 1080, 1], [2560, 1440, 1], [3840, 2160, 1], [1600, 900, 2]]) {
      const { zoom, fit } = zoomFor(w, h, dpr);
      expect(fit.backingWidth / zoom, `${w}x${h}@${dpr}`).toBeGreaterThanOrEqual(REFERENCE_VIEW_WORLD_PX);
      expect((ANT_WORLD_PX * zoom) / fit.pixelRatio, `${w}x${h}@${dpr}`).toBeGreaterThanOrEqual(MIN_ANT_SCREEN_PX);
    }
  });

  it('zooms in on a small window rather than letting the ants turn tiny', () => {
    const { zoom, fit } = zoomFor(1280, 720, 1);
    expect((ANT_WORLD_PX * zoom) / fit.pixelRatio).toBeGreaterThanOrEqual(MIN_ANT_SCREEN_PX);
  });
});
