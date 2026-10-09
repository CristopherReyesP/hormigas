import { describe, expect, it } from 'vitest';
import { Camera, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, snapZoom, stepZoom } from './Camera';
import { TILE_SIZE } from '../../shared/constants';

describe('zoom steps', () => {
  it('moves in increments of 0.5 between the limits', () => {
    expect(ZOOM_STEP).toBe(0.5);
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1, -1)).toBe(0.5);
    expect(stepZoom(2.5, 1)).toBe(3);
  });

  it('stops at the minimum and maximum zoom', () => {
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
  });

  it('lands an off-grid zoom on the next step in the wheel direction', () => {
    expect(stepZoom(0.75, 1)).toBe(1);
    expect(stepZoom(0.75, -1)).toBe(0.5);
  });

  it('snaps any zoom to the nearest step inside the limits', () => {
    expect(snapZoom(0.53)).toBe(0.5);
    expect(snapZoom(0.8)).toBe(1);
    expect(snapZoom(1.3)).toBe(1.5);
    expect(snapZoom(0.1)).toBe(MIN_ZOOM);
    expect(snapZoom(10)).toBe(MAX_ZOOM);
  });
});

describe('wheel zoom', () => {
  it('needs a full wheel notch before it steps, so trackpads do not race', () => {
    const camera = new Camera();
    camera.zoom = 1;
    camera.zoomAt(400, 300, 30);
    expect(camera.zoom).toBe(1);
    camera.zoomAt(400, 300, 30);
    expect(camera.zoom).toBe(0.5);
  });

  it('steps once per mouse notch and resets the pending scroll on a direction change', () => {
    const camera = new Camera();
    camera.zoom = 1;
    camera.zoomAt(400, 300, -100);
    expect(camera.zoom).toBe(1.5);
    camera.zoomAt(400, 300, 40);
    camera.zoomAt(400, 300, -40);
    expect(camera.zoom).toBe(1.5);
  });
});

describe('camera viewport', () => {
  const viewport = { x: 0, y: 100, w: 800, h: 300 };

  it('centers a world point in the middle of the visible viewport, not the whole canvas', () => {
    const camera = new Camera();
    camera.setViewport(viewport);
    camera.zoom = 0.5;
    camera.centerOn(1920, 1440);
    const screen = camera.worldToScreen(1920, 1440);
    expect(screen.x).toBeCloseTo(400);
    expect(screen.y).toBeCloseTo(250);
  });

  it('reports the visible viewport as the minimap rect', () => {
    const camera = new Camera();
    camera.setViewport(viewport);
    camera.zoom = 0.5;
    camera.centerOn(1920, 1440);
    const rect = camera.getViewRectTiles();
    const topLeft = camera.screenToWorld(viewport.x, viewport.y);
    const bottomRight = camera.screenToWorld(viewport.x + viewport.w, viewport.y + viewport.h);
    expect(rect.x).toBeCloseTo(topLeft.x / TILE_SIZE);
    expect(rect.y).toBeCloseTo(topLeft.y / TILE_SIZE);
    expect(rect.w).toBeCloseTo((bottomRight.x - topLeft.x) / TILE_SIZE);
    expect(rect.h).toBeCloseTo((bottomRight.y - topLeft.y) / TILE_SIZE);
  });

  it('lets the visible viewport reach the world edge but not wander past it', () => {
    const camera = new Camera(120, 90);
    camera.setViewport(viewport);
    camera.zoom = 1;
    camera.centerOn(0, 0);
    const topLeft = camera.screenToWorld(viewport.x, viewport.y);
    expect(topLeft.x).toBeGreaterThanOrEqual(-50);
    expect(topLeft.x).toBeLessThanOrEqual(0);
    expect(topLeft.y).toBeGreaterThanOrEqual(-50);
    expect(topLeft.y).toBeLessThanOrEqual(0);

    camera.centerOn(120 * TILE_SIZE, 90 * TILE_SIZE);
    const bottomRight = camera.screenToWorld(viewport.x + viewport.w, viewport.y + viewport.h);
    expect(bottomRight.x).toBeLessThanOrEqual(120 * TILE_SIZE + 50);
    expect(bottomRight.x).toBeGreaterThanOrEqual(120 * TILE_SIZE);
    expect(bottomRight.y).toBeLessThanOrEqual(90 * TILE_SIZE + 50);
  });

  it('keeps the same world point centered when the viewport is resized', () => {
    const camera = new Camera();
    camera.zoom = 1;
    camera.centerOn(1920, 1440);
    camera.setViewport({ x: 0, y: 40, w: 640, h: 360 });
    const screen = camera.worldToScreen(1920, 1440);
    expect(screen.x).toBeCloseTo(320);
    expect(screen.y).toBeCloseTo(220);
  });

  it('resets to its default zoom', () => {
    const camera = new Camera();
    camera.setDefaultZoom(0.5);
    camera.zoom = 3;
    camera.reset();
    expect(camera.zoom).toBe(0.5);
  });
});

describe('directed camera (cinematics)', () => {
  const viewport = { x: 0, y: 0, w: 800, h: 600 };
  const viewCenter = (camera: Camera) => camera.screenToWorld(viewport.w / 2, viewport.h / 2);

  it('frames a scripted shot: centered on the point, zoom snapped to the grid', () => {
    const camera = new Camera();
    camera.setViewport(viewport);
    camera.direct({ x: 1900, y: 1400, zoom: 1.4 });
    expect(camera.isDirected()).toBe(true);
    expect(camera.zoom).toBe(1.5);
    expect(viewCenter(camera).x).toBeCloseTo(1900);
    expect(viewCenter(camera).y).toBeCloseTo(1400);
  });

  it('ignores player pan, wheel zoom and reset while a shot is running', () => {
    const camera = new Camera();
    camera.setViewport(viewport);
    camera.setDefaultZoom(0.5);
    camera.direct({ x: 1900, y: 1400, zoom: 1 });
    const before = { x: camera.x, y: camera.y, zoom: camera.zoom };
    camera.pan(120, -80);
    camera.zoomAt(400, 300, -200);
    camera.reset();
    expect({ x: camera.x, y: camera.y, zoom: camera.zoom }).toEqual(before);
  });

  it('hands control back on release, optionally on a final shot', () => {
    const camera = new Camera();
    camera.setViewport(viewport);
    camera.direct({ x: 3000, y: 700, zoom: 1.5 });
    camera.release({ x: 1900, y: 1400, zoom: 1 });
    expect(camera.isDirected()).toBe(false);
    expect(camera.zoom).toBe(1);
    expect(viewCenter(camera).x).toBeCloseTo(1900);
    const x = camera.x;
    camera.pan(100, 0);
    expect(camera.x).toBeCloseTo(x - 100);
  });
});
