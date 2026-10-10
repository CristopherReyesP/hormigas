import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { AntState, COMPONENT, type AntComponent } from '../components/components';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';
import { captureSave, restoreSave, serializeState } from './snapshot';
import { parseSave, stringifySave } from './format';
import { stateDiff } from './stateDiff';

vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());
vi.setConfig({ testTimeout: 120_000 });

const DT = 1 / 60;

function start(rival: 'wildlife' | 'crystal' | 'human' = 'wildlife'): GameManager {
  const game = new GameManager(fakeCanvas(), { playerRace: 'swarm', rivalRace: rival });
  finishIntro(game);
  return game;
}

function run(game: GameManager, seconds: number): void {
  const g = game as unknown as { update(dt: number): void };
  for (let i = 0; i < Math.round(seconds / DT); i++) g['update'](DT);
}

function reload(game: GameManager): GameManager {
  const parsed = parseSave(stringifySave(captureSave(game)));
  if (!parsed.ok) throw new Error(parsed.reason);
  return restoreSave(fakeCanvas(), parsed.save);
}

function expectSameState(actual: GameManager, expected: GameManager): void {
  const a = serializeState(actual);
  const b = serializeState(expected);
  expect(stateDiff(JSON.parse(a), JSON.parse(b))).toEqual([]);
  expect(a).toBe(b);
}

/** A ripe 3x2 fungus farm right under the starting pantry */
function ripeFarm(game: GameManager): void {
  const grid = game['undergroundGrid'] as UndergroundGrid;
  const pantry = grid.getPantryTiles();
  const minX = Math.min(...pantry.map((t) => t.x));
  const maxY = Math.max(...pantry.map((t) => t.y));
  for (let y = maxY + 1; y <= maxY + 2; y++) {
    for (let x = minX; x < minX + 3; x++) {
      grid.designate(x, y);
      grid.excavate(x, y);
      expect(game.designateFarm(x, y)).toBe(true);
      grid.depositFood(x, y, 'mushroom', grid.getPantryTileCapacity());
    }
  }
}

describe('saving the fungus farm harvest', () => {
  it('a nurse mid-harvest keeps her job, and the run continues in lockstep', () => {
    const a = start();
    ripeFarm(a);
    const world = a['world'] as World;
    const harvesting = () => world.query(COMPONENT.ANT).filter((id) => {
      const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      return ant.state === AntState.FarmHarvesting && ant.farmHarvest;
    });
    for (let i = 0; i < 120 * 60 && harvesting().length === 0; i++) run(a, DT);
    expect(harvesting().length).toBeGreaterThan(0);
    const b = reload(a);
    const worldB = b['world'] as World;
    for (const id of harvesting()) {
      expect(worldB.getComponent<AntComponent>(id, COMPONENT.ANT)).toEqual(world.getComponent<AntComponent>(id, COMPONENT.ANT));
    }
    expectSameState(b, a);
    run(a, 8);
    run(b, 8);
    expectSameState(b, a);
    a.stop();
    b.stop();
  });
});

describe('saving the dawn pick, milestones and the night record', () => {
  it('a pending offer reopens after the load; the highlighted card is cleared', () => {
    const a = start();
    a['openMutationOffer']();
    const offer = a.getStats().mutationOffer!;
    expect(offer).not.toBeNull();
    expect(a.selectMutation(offer.options[0].id)).toBe(true);
    expect(a.getStats().mutationSelection).toBe(offer.options[0].id);
    const b = reload(a);
    expect(b.getStats().mutationOffer).toEqual(offer);
    expect(b.getStats().mutationSelection).toBeNull();
    expect(b.isPaused()).toBe(true);
    // The player picks again and the run goes on
    expect(b.selectMutation(offer.options[1].id)).toBe(true);
    expect(b.confirmMutation()).toBe(true);
    expect(b.getAppliedMutations()).toEqual([offer.options[1].id]);
    a.stop();
    b.stop();
  });

  it('the milestone banner is not saved; the record the run started from is', () => {
    const a = start();
    (a as unknown as { runStartBest: number }).runStartBest = 9;
    a['milestone'] = { info: { night: 7, title: 'x', minerals: 1, food: 1, foodUnit: 'comida' }, remaining: 3 };
    expect(a.getStats().milestone).not.toBeNull();
    const b = reload(a);
    expect(b.getStats().milestone ?? null).toBeNull();
    expect((b as unknown as { runStartBest: number }).runStartBest).toBe(9);
    a.stop();
    b.stop();
  });
});

describe('saving an endless run past victory', () => {
  it('a won run saved at the victory screen can go on after the load, without the rival raids', () => {
    const a = start('crystal');
    const world = a['world'] as World;
    world.destroyEntity(a['rivalCoreId'] as number);
    run(a, DT);
    expect(a.getStats().gameOver?.outcome).toBe('victory');
    const atVictory = reload(a);
    expect(atVictory.getStats().gameOver?.outcome).toBe('victory');
    expect(atVictory.continueAfterVictory()).toBe(true);
    atVictory.stop();

    expect(a.continueAfterVictory()).toBe(true);
    run(a, 2);
    const b = reload(a);
    expect(b['rivalCoreId']).toBeNull();
    expect(b.getStats().gameOver).toBeNull();
    const raids = (g: GameManager) => (g['invasionSystem'] as unknown as { raidSource: unknown }).raidSource;
    expect(raids(a)).toBeNull();
    expect(raids(b)).toBeNull();
    run(a, 6);
    run(b, 6);
    expectSameState(b, a);
    a.stop();
    b.stop();
  });
});
