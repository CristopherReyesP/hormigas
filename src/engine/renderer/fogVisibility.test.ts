import { describe, expect, it } from 'vitest';
import { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { FOG_CLEAR_BRIGHTNESS, isTileVisible } from './fogVisibility';

describe('isTileVisible (enemies are drawn only where the colony sees right now)', () => {
  it('is false on a tile no ant has ever seen', () => {
    const grid = new VisibilityGrid(20, 20);
    expect(isTileVisible(grid, 5, 5)).toBe(false);
  });

  it('is true at the heart of a live reveal', () => {
    const grid = new VisibilityGrid(20, 20);
    grid.revealCircle(10, 10, 5);
    expect(isTileVisible(grid, 10, 10)).toBe(true);
  });

  it('is false on explored ground once the revealing ant has left', () => {
    const grid = new VisibilityGrid(20, 20);
    grid.revealCircle(10, 10, 5);
    grid.resetBrightness();
    expect(grid.isExplored(10, 10)).toBe(true);
    expect(isTileVisible(grid, 10, 10)).toBe(false);
  });

  it('matches the fog renderer clear band: the dim rim of a reveal stays hidden', () => {
    const grid = new VisibilityGrid(20, 20);
    grid.revealCircle(10, 10, 5);
    // Distance 4 of 5 → quadratic falloff leaves it explored but under-lit
    expect(grid.isExplored(14, 10)).toBe(true);
    expect(grid.getBrightness(14, 10)).toBeGreaterThan(0);
    expect(grid.getBrightness(14, 10)).toBeLessThan(FOG_CLEAR_BRIGHTNESS);
    expect(isTileVisible(grid, 14, 10)).toBe(false);
  });

  it('is false outside the grid', () => {
    const grid = new VisibilityGrid(20, 20);
    grid.revealCircle(0, 0, 5);
    expect(isTileVisible(grid, -1, 0)).toBe(false);
    expect(isTileVisible(grid, 0, 20)).toBe(false);
  });
});
