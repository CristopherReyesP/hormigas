import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, type AntComponent, type CarryingComponent } from '../components/components';
import type { RivalId } from '../run/RunSetup';
import { FactionId } from '../factions/factions';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';
import { captureSave, restoreSave, serializeState } from './snapshot';
import { SAVE_VERSION, parseSave, stringifySave } from './format';
import { stateDiff } from './stateDiff';

// Real manager and map; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());
// Whole runs simulated for tens of seconds: generous under a loaded CI machine
vi.setConfig({ testTimeout: 120_000 });

const DT = 1 / 60;
const RIVALS: RivalId[] = ['wildlife', 'crystal', 'human'];

type Drivable = { update(dt: number): void };

function run(game: GameManager, seconds: number): void {
  const g = game as unknown as Drivable;
  for (let i = 0; i < Math.round(seconds / DT); i++) g['update'](DT);
}

function newRun(rival: RivalId): GameManager {
  const game = new GameManager(fakeCanvas(), { playerRace: 'swarm', rivalRace: rival });
  finishIntro(game);
  return game;
}

function keyQuantities(game: GameManager) {
  const stats = game.getStats();
  return {
    ants: stats.antCount,
    pantry: stats.pantryStored,
    minerals: stats.mineralsStored,
    day: stats.dayNumber,
    phase: stats.dayPhase,
    wave: stats.invasion.waveNumber,
    entities: (game['world'] as World).getEntityCount(),
  };
}

describe.each(RIVALS)('save round trip: Swarm vs %s', (rival) => {
  it('save → load → save gives the same serialized state', () => {
    const a = newRun(rival);
    run(a, 20);
    const save = captureSave(a);
    expect(save.version).toBe(SAVE_VERSION);
    const b = restoreSave(fakeCanvas(), parseSaveOk(stringifySave(save)));
    expectSameState(b, a);
    a.stop();
    b.stop();
  });

  it('the restored run keeps simulating without errors, with the same key quantities', () => {
    const a = newRun(rival);
    run(a, 15);
    const b = restoreSave(fakeCanvas(), parseSaveOk(stringifySave(captureSave(a))));
    expect(keyQuantities(b)).toEqual(keyQuantities(a));
    const errors = vi.spyOn(console, 'error');
    run(b, 10);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    a.stop();
    b.stop();
  });

  it('continues identically: both runs stay in lockstep after the load', () => {
    const a = newRun(rival);
    run(a, 10);
    const b = restoreSave(fakeCanvas(), parseSaveOk(stringifySave(captureSave(a))));
    run(a, 8);
    run(b, 8);
    expectSameState(b, a);
    a.stop();
    b.stop();
  });

  it('round-trips in the middle of a night wave, and both runs stay in lockstep', () => {
    const a = newRun(rival);
    run(a, 5);
    (a['dayNightSystem'] as unknown as { phaseTimer: number }).phaseTimer = 0.2;
    run(a, 4);
    expect(a.getStats().dayPhase).toBe('night');
    expect(a.getStats().invasion.waveNumber).toBeGreaterThanOrEqual(1);
    const b = restoreSave(fakeCanvas(), parseSaveOk(stringifySave(captureSave(a))));
    expect(keyQuantities(b)).toEqual(keyQuantities(a));
    run(a, 6);
    run(b, 6);
    expectSameState(b, a);
    a.stop();
    b.stop();
  });

  it('entity ids and references between entities survive', () => {
    const a = newRun(rival);
    run(a, 12);
    const worldA = a['world'] as World;
    const b = restoreSave(fakeCanvas(), parseSaveOk(stringifySave(captureSave(a))));
    const worldB = b['world'] as World;
    // Ids keep allocating where the old run left off
    expect(worldB.createEntity()).toBe(worldA.createEntity());
    // Ant targets point at living entities of the same kind as before
    for (const id of worldA.query(COMPONENT.ANT)) {
      const antA = worldA.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      const antB = worldB.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      expect(antB).toEqual(antA);
      if (antB.commandTargetId != null) expect(worldB.hasEntity(antB.commandTargetId)).toBe(worldA.hasEntity(antA.commandTargetId!));
      const carryA = worldA.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
      expect(worldB.getComponent(id, COMPONENT.CARRYING)).toEqual(carryA);
    }
    const coreA = worldA.factions.get(FactionId.RIVAL)?.coreId ?? null;
    const coreB = worldB.factions.get(FactionId.RIVAL)?.coreId ?? null;
    expect(coreB).toBe(coreA);
    if (coreB !== null) expect(worldB.hasEntity(coreB)).toBe(true);
    expect(b['rivalCoreId']).toBe(a['rivalCoreId']);
    a.stop();
    b.stop();
  });
});

