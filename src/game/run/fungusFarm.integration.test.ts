import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import { AntState, COMPONENT, type AntComponent } from '../components/components';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';

// Real manager and simulation; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

function manager() {
  const game = new GameManager(fakeCanvas());
  finishIntro(game);
  return game;
}

/** Dig a 3x2 patch right under the starting pantry and zone it as a farm */
function buildFarm(game: GameManager): Array<{ x: number; y: number }> {
  const grid = game['undergroundGrid'] as UndergroundGrid;
  const pantry = grid.getPantryTiles();
  const minX = Math.min(...pantry.map((t) => t.x));
  const maxY = Math.max(...pantry.map((t) => t.y));
  const tiles: Array<{ x: number; y: number }> = [];
  for (let y = maxY + 1; y <= maxY + 2; y++) {
    for (let x = minX; x < minX + 3; x++) {
      grid.designate(x, y);
      grid.excavate(x, y);
      expect(game.designateFarm(x, y)).toBe(true);
      tiles.push({ x, y });
    }
  }
  return tiles;
}

describe('the fungus farm grows and the colony harvests it', () => {
  it('gardeners mulch the beds, a tile grows to ripe, then a nurse harvests it into the pantry', () => {
    const game = manager();
    const grid = game['undergroundGrid'] as UndergroundGrid;
    const farm = buildFarm(game);
    const render = game['renderSystem'] as unknown as { queueFarmHarvest: { mock: { calls: unknown[][] } } };

    let ripe = false;
    let gardeners = 0;
    let mulched = false;
    let harvesters = 0;
    let harvested = false;
    let pantryMushrooms = 0;
    let seconds = 0;
    for (let step = 0; step < 240 * 30 && !harvested; step++) {
      game['update'](1 / 30);
      seconds = step / 30;
      if (step % 15 !== 0) continue;
      const onPantry = grid.getPantryTiles().reduce((sum, t) => sum + (t.food?.type === 'mushroom' ? t.food.amount : 0), 0);
      pantryMushrooms = Math.max(pantryMushrooms, onPantry);
      const cap = grid.getPantryTileCapacity();
      if (grid.getFarmMulchTotal() > 0) mulched = true;
      if (!ripe && grid.getFarmTiles().some((t) => (t.food?.amount ?? 0) >= cap - 1e-6)) {
        ripe = true;
        // The colony has eaten through the foragers' haul: room in the pantry for the harvest
        for (const t of grid.getPantryTiles()) if (t.food?.type === 'mushroom') grid.takeFood(t.x, t.y, t.food.amount);
      }
      for (const id of game['world'].query(COMPONENT.ANT)) {
        const ant = game['world'].getComponent<AntComponent>(id, COMPONENT.ANT)!;
        if (ant.state === AntState.FarmHarvesting) harvesters++;
        if (ant.state === AntState.FarmTending) gardeners++;
      }
      harvested = render.queueFarmHarvest.mock.calls.some(([x, y]) => farm.some((t) => t.x === x && t.y === y)) && harvesters > 0;
    }

    expect(gardeners).toBeGreaterThan(0);
    expect(mulched).toBe(true);
    expect(ripe).toBe(true);
    expect(harvesters).toBeGreaterThan(0);
    expect(harvested).toBe(true);
    // Keep running a little so the load reaches the pantry
    for (let i = 0; i < 20 * 30; i++) game['update'](1 / 30);
    const onPantry = grid.getPantryTiles().reduce((sum, t) => sum + (t.food?.type === 'mushroom' ? t.food.amount : 0), 0);
    expect(Math.max(pantryMushrooms, onPantry)).toBeGreaterThan(0);
    expect(seconds).toBeLessThan(240);
  }, 30_000); // minutes of game time

  it('describes a tapped farm tile in the info card', () => {
    const game = manager();
    const grid = game['undergroundGrid'] as UndergroundGrid;
    const [tile] = buildFarm(game);
    grid.depositFood(tile.x, tile.y, 'mushroom', grid.getPantryTileCapacity() * 0.6);

    expect(game.focusFarmTile(tile.x, tile.y)).toBe(true);
    expect(game.getFocusedFarmTile()?.label).toBe('Granja de hongos · madurando 60%');

    grid.depositFood(tile.x, tile.y, 'mushroom', grid.getPantryTileCapacity());
    expect(game.getFocusedFarmTile()?.label).toBe('Granja de hongos · lista para cosechar');

    // Tapping anything else lets go of the farm
    expect(game.focusFarmTile(0, 0)).toBe(false);
    expect(game.getFocusedFarmTile()).toBeNull();
  });
});
