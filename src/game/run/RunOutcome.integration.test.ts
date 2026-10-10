import { describe, expect, it, vi } from 'vitest';
import { World } from '../../engine/ecs/World';
import { DAY_DURATION, NIGHT_DURATION } from '../../shared/constants';
import { GameManager, type GameOverStats } from '../GameManager';
import { COMPONENT } from '../components/components';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { DayNightSystem } from '../systems/DayNightSystem';
import { createSeededRng } from './MutationOffers';
import { RunModifiers } from './RunModifiers';

// No saved record: the run's own nights are the best
vi.stubGlobal('localStorage', undefined);

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
    introClock: { isPlaying: () => false }, // the run is past its opening cinematic
    runModifiers: new RunModifiers(),
    offerRng: createSeededRng(1),
    mutationOffer: null,
    lastMutationPick: null,
    statsTicks: 0,
    statsCallback,
    // Night milestones pay through the wave system; the record starts empty
    invasionSystem: { pay: (reward: { minerals: number; food: number }) => reward },
    milestone: null,
    runStartBest: 0,
    getStats: () => ({ gameOver: state.gameOver, paused }),
  });
  const state = manager as unknown as {
    gameOver: GameOverStats | null;
    mutationOffer: { options: Array<{ id: string }> } | null;
    update: (dt: number) => void;
  };
  /** Dawns from day 2 on open the evolution chamber; take the first card to keep going. */
  const pickIfOffered = () => {
    if (state.mutationOffer) manager.chooseMutation(state.mutationOffer.options[0].id);
  };
  return { manager, state, world, health, update, gameLoop, statsCallback, pickIfOffered };
}

describe('run outcome manager integration', () => {
  it('keeps going past the old final dawn, then captures metrics, pauses and publishes when the queen dies', () => {
    const { manager, state, world, health, gameLoop, statsCallback, pickIfOffered } = setup();
    for (let night = 1; night <= 9; night++) {
      state.update(DAY_DURATION);
      state.update(NIGHT_DURATION);
      expect(state.gameOver).toBeNull();
      pickIfOffered();
    }
    expect(manager.getAppliedMutations()).toHaveLength(9); // the dawns of days 2-10
    health.current = 0;
    statsCallback.mockClear();
    state.update(DAY_DURATION);
    expect(state.gameOver).toEqual({
      outcome: 'defeat', survivedTicks: 123, ...world.metrics, build: expect.any(Array),
      nightsSurvived: 9, bestNight: 9, newRecord: true,
    });
    expect(gameLoop.isPaused()).toBe(true);
    expect(statsCallback).toHaveBeenCalledWith({ gameOver: state.gameOver, paused: true });
  });

  it('publishes defeat if the queen dies on the tick of the seventh dawn', () => {
    const { state, world, health, update, gameLoop, statsCallback, pickIfOffered } = setup();
    for (let night = 1; night < 7; night++) {
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
