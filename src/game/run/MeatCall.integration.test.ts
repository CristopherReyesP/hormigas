import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import { COMPONENT, FoodType, Layer, type FoodSourceComponent, type PositionComponent } from '../components/components';
import type { World } from '../../engine/ecs/World';
import { createFood } from '../entities/factories';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';

vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

// "No van por la carne de los enemigos": a worker only saw a few tiles around
// it, so the carcasses of a fight away from the nest lay there and rotted.

describe('the call to the meat', () => {
  it('workers go for the meat of a kill well out of their sight', () => {
    const game = new GameManager(fakeCanvas());
    finishIntro(game);
    const world = game['world'] as World;
    for (const id of [...world.query(COMPONENT.BEETLE), ...world.query(COMPONENT.CRICKET)]) world.destroyEntity(id);
    const nest = world.getComponent<PositionComponent>(world.query(COMPONENT.NEST)[0], COMPONENT.POSITION)!;
    const grid = game['grid'] as { isWalkable(x: number, y: number): boolean };
    // A walkable tile ~18 tiles out
    let at: { x: number; y: number } | null = null;
    for (let r = 18; r < 26 && !at; r++) {
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
        const x = Math.round(nest.x + dx);
        const y = Math.round(nest.y + dy);
        if (grid.isWalkable(x, y)) { at = { x, y }; break; }
      }
    }
    expect(at).not.toBeNull();
    const meat = createFood(world, at!.x, at!.y, 40, FoodType.BeetleMeat, Layer.Surface);
    for (let i = 0; i < 45 * 30; i++) {
      const offer = game['mutationOffer'] as { options: Array<{ id: string }> } | null;
      if (offer) game.chooseMutation(offer.options[0].id);
      game['update'](1 / 30);
    }
    const left = world.getComponent<FoodSourceComponent>(meat, COMPONENT.FOOD_SOURCE)?.amount ?? 0;
    expect(left).toBeLessThan(40);
    game.stop();
  });
});
