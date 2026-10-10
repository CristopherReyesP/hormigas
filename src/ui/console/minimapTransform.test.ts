import { describe, expect, it } from 'vitest';
import { fitMinimap, minimapToTile, tileToMinimap, viewRectOnMinimap } from './minimapTransform';

describe('minimap transform', () => {
  const surface = fitMinimap(120, 90, 160, 160);

  it('letterboxes the 4:3 surface inside a square box at one uniform scale', () => {
    expect(surface.scale).toBeCloseTo(4 / 3);
    expect(surface.width).toBeCloseTo(160);
    expect(surface.height).toBeCloseTo(120);
    expect(surface.offsetX).toBe(0);
    expect(surface.offsetY).toBe(20);
  });

  it('maps tiles to minimap pixels and back', () => {
    expect(tileToMinimap(surface, 60, 45)).toEqual({ x: 80, y: 80 });
    const tile = minimapToTile(surface, 80, 80);
    expect(tile.x).toBeCloseTo(60);
    expect(tile.y).toBeCloseTo(45);
  });

  it('clamps clicks on the letterbox bars to the map edge', () => {
    expect(minimapToTile(surface, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(minimapToTile(surface, 160, 160)).toEqual({ x: 120, y: 90 });
  });

  it('clips the camera rect to the drawn map area', () => {
    const rect = viewRectOnMinimap(surface, { x: -10, y: 80, w: 30, h: 20 });
    expect(rect.x).toBe(0);
    expect(rect.y).toBeCloseTo(20 + 80 * (4 / 3));
    expect(rect.w).toBeCloseTo(20 * (4 / 3));
    expect(rect.h).toBeCloseTo(10 * (4 / 3));
  });
});
