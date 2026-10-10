import { describe, expect, it, vi } from 'vitest';
import { GameManager, type GameOverStats } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, type HealthComponent, type PositionComponent } from '../components/components';
import { FactionId, ownerOf } from '../factions/factions';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';

// Real manager and map; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

function setup() {
  const game = new GameManager(fakeCanvas());
  finishIntro(game);
  const world = game['world'] as World;
  const state = game as unknown as { gameOver: GameOverStats | null; update: (dt: number) => void };
  const hives = world.query(COMPONENT.CRYSTAL_HIVE);
  return { game, world, state, hives };
}

describe('the Crystal Hive in a real run', () => {
  it('rises at the crater site, owned by the rival faction, registered as its core', () => {
    const { game, world, hives } = setup();
    expect(hives).toHaveLength(1);
    const pos = world.getComponent<PositionComponent>(hives[0], COMPONENT.POSITION)!;
    expect({ x: pos.x, y: pos.y }).toEqual(game.getCraterSite());
    expect(ownerOf(world, hives[0])).toBe(FactionId.RIVAL);
    expect(world.factions.get(FactionId.RIVAL)).toMatchObject({ race: 'crystal', controller: 'ai', coreId: hives[0] });
    game.stop();
  });

  it('destroying the hive ends the run in victory', () => {
    const { game, world, state, hives } = setup();
    world.getComponent<HealthComponent>(hives[0], COMPONENT.HEALTH)!.current = 0;
    world.destroyEntity(hives[0]);
    state.update(1 / 60);
    expect(state.gameOver?.outcome).toBe('victory');
    expect(state.gameOver?.hiveDestroyed).toBe(true);
    game.stop();
  });

  it('the run goes on while the hive stands', () => {
    const { game, state } = setup();
    state.update(1 / 60);
    expect(state.gameOver).toBeNull();
    game.stop();
  });

  it('a dead queen still loses the run, even on the tick the hive falls', () => {
    const { game, world, state, hives } = setup();
    world.destroyEntity(hives[0]);
    for (const queen of world.query(COMPONENT.QUEEN_ENTITY)) {
      world.getComponent<HealthComponent>(queen, COMPONENT.HEALTH)!.current = 0;
    }
    state.update(1 / 60);
    expect(state.gameOver?.outcome).toBe('defeat');
    game.stop();
  });
});
