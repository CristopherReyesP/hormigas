import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, type HealthComponent } from '../components/components';
import type { DayNightSystem } from '../systems/DayNightSystem';
import type { UndergroundInvasionSystem } from '../systems/UndergroundInvasionSystem';
import { fakeCanvas, finishIntro, CRYSTAL_RIVAL_SETUP } from '../../test/gameManagerMocks';
import { nightMilestone } from './nightMilestones';
import { BEST_NIGHT_KEY } from './nightRecord';

// Real manager and simulation; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());
// Each test stubs its own localStorage (the night record)

const TICK = 1 / 60;

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

function setup() {
  const game = new GameManager(fakeCanvas(), CRYSTAL_RIVAL_SETUP);
  finishIntro(game);
  const world = game['world'] as World;
  const dayNight = game['dayNightSystem'] as DayNightSystem;
  const invasion = game['invasionSystem'] as UndergroundInvasionSystem;
  const tick = () => game['update'](TICK);
  const pickIfOffered = () => {
    const offer = game.getStats().mutationOffer;
    if (offer) game.chooseMutation(offer.options[0].id);
    return offer !== null;
  };
  /** Wipe out the wave on now, as a perfect defense would, so the next night sends the next wave */
  const clearWave = () => {
    (invasion['pendingSpawns'] as unknown[]).length = 0;
    for (const id of [...(invasion['invaders'] as Set<number>)]) world.destroyEntity(id);
    tick();
  };
  /** From the day: one real tick at nightfall (the wave strikes), then one across dawn */
  const passNight = () => {
    if (dayNight.getPhase() === 'day') {
      dayNight.update(dayNight.getPhaseRemaining() - 0.001);
      tick();
    }
    clearWave();
    dayNight.update(dayNight.getPhaseRemaining() - 0.001);
    tick();
  };
  const killQueen = () => {
    for (const queen of world.query(COMPONENT.QUEEN_ENTITY)) {
      world.getComponent<HealthComponent>(queen, COMPONENT.HEALTH)!.current = 0;
    }
  };
  return { game, world, dayNight, invasion, tick, pickIfOffered, passNight, killQueen };
}

describe('the endless run, with the real GameManager', () => {
  it('survives to night 20: no victory at 7, a milestone at 7, 12 and 17, waves and offers keep coming', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const { game, world, dayNight, invasion, pickIfOffered, passNight } = setup();
    const celebrated: number[] = [];
    let offers = 0;
    for (let night = 1; night <= 20; night++) {
      const minerals = world.minerals.stored;
      passNight();
      expect(dayNight.getDayNumber()).toBe(night + 1);
      const stats = game.getStats();
      expect(stats.gameOver).toBeNull();
      expect(invasion.getInfo().waveNumber).toBe(night);
      const milestone = nightMilestone(night);
      if (milestone) {
        celebrated.push(night);
        expect(stats.milestone).toMatchObject({ night, title: milestone.title, minerals: milestone.reward.minerals });
        expect(world.minerals.stored - minerals).toBeGreaterThanOrEqual(milestone.reward.minerals);
        expect(stats.notifications.some((n) => n.message.includes(milestone.title))).toBe(true);
      }
      if (pickIfOffered()) offers++;
      expect(game.getStats().paused).toBe(false);
    }
    expect(celebrated).toEqual([7, 12, 17]);
    // The evolution chamber kept opening after night 7
    expect(offers).toBeGreaterThan(6);
    expect(game.getAppliedMutations().length).toBe(offers);
    // The wave after night 20 is still a real, capped wave
    expect(invasion.getInfo().waveSize).toBeGreaterThan(0);
    game.stop();
  });

  it('the queen dying still loses, with the nights survived and the record saved', () => {
    const storage = memoryStorage({ [BEST_NIGHT_KEY]: '3' });
    vi.stubGlobal('localStorage', storage);
    const { game, passNight, pickIfOffered, killQueen, tick } = setup();
    for (let night = 1; night <= 5; night++) {
      passNight();
      pickIfOffered();
    }
    killQueen();
    tick();
    const over = game.getStats().gameOver;
    expect(over).toMatchObject({ outcome: 'defeat', nightsSurvived: 5, bestNight: 5, newRecord: true });
    expect(storage.data.get(BEST_NIGHT_KEY)).toBe('5');
    expect(game.getStats().paused).toBe(true);
    expect(game.continueAfterVictory()).toBe(false);
    expect(game.getStats().gameOver?.outcome).toBe('defeat');
    game.stop();
  });

  it('keeps the older record and still ends the run when storage fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    });
    const { game, passNight, pickIfOffered, killQueen, tick } = setup();
    passNight();
    pickIfOffered();
    killQueen();
    tick();
    expect(game.getStats().gameOver).toMatchObject({ outcome: 'defeat', nightsSurvived: 1, bestNight: 1 });
    game.stop();
  });

  it('destroying the rival core is a victory, and Seguir jugando continues against the wildlife', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const { game, world, invasion, tick, passNight, pickIfOffered, killQueen } = setup();
    const hive = world.query(COMPONENT.CRYSTAL_HIVE)[0];
    world.destroyEntity(hive);
    tick();
    expect(game.getStats().gameOver).toMatchObject({ outcome: 'victory', rivalCoreDestroyed: 'crystal' });
    expect(game.getStats().paused).toBe(true);

    expect(game.continueAfterVictory()).toBe(true);
    expect(game.getStats().gameOver).toBeNull();
    expect(game.getStats().paused).toBe(false);
    expect(invasion['raidSource']).toBeNull();
    expect(game.getStats().notifications.some((n) => n.message.includes('fauna salvaje'))).toBe(true);

    // The endless run goes on: waves keep coming, now from the wildlife, and no second victory
    for (let night = 1; night <= 3; night++) {
      passNight();
      pickIfOffered();
      expect(game.getStats().gameOver).toBeNull();
    }
    expect(invasion.getInfo().waveNumber).toBe(3);
    expect(invasion['nextComposition']().drones).toBe(0);
    expect(game.continueAfterVictory()).toBe(false);

    // ...until the queen dies
    killQueen();
    tick();
    expect(game.getStats().gameOver).toMatchObject({ outcome: 'defeat', nightsSurvived: 3 });
    game.stop();
  });
});
