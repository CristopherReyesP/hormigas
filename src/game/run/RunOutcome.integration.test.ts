import { describe, expect, it, vi } from 'vitest';
import { World } from '../../engine/ecs/World';
import { DAY_DURATION, NIGHT_DURATION, RUN_NIGHTS_TO_WIN } from '../../shared/constants';
import { GameManager, type GameOverStats } from '../GameManager';
import { COMPONENT } from '../components/components';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { DayNightSystem } from '../systems/DayNightSystem';
import { createSeededRng } from './MutationOffers';
import { RunModifiers } from './RunModifiers';

function setup() {
  const world = new World();
  const queen = world.createEntity();
  world.addComponent(queen, COMPONENT.QUEEN_ENTITY, {});
  const health = { current: 100, max: 100 };
  world.addComponent(queen, COMPONENT.HEALTH, health);
  const dayNightSystem = new DayNightSystem(world, createDefaultModifiers());
  world.addSystem(dayNightSystem);
  const update = vi.spyOn(world, 'update');
  let paused = false;
  const gameLoop = {
    getTickCount: () => 123,
    setPaused: vi.fn((value: boolean) => { paused = value; }),
    isPaused: () => paused,
  };
  const statsCallback = vi.fn();
  // Exercise manager orchestration without constructing canvas or input devices.
  const manager: GameManager = Object.assign(Object.create(GameManager.prototype), {
    world,
    dayNightSystem,
    gameLoop,
    gameOver: null,
    runModifiers: new RunModifiers(),
    offerRng: createSeededRng(1),
    mutationOffer: null,
    lastMutationPick: null,
    statsTicks: 0,
    statsCallback,
    getStats: () => ({ gameOver: state.gameOver, paused }),
  });
  const state = manager as unknown as {
    gameOver: GameOverStats | null;
    mutationOffer: { options: Array<{ id: string }> } | null;
    update: (dt: number) => void;
  };
  /** Dawns of days 2-7 open the evolution chamber; take the first card to keep going. */
  const pickIfOffered = () => {
    if (state.mutationOffer) manager.chooseMutation(state.mutationOffer.options[0].id);
  };
  return { manager, state, world, health, update, gameLoop, statsCallback, pickIfOffered };
}

describe('run outcome manager integration', () => {
  it('captures metrics, pauses, and immediately publishes at the final dawn only', () => {
    const { manager, state, world, gameLoop, statsCallback, pickIfOffered } = setup();
    for (let night = 1; night <= RUN_NIGHTS_TO_WIN; night++) {
      state.update(DAY_DURATION);
      expect(state.gameOver).toBeNull();
      statsCallback.mockClear();
      state.update(NIGHT_DURATION);
      if (night < RUN_NIGHTS_TO_WIN) expect(state.gameOver).toBeNull();
      pickIfOffered();
    }
    expect(manager.getAppliedMutations()).toHaveLength(RUN_NIGHTS_TO_WIN - 1);
    expect(state.gameOver).toEqual({
      outcome: 'victory', survivedTicks: 123, ...world.metrics, build: expect.any(Array),
    });
    expect(gameLoop.isPaused()).toBe(true);
    expect(statsCallback).toHaveBeenCalledWith({ gameOver: state.gameOver, paused: true });
  });

  it('publishes defeat if the queen dies during the final transition tick', () => {
    const { state, world, health, update, gameLoop, statsCallback, pickIfOffered } = setup();
    for (let night = 1; night < RUN_NIGHTS_TO_WIN; night++) {
      state.update(DAY_DURATION);
      state.update(NIGHT_DURATION);
      pickIfOffered();
    }
    state.update(DAY_DURATION);
    update.mockImplementationOnce((dt) => {
      World.prototype.update.call(world, dt);
      health.current = 0;
    });
    statsCallback.mockClear();
    state.update(NIGHT_DURATION);
    expect(state.gameOver?.outcome).toBe('defeat');
    expect(gameLoop.isPaused()).toBe(true);
    expect(statsCallback).toHaveBeenCalledWith({ gameOver: state.gameOver, paused: true });
  });

  it('does not resume or simulate further after the run ends', () => {
    const { manager, state, health, update, gameLoop } = setup();
    health.current = 0;
    state.update(0);
    update.mockClear();
    manager.togglePause();
    manager.setPaused(false);
    state.update(DAY_DURATION);
    expect(update).not.toHaveBeenCalled();
    expect(gameLoop.isPaused()).toBe(true);
    expect(state.gameOver?.outcome).toBe('defeat');
  });
});
