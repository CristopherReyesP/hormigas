import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { ChamberType } from '../../simulation/world/types';
import { APHID_HONEYDEW_PER_TILE, APHID_MAX_TILES, APHID_TILE_CAPACITY, APHID_TILE_COST } from '../../shared/constants';
import { AphidRanchSystem } from '../systems/AphidRanchSystem';
import { honeydewDrops, MAX_DROPS } from '../render/aphidRanchArt';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';

// Real manager and simulation; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

function manager() {
  const game = new GameManager(fakeCanvas());
  finishIntro(game);
  const grid = game['undergroundGrid'] as UndergroundGrid;
  // A stocked pantry to pay for the aphids
  for (const t of grid.getPantryTiles()) grid.depositFood(t.x, t.y, 'leaf', 1000);
  return { game, grid, world: game['world'] as World };
}

/** Dig `count` tiles in a 3-wide patch under the starting pantry */
function digRow(grid: UndergroundGrid, count: number): Array<{ x: number; y: number }> {
  const pantry = grid.getPantryTiles();
  const minX = Math.min(...pantry.map((t) => t.x));
  const maxY = Math.max(...pantry.map((t) => t.y));
  const tiles: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const x = minX + (i % 3);
    const y = maxY + 1 + Math.floor(i / 3);
    grid.designate(x, y);
    grid.excavate(x, y);
    tiles.push({ x, y });
  }
  return tiles;
}

describe('the aphid ranch', () => {
  it('a ranch tile costs food, and the ranch has a most of tiles', () => {
    const { game, grid } = manager();
    const tiles = digRow(grid, APHID_MAX_TILES + 1);
    const before = grid.getPantryStored().total;
    expect(game.designateRanch(tiles[0].x, tiles[0].y)).toBe(true);
    expect(grid.getTile(tiles[0].x, tiles[0].y)!.chamberType).toBe(ChamberType.AphidRanch);
    expect(grid.getPantryStored().total).toBeCloseTo(before - APHID_TILE_COST, 5);

    for (const t of tiles.slice(1, APHID_MAX_TILES)) expect(game.designateRanch(t.x, t.y)).toBe(true);
    const last = tiles[APHID_MAX_TILES];
    expect(game.designateRanch(last.x, last.y)).toBe(false);
    expect(game.getRanchStatus().tiles).toBe(APHID_MAX_TILES);
    game.stop();
  });

  it('is refused when the colony cannot pay, and on another zone', () => {
    const { game, grid } = manager();
    const [tile] = digRow(grid, 1);
    const pantryTile = grid.getPantryTiles()[0];
    expect(game.designateRanch(pantryTile.x, pantryTile.y)).toBe(false);
    grid.drainFood(grid.getPantryStored().total);
    expect(game.designateRanch(tile.x, tile.y)).toBe(false);
    expect(grid.getTile(tile.x, tile.y)!.chamberType).not.toBe(ChamberType.AphidRanch);
    game.stop();
  });

  it('gives honeydew with nothing from outside, up to what a tile holds, and the colony eats it first', () => {
    const { game, grid, world } = manager();
    const [tile] = digRow(grid, 1);
    expect(game.designateRanch(tile.x, tile.y)).toBe(true);
    const ranch = new AphidRanchSystem(world, grid);
    for (let s = 0; s < 100; s++) ranch.update(1);
    expect(grid.getRanchStored()).toBeCloseTo(100 * APHID_HONEYDEW_PER_TILE, 3);
    expect(ranch.getStatus().status).toBe('produciendo');

    // It counts as food, and is eaten before the pantry
    const leaves = grid.getPantryStored().leaf;
    const spent = grid.drainFood(5);
    expect(spent.honeydew).toBe(5);
    expect(grid.getPantryStored().leaf).toBe(leaves);

    for (let s = 0; s < 1000; s++) ranch.update(1);
    expect(grid.getRanchStored()).toBeCloseTo(APHID_TILE_CAPACITY, 3);
    expect(ranch.getStatus().status).toBe('llena');
    game.stop();
  });

  it('gives nothing while invaders are in the nest', () => {
    const { game, grid, world } = manager();
    const [tile] = digRow(grid, 1);
    game.designateRanch(tile.x, tile.y);
    let breached = true;
    const ranch = new AphidRanchSystem(world, grid, () => breached);
    for (let s = 0; s < 30; s++) ranch.update(1);
    expect(grid.getRanchStored()).toBe(0);
    expect(ranch.getStatus().status).toBe('asustados');
    breached = false;
    for (let s = 0; s < 30; s++) ranch.update(1);
    expect(grid.getRanchStored()).toBeGreaterThan(0);
    game.stop();
  });

  it('honeydew never lands in the pantry, and a tile with honeydew cannot be removed', () => {
    const { game, grid } = manager();
    const [tile] = digRow(grid, 1);
    game.designateRanch(tile.x, tile.y);
    const pantryTile = grid.getPantryTiles()[0];
    expect(grid.depositFood(pantryTile.x, pantryTile.y, 'honeydew', 5)).toBe(0);
    expect(grid.depositFood(tile.x, tile.y, 'leaf', 5)).toBe(0);
    expect(grid.depositFood(tile.x, tile.y, 'honeydew', 5)).toBe(5);
    expect(game.designateRanch(tile.x, tile.y)).toBe(false);
    grid.drainFoodOfType('honeydew', 5);
    expect(game.designateRanch(tile.x, tile.y)).toBe(true);
    expect(grid.getTile(tile.x, tile.y)!.chamberType).toBe(ChamberType.General);
    game.stop();
  });

  it('shows more drops the fuller the tile', () => {
    expect(honeydewDrops(0, APHID_TILE_CAPACITY)).toBe(0);
    expect(honeydewDrops(2, APHID_TILE_CAPACITY)).toBe(1);
    expect(honeydewDrops(APHID_TILE_CAPACITY, APHID_TILE_CAPACITY)).toBe(MAX_DROPS);
  });
});
