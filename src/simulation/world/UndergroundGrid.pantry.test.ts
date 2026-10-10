import { describe, expect, it } from 'vitest';
import { UndergroundGrid } from './UndergroundGrid';

describe('pantry piles', () => {
  it('gathers a partial pile into the others when no tile is free, so another food type fits', () => {
    const grid = new UndergroundGrid();
    for (const t of grid.getPantryTiles()) grid.depositFood(t.x, t.y, 'mushroom', 30);
    const before = grid.getPantryStored().total;
    expect(grid.hasDepositSpace(['leaf'])).toBe(false);

    expect(grid.compactPiles()).toBe(true);

    expect(grid.getPantryStored().total).toBe(before); // food is moved, never lost
    expect(grid.hasDepositSpace(['leaf'])).toBe(true);
    expect(grid.getPantryTiles().filter((t) => t.food === null)).toHaveLength(1);
  });

  it('leaves the piles alone while a tile is free or nothing can be merged', () => {
    const grid = new UndergroundGrid();
    expect(grid.compactPiles()).toBe(false); // the starting pantry has free tiles

    const cap = grid.getPantryTileCapacity();
    grid.getPantryTiles().forEach((t, i) => grid.depositFood(t.x, t.y, i % 2 ? 'leaf' : 'meat', cap - 5));
    // Every pile is nearly full: no pile fits in the room the others have
    expect(grid.compactPiles()).toBe(false);
  });
});
