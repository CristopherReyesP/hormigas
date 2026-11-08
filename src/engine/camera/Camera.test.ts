import { describe, expect, it } from 'vitest';
import { Camera, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, snapZoom, stepZoom, zoomLimits } from './Camera';
import { PHASE1_ZONE_HEIGHT, PHASE1_ZONE_WIDTH, TILE_SIZE } from '../../shared/constants';

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

describe('pixel-art scale', () => {
  it('shows one art pixel (2 world px) as 2 whole screen px on both axes at zoom 1', () => {
    const camera = new Camera();
    camera.zoom = 1;
    const a = camera.worldToScreen(100, 100);
    const b = camera.worldToScreen(102, 102);
    expect(b.x - a.x).toBe(2);
    expect(b.y - a.y).toBe(2);
  });

  it('keeps an art pixel a whole number of screen px at every zoom step', () => {
    for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM; zoom += ZOOM_STEP) {
      const camera = new Camera();
      camera.zoom = zoom;
      const a = camera.worldToScreen(0, 0);
      const b = camera.worldToScreen(2, 2);
      expect(Number.isInteger(b.x - a.x), `zoom ${zoom} x`).toBe(true);
      expect(Number.isInteger(b.y - a.y), `zoom ${zoom} y`).toBe(true);
    }
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

describe('pinch zoom', () => {
  it('lands on the 0.5 grid and keeps the world point under the fingers in place', () => {
    const camera = new Camera();
    camera.zoom = 1;
    camera.centerOn(2000, 2000);
    const before = camera.screenToWorld(300, 200);
    camera.zoomTo(300, 200, 1.8);
    expect(camera.zoom).toBe(2);
    const after = camera.screenToWorld(300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('does nothing while a cinematic owns the camera', () => {
    const camera = new Camera();
    camera.zoom = 1;
    camera.direct({ x: 2000, y: 2000, zoom: 1 });
    camera.zoomTo(300, 200, 3);
    expect(camera.zoom).toBe(1);
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

describe('zoom limits follow the canvas', () => {
  // The area the camera starts on: Phase 1's walled zone
  const WORLD_W = PHASE1_ZONE_WIDTH * TILE_SIZE;
  const WORLD_H = PHASE1_ZONE_HEIGHT * TILE_SIZE;

  it('never zooms out past the whole map, never below the 0.5 grid', () => {
    expect(zoomLimits(1600, 900, 1, WORLD_W, WORLD_H).min).toBe(0.5);
    expect(zoomLimits(2560, 1440, 1, WORLD_W, WORLD_H).min).toBe(1);
    expect(zoomLimits(3200, 1800, 2, WORLD_W, WORLD_H).min).toBe(1);
    expect(zoomLimits(400, 300, 1, WORLD_W, WORLD_H).min).toBe(MIN_ZOOM);
  });

  it('allows the same close-up on screen at any device ratio', () => {
    expect(zoomLimits(1600, 900, 1, WORLD_W, WORLD_H).max).toBe(MAX_ZOOM);
    expect(zoomLimits(3200, 1800, 2, WORLD_W, WORLD_H).max).toBe(MAX_ZOOM * 2);
    expect(zoomLimits(2400, 1350, 1.5, WORLD_W, WORLD_H).max).toBe(MAX_ZOOM * 1.5);
  });

  it('keeps both limits on the 0.5 grid', () => {
    for (const [w, h, r] of [[1280, 720, 1], [1512, 982, 1.25], [3024, 1964, 2]]) {
      const { min, max } = zoomLimits(w, h, r, WORLD_W, WORLD_H);
      expect(Number.isInteger(min / ZOOM_STEP)).toBe(true);
      expect(Number.isInteger(max / ZOOM_STEP)).toBe(true);
      expect(min).toBeLessThanOrEqual(max);
    }
  });

  it('stops the wheel at the canvas limits', () => {
    const camera = new Camera();
    camera.setCanvasSize(3200, 1800, 2);
    camera.zoom = 1;
    camera.zoomAt(100, 100, 100);
    expect(camera.zoom).toBe(1);
    camera.zoom = 8;
    camera.zoomAt(100, 100, -100);
    expect(camera.zoom).toBe(8);
  });

  it('pulls the zoom and the default zoom into the new limits on a resize', () => {
    const camera = new Camera(PHASE1_ZONE_WIDTH, PHASE1_ZONE_HEIGHT);
    camera.setCanvasSize(1600, 900, 1);
    camera.setDefaultZoom(0.5);
    camera.zoom = 0.5;
    camera.setCanvasSize(2560, 1440, 1);
    expect(camera.zoom).toBe(1);
    expect(camera.getDefaultZoom()).toBe(1);
  });
});

describe('the area the view stays on', () => {
  it('keeps the view inside Phase 1\'s zone, then the whole map once it opens', () => {
    const camera = new Camera(168, 126);
    camera.setViewport({ x: 0, y: 0, w: 800, h: 600 });
    camera.setWorldArea(24, 18, 120, 90);
    camera.zoom = 1;
    camera.centerOn(0, 0);
    const topLeft = camera.screenToWorld(0, 0);
    expect(topLeft.x).toBeGreaterThanOrEqual(24 * TILE_SIZE - 50);
    expect(topLeft.y).toBeGreaterThanOrEqual(18 * TILE_SIZE - 50);
    camera.centerOn(168 * TILE_SIZE, 126 * TILE_SIZE);
    const bottomRight = camera.screenToWorld(800, 600);
    expect(bottomRight.x).toBeLessThanOrEqual(144 * TILE_SIZE + 50);
    expect(bottomRight.y).toBeLessThanOrEqual(108 * TILE_SIZE + 50);

    camera.setWorldArea(0, 0, 168, 126);
    camera.centerOn(0, 0);
    expect(camera.screenToWorld(0, 0).x).toBeLessThanOrEqual(0);
    expect(camera.getWorldArea()).toEqual({ x: 0, y: 0, width: 168, height: 126 });
  });
});

describe('canvas resize', () => {
  it('reports the world rect the whole canvas covers, for culling', () => {
    const camera = new Camera();
    camera.setCanvasSize(1600, 900, 1);
    camera.zoom = 2;
    camera.x = 100;
    camera.y = 40;
    expect(camera.getCanvasSize()).toEqual({ width: 1600, height: 900 });
    expect(camera.getCanvasWorldRect()).toEqual({ x: 100, y: 40, w: 800, h: 450 });
  });

  it('clamps the view to the map with the new canvas size', () => {
    const camera = new Camera(120, 90);
    camera.setCanvasSize(2560, 1440, 1);
    camera.setViewport({ x: 0, y: 30, w: 2560, h: 1270 });
    camera.zoom = 1;
    camera.centerOn(120 * TILE_SIZE, 90 * TILE_SIZE);
    const bottomRight = camera.screenToWorld(2560, 30 + 1270);
    expect(bottomRight.x).toBeLessThanOrEqual(120 * TILE_SIZE + 50);
    expect(bottomRight.x).toBeGreaterThanOrEqual(120 * TILE_SIZE);
    expect(bottomRight.y).toBeLessThanOrEqual(90 * TILE_SIZE + 50);
  });

  it('keeps the CSS framing when the device ratio changes (window moved to another display)', () => {
    const camera = new Camera();
    camera.setCanvasSize(1600, 900, 1);
    camera.setViewport({ x: 0, y: 30, w: 1600, h: 730 });
    camera.zoom = 1;
    camera.centerOn(1920, 1440);
    camera.setCanvasSize(3200, 1800, 2);
    camera.setViewport({ x: 0, y: 60, w: 3200, h: 1460 });
    expect(camera.zoom).toBe(2);
    const center = camera.screenToWorld(1600, 60 + 730);
    expect(center.x).toBeCloseTo(1920);
    expect(center.y).toBeCloseTo(1440);
  });

  it('maps the same CSS point to the same tile at DPR 1 and DPR 2', () => {
    const at = (ratio: number) => {
      const camera = new Camera();
      camera.setCanvasSize(1600 * ratio, 900 * ratio, ratio);
      camera.setViewport({ x: 0, y: 30 * ratio, w: 1600 * ratio, h: 730 * ratio });
      camera.zoom = ratio;
      camera.centerOn(1920, 1440);
      return camera;
    };
    const one = at(1);
    const two = at(2);
    for (const [cssX, cssY] of [[0, 30], [800, 450], [1599, 759], [37, 611]]) {
      expect(two.screenToTile(cssX * 2, cssY * 2)).toEqual(one.screenToTile(cssX, cssY));
    }
    expect(two.getViewRectTiles()).toEqual(one.getViewRectTiles());
  });
});

describe('quarter-turn rotation', () => {
  function view(turns = 0) {
    const camera = new Camera(300, 300);
    camera.setCanvasSize(1000, 700);
    camera.setViewport({ x: 80, y: 40, w: 800, h: 500 });
    camera.centerOn(2000, 2000);
    for (let i = 0; i < turns; i++) camera.rotateCW();
    return camera;
  }

  it.each([0, 1, 2, 3])('round-trips coordinates and hits tiles at turn %i', turns => {
    const camera = view(turns);
    const world = { x: 2113, y: 1927 };
    const screen = camera.worldToScreen(world.x, world.y);
    expect(camera.screenToWorld(screen.x, screen.y)).toEqual(world);
    expect(camera.screenToTile(screen.x, screen.y)).toEqual({ x: Math.floor(world.x / TILE_SIZE), y: Math.floor(world.y / TILE_SIZE) });
  });

  it('keeps the viewport center fixed, including near map edges', () => {
    const camera = view();
    camera.centerOn(0, 0);
    const before = camera.screenToWorld(480, 290);
    for (let i = 0; i < 4; i++) {
      camera.rotateCW();
      expect(camera.screenToWorld(480, 290)).toEqual(before);
    }
  });

  it.each([0, 1, 2, 3])('pans in screen directions at turn %i', turns => {
    const camera = view(turns);
    const before = camera.worldToScreen(2000, 2000);
    camera.pan(30, -20);
    expect(camera.worldToScreen(2000, 2000)).toEqual({ x: before.x + 30, y: before.y - 20 });
  });

  it.each([0, 1, 2, 3])('anchors wheel and pinch zoom at turn %i', turns => {
    const camera = view(turns);
    const before = camera.screenToWorld(230, 170);
    camera.zoomAt(230, 170, -100);
    expect(camera.screenToWorld(230, 170).x).toBeCloseTo(before.x);
    expect(camera.screenToWorld(230, 170).y).toBeCloseTo(before.y);
    camera.zoomTo(230, 170, 2);
    expect(camera.screenToWorld(230, 170).x).toBeCloseTo(before.x);
    expect(camera.screenToWorld(230, 170).y).toBeCloseTo(before.y);
  });

  it.each([0, 1, 2, 3])('covers all viewport and canvas corners at turn %i', turns => {
    const camera = view(turns);
    for (const [rect, corners, scale] of [
      [camera.getViewRectTiles(), [[80, 40], [880, 40], [80, 540], [880, 540]], TILE_SIZE],
      [camera.getCanvasWorldRect(), [[0, 0], [1000, 0], [0, 700], [1000, 700]], 1],
    ] as const) {
      for (const [x, y] of corners) {
        const p = camera.screenToWorld(x, y);
        expect(p.x / scale).toBeGreaterThanOrEqual(rect.x);
        expect(p.x / scale).toBeLessThanOrEqual(rect.x + rect.w);
        expect(p.y / scale).toBeGreaterThanOrEqual(rect.y);
        expect(p.y / scale).toBeLessThanOrEqual(rect.y + rect.h);
      }
    }
  });

  it('rotates clockwise exactly and returns to identity after four turns', () => {
    const camera = view();
    const before = camera.worldToScreen(2100, 2000);
    camera.rotateCW();
    expect(camera.getRotation()).toBe(1);
    expect(camera.worldToScreen(2100, 2000)).toEqual({ x: 480, y: 390 });
    for (let i = 0; i < 3; i++) camera.rotateCW();
    expect(camera.getRotation()).toBe(0);
    expect(camera.worldToScreen(2100, 2000)).toEqual(before);
    camera.rotateCCW();
    expect(camera.getRotation()).toBe(3);
  });

  it('reset clears rotation', () => {
    const camera = view(3);
    camera.reset();
    expect(camera.getRotation()).toBe(0);
  });

  it('preserves zero-rotation offset coordinates', () => {
    const camera = view();
    camera.x = 100;
    camera.y = 200;
    camera.zoom = 2;
    expect(camera.worldToScreen(130, 240)).toEqual({ x: 60, y: 80 });
    expect(camera.screenToWorld(60, 80)).toEqual({ x: 130, y: 240 });
  });

  it('keeps rotation during cinematics and ignores player turns until release', () => {
    const camera = view(1);
    camera.direct({ x: 2100, y: 2200, zoom: 2 });
    camera.rotateCW();
    camera.rotateCCW();
    camera.reset();
    expect(camera.getRotation()).toBe(1);
    expect(camera.screenToWorld(480, 290)).toEqual({ x: 2100, y: 2200 });
    camera.release();
    camera.rotateCW();
    expect(camera.getRotation()).toBe(2);
  });
});

it('fits a rectangular world after a quarter turn and preserves its center', () => {
  const camera = new Camera(100, 30);
  camera.setCanvasSize(1000, 600);
  camera.setViewport({ x: 0, y: 0, w: 1000, h: 600 });
  camera.setZoom(1);
  camera.centerOn(1600, 480);
  const center = camera.screenToWorld(500, 300);
  camera.rotateCW();
  expect(camera.getZoomLimits().min).toBe(1.5);
  expect(camera.getZoom()).toBe(1.5);
  expect(camera.screenToWorld(500, 300)).toEqual(center);
  camera.setCanvasSize(1200, 600);
  expect(camera.getZoomLimits().min).toBe(1.5);
  camera.pan(100000, 100000);
  const rect = camera.getViewRectTiles();
  expect(rect.x * TILE_SIZE).toBeGreaterThanOrEqual(-50 - 1e-8);
  expect(rect.y * TILE_SIZE).toBeGreaterThanOrEqual(-50 - 1e-8);
  expect((rect.x + rect.w) * TILE_SIZE).toBeLessThanOrEqual(3250 + 1e-8);
  expect((rect.y + rect.h) * TILE_SIZE).toBeLessThanOrEqual(1010 + 1e-8);
  camera.reset();
  expect(camera.getZoomLimits().min).toBe(1);
});

describe('screen-space camera tilt', () => {
  const combinations = [0, 1, 2, 3].flatMap(rotation => [0, 1, 2].map(tilt => ({ rotation, tilt })));
  function view(rotation = 0, tilt = 0) {
    const camera = new Camera(300, 300);
    camera.setCanvasSize(1000, 700);
    camera.setViewport({ x: 80, y: 40, w: 800, h: 500 });
    camera.centerOn(3000, 3000);
    for (let i = 0; i < rotation; i++) camera.rotateCW();
    for (let i = 0; i < tilt; i++) camera.tiltDown();
    return camera;
  }

  it.each(combinations)('round-trips coordinates and squashes screen Y after rotation at $rotation/$tilt', ({ rotation, tilt }) => {
    const camera = view(rotation, tilt);
    const flat = view(rotation);
    const scale = [1, 0.75, 0.55][tilt];
    expect(camera.getTiltScale()).toBe(scale);
    for (const world of [{ x: 3113, y: 2927 }, { x: 2900, y: 3100 }]) {
      const screen = camera.worldToScreen(world.x, world.y);
      const expected = flat.worldToScreen(world.x, world.y);
      expect(screen.x).toBeCloseTo(expected.x);
      expect(screen.y).toBeCloseTo(290 + (expected.y - 290) * scale);
      const actual = camera.screenToWorld(screen.x, screen.y);
      expect(actual.x).toBeCloseTo(world.x);
      expect(actual.y).toBeCloseTo(world.y);
      expect(camera.screenToTile(screen.x, screen.y)).toEqual({ x: Math.floor(world.x / TILE_SIZE), y: Math.floor(world.y / TILE_SIZE) });
    }
  });

  it.each(combinations)('covers canvas and viewport corners at $rotation/$tilt', ({ rotation, tilt }) => {
    const camera = view(rotation, tilt);
    for (const [rect, corners, unit] of [
      [camera.getViewRectTiles(), [[80, 40], [880, 40], [80, 540], [880, 540]], TILE_SIZE],
      [camera.getCanvasWorldRect(), [[0, 0], [1000, 0], [0, 700], [1000, 700]], 1],
    ] as const) {
      for (const [x, y] of corners) {
        const p = camera.screenToWorld(x, y);
        expect(p.x / unit).toBeGreaterThanOrEqual(rect.x - 1e-8);
        expect(p.x / unit).toBeLessThanOrEqual(rect.x + rect.w + 1e-8);
        expect(p.y / unit).toBeGreaterThanOrEqual(rect.y - 1e-8);
        expect(p.y / unit).toBeLessThanOrEqual(rect.y + rect.h + 1e-8);
      }
    }
  });

  it.each(combinations)('pans in screen direction and anchors zoom at $rotation/$tilt', ({ rotation, tilt }) => {
    const camera = view(rotation, tilt);
    const before = camera.worldToScreen(3000, 3000);
    camera.pan(30, -20);
    const after = camera.worldToScreen(3000, 3000);
    expect(after.x).toBeCloseTo(before.x + 30);
    expect(after.y).toBeCloseTo(before.y - 20);
    const pointer = camera.screenToWorld(230, 170);
    camera.zoomAt(230, 170, -100);
    expect(camera.screenToWorld(230, 170).x).toBeCloseTo(pointer.x);
    expect(camera.screenToWorld(230, 170).y).toBeCloseTo(pointer.y);
    camera.zoomTo(230, 170, 2.5);
    expect(camera.screenToWorld(230, 170).x).toBeCloseTo(pointer.x);
    expect(camera.screenToWorld(230, 170).y).toBeCloseTo(pointer.y);
  });

  it.each([0, 1, 2, 3])('keeps the center fixed through tilt changes near edges at rotation %i', rotation => {
    const camera = view(rotation);
    camera.centerOn(0, 0);
    const before = camera.screenToWorld(480, 290);
    for (const change of ['tiltDown', 'tiltDown', 'tiltUp', 'tiltUp'] as const) {
      camera[change]();
      expect(camera.screenToWorld(480, 290).x).toBeCloseTo(before.x);
      expect(camera.screenToWorld(480, 290).y).toBeCloseTo(before.y);
    }
  });

  it('clamps tilt to 0..2 and resets it alongside rotation', () => {
    const camera = view(3);
    camera.tiltUp();
    expect(camera.getTilt()).toBe(0);
    camera.tiltDown();
    expect(camera.getTilt()).toBe(1);
    camera.tiltDown();
    camera.tiltDown();
    expect(camera.getTilt()).toBe(2);
    camera.reset();
    expect(camera.getTilt()).toBe(0);
    expect(camera.getRotation()).toBe(0);
  });

  it('ignores tilt changes during directed shots and resumes after release', () => {
    const camera = view(1, 1);
    camera.direct({ x: 3100, y: 3200, zoom: 2 });
    camera.tiltDown();
    camera.tiltUp();
    camera.reset();
    expect(camera.getTilt()).toBe(1);
    expect(camera.screenToWorld(480, 290)).toEqual({ x: 3100, y: 3200 });
    camera.release({ x: 3300, y: 3400, zoom: 1.5 });
    expect(camera.screenToWorld(480, 290)).toEqual({ x: 3300, y: 3400 });
    camera.tiltDown();
    expect(camera.getTilt()).toBe(2);
  });

  it.each([0, 1, 2, 3])('fits and clamps a rectangular map at maximum tilt, rotation %i', rotation => {
    const camera = new Camera(100, 30);
    camera.setCanvasSize(1000, 600);
    camera.setViewport({ x: 0, y: 0, w: 1000, h: 600 });
    for (let i = 0; i < rotation; i++) camera.rotateCW();
    camera.tiltDown();
    camera.tiltDown();
    const min = camera.getZoomLimits().min;
    expect(min).toBe(1.5);
    camera.setZoom(min);
    camera.pan(100000, 100000);
    const rect = camera.getCanvasWorldRect();
    expect(rect.x).toBeGreaterThanOrEqual(-50 - 1e-8);
    expect(rect.y).toBeGreaterThanOrEqual(-50 - 1e-8);
    expect(rect.x + rect.w).toBeLessThanOrEqual(3250 + 1e-8);
    expect(rect.y + rect.h).toBeLessThanOrEqual(1010 + 1e-8);
  });
});
