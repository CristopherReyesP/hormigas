import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import { CRATER_CLEAR_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import type { TileGrid } from '../../simulation/world/TileGrid';
import { fakeCanvas } from '../../test/gameManagerMocks';

// Real manager and map; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
const intros: Array<{ impact: { x: number; y: number }; nest: { x: number; y: number } }> = [];
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem({
  startMeteorIntro(impact: { x: number; y: number }, nest: { x: number; y: number }) { intros.push({ impact, nest }); },
}));
vi.stubGlobal('window', new EventTarget());

function manager() {
  return new GameManager(fakeCanvas());
}

describe('the meteorite crater on a real map', () => {
  it('lands on a walkable clearing on the far side of the map and stages the intro there', () => {
    for (let run = 0; run < 5; run++) {
      intros.length = 0;
      const game = manager();
      const site = game.getCraterSite();
      const grid = game['grid'] as TileGrid;
      const nest = { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) };

      const r = CRATER_CLEAR_RADIUS;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy <= r * r) expect(grid.isWalkable(site.x + dx, site.y + dy)).toBe(true);
        }
      }
      // Far side: well beyond the colony's starting clearing and screen
      expect(Math.hypot(site.x - nest.x, site.y - nest.y)).toBeGreaterThan(30);
      expect(intros).toEqual([{ impact: site, nest }]);
      game.stop();
    }
  });

  it('keeps the site fixed for the run (the getter hands out copies)', () => {
    const game = manager();
    const a = game.getCraterSite();
    a.x += 10;
    expect(game.getCraterSite()).not.toEqual(a);
    game.stop();
  });
});
