import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import { AntRole, COMPONENT, Layer, type HealthComponent, type LayerComponent, type PositionComponent } from '../components/components';
import type { World } from '../../engine/ecs/World';
import { createAnt, createBeetle } from '../entities/factories';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';
import { BOMBER_BURST } from '../../shared/constants';

vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('./../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

function setup() {
  const game = new GameManager(fakeCanvas());
  finishIntro(game);
  const world = game['world'] as World;
  for (const id of [...world.query(COMPONENT.BEETLE), ...world.query(COMPONENT.CRICKET)]) world.destroyEntity(id);
  const nest = world.getComponent<PositionComponent>(world.query(COMPONENT.NEST)[0], COMPONENT.POSITION)!;
  const run = (seconds: number) => {
    for (let i = 0; i < seconds * 30; i++) game['update'](1 / 30);
  };
  return { game, world, nest, run };
}

describe('the exploding ant', () => {
  it('runs at an enemy in sight and bursts on it, hurting every enemy around and dying', () => {
    const { game, world, nest, run } = setup();
    const bomber = createAnt(world, nest.x + 3, nest.y + 3, AntRole.Bomber);
    world.getComponent<LayerComponent>(bomber, COMPONENT.LAYER)!.layer = Layer.Surface;
    const a = createBeetle(world, nest.x + 8, nest.y + 3, null);
    const b = createBeetle(world, nest.x + 8.8, nest.y + 3.6, null);
    const hp = (id: number) => world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)?.current ?? 0;
    const before = [hp(a), hp(b)];
    run(6);
    expect(world.hasEntity(bomber)).toBe(false);
    // Both beetles took the burst (or died of it)
    expect(hp(a)).toBeLessThanOrEqual(before[0] - BOMBER_BURST.damage * 0.5);
    expect(hp(b)).toBeLessThanOrEqual(before[1] - BOMBER_BURST.damage * 0.5);
    game.stop();
  });

  it('holds a post around the mound when no enemy is in sight', () => {
    const { game, world, nest, run } = setup();
    const bomber = createAnt(world, nest.x + 1, nest.y, AntRole.Bomber);
    world.getComponent<LayerComponent>(bomber, COMPONENT.LAYER)!.layer = Layer.Surface;
    run(8);
    expect(world.hasEntity(bomber)).toBe(true);
    const pos = world.getComponent<PositionComponent>(bomber, COMPONENT.POSITION)!;
    expect(Math.hypot(pos.x - nest.x, pos.y - nest.y)).toBeLessThan(7);
    game.stop();
  });

  it('can be bred from the queen', () => {
    const { game } = setup();
    expect(game.getBreedCost(AntRole.Bomber)).toBeGreaterThan(0);
    game.stop();
  });
});
