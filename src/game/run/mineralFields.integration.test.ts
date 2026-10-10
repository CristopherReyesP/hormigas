import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import { MINERAL_MIN_NEST_DISTANCE, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, type PositionComponent } from '../components/components';
import { findPath } from '../../simulation/pathfinding/AStar';
import { fakeCanvas } from '../../test/gameManagerMocks';

// Real manager and map; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem({}));
vi.stubGlobal('window', new EventTarget());

describe('mineral fields on a real map', () => {
  it('seeds mineral nodes the colony can walk to, away from the nest, and starts the bank empty', () => {
    for (let run = 0; run < 3; run++) {
      const game = new GameManager(fakeCanvas());
      const world = game['world'] as World;
      const grid = game['grid'] as TileGrid;
      const nest = { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) };

      const nodes = world.query(COMPONENT.MINERAL, COMPONENT.POSITION);
      expect(nodes.length).toBeGreaterThan(0);
      expect(world.query(COMPONENT.MINERAL, COMPONENT.FOOD_SOURCE)).toHaveLength(0);
      for (const id of nodes) {
        const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        expect(grid.isWalkable(pos.x, pos.y)).toBe(true);
        expect(Math.hypot(pos.x - nest.x, pos.y - nest.y)).toBeGreaterThanOrEqual(MINERAL_MIN_NEST_DISTANCE);
        expect(findPath(grid, nest, { x: pos.x, y: pos.y }, 20000)).not.toBeNull();
      }

      expect(game.getStats().mineralsStored).toBe(0);
      world.minerals.deposit(12);
      expect(game.getStats().mineralsStored).toBe(12);
      game.stop();
    }
  });
});