describe('save details', () => {
  it('keeps the run setup, the crater and the mineral bank', () => {
    const a = newRun('crystal');
    run(a, 5);
    (a['world'] as World).minerals.deposit(37);
    const b = restoreSave(fakeCanvas(), parseSaveOk(stringifySave(captureSave(a))));
    expect(b.getRunSetup()).toEqual({ playerRace: 'swarm', rivalRace: 'crystal' });
    expect(b.getCraterSite()).toEqual(a.getCraterSite());
    expect((b['world'] as World).minerals.stored).toBe((a['world'] as World).minerals.stored);
    a.stop();
    b.stop();
  });

  it('does not save the selection', () => {
    const a = newRun('wildlife');
    run(a, 2);
    const ant = (a['world'] as World).query(COMPONENT.ANT)[0];
    a.selectOnly(ant);
    const b = restoreSave(fakeCanvas(), parseSaveOk(stringifySave(captureSave(a))));
    expect(b.getStats().selectedEntity).toBeNull();
    expect(b.getStats().selectedGroup ?? null).toBeNull();
    a.stop();
    b.stop();
  });

  it('carries metadata for the slot list', () => {
    const a = newRun('human');
    run(a, 3);
    const save = captureSave(a, 1_700_000_000_000);
    expect(save.meta).toMatchObject({ playerRace: 'swarm', rivalRace: 'human', day: 1, savedAt: 1_700_000_000_000 });
    expect(save.meta.ants).toBeGreaterThan(0);
    a.stop();
  });
});

describe('rejecting bad saves', () => {
  it('rejects text that is not a save', () => {
    expect(parseSave('not json')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseSave('{"hello":1}')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseSave('')).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('rejects a save from an incompatible version', () => {
    const a = newRun('wildlife');
    const save = captureSave(a);
    const old = stringifySave({ ...save, version: 0 });
    expect(parseSave(old)).toEqual({ ok: false, reason: 'incompatible', meta: save.meta });
    const future = stringifySave({ ...save, version: SAVE_VERSION + 1 });
    expect(parseSave(future)).toMatchObject({ ok: false, reason: 'incompatible' });
    a.stop();
  });

  it('rejects a truncated save without throwing', () => {
    const a = newRun('wildlife');
    const text = stringifySave(captureSave(a));
    expect(parseSave(text.slice(0, Math.floor(text.length / 2)))).toMatchObject({ ok: false });
    a.stop();
  });

  it('a save whose state does not fit the game is rejected by restore, not crashed on', () => {
    const a = newRun('wildlife');
    const save = captureSave(a);
    const broken = { ...save, state: { ...save.state, world: 42 } };
    expect(() => restoreSave(fakeCanvas(), broken as never)).toThrow(/partida/i);
    a.stop();
  });
});

function parseSaveOk(text: string) {
  const parsed = parseSave(text);
  if (!parsed.ok) throw new Error(`save rejected: ${parsed.reason}`);
  return parsed.save;
}

function expectSameState(actual: GameManager, expected: GameManager): void {
  const a = serializeState(actual);
  const b = serializeState(expected);
  expect(stateDiff(JSON.parse(a), JSON.parse(b))).toEqual([]);
  expect(a).toBe(b);
}
