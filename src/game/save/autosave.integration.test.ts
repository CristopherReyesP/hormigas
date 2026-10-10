import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';
import { Autosaver } from './autosave';
import { SaveStorage } from './storage';
import type { SaveFile } from './format';

vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());
// Whole runs simulated for tens of seconds: generous under a loaded CI machine
vi.setConfig({ testTimeout: 120_000 });

const DT = 1 / 60;

function run(game: GameManager, seconds: number): void {
  const g = game as unknown as { update(dt: number): void };
  for (let i = 0; i < Math.round(seconds / DT); i++) g['update'](DT);
}

/** Records writes instead of storing them */
function recordingStorage(fail = false) {
  const writes: Array<{ slot: string; save: SaveFile }> = [];
  const removed: string[] = [];
  const storage = {
    write: vi.fn(async (slot: string, save: SaveFile) => {
      writes.push({ slot, save });
      return fail ? { ok: false as const, error: 'lleno' } : { ok: true as const, backend: 'local' as const, bytes: 1 };
    }),
    remove: vi.fn(async (slot: string) => {
      removed.push(slot);
      return true;
    }),
  };
  return { storage: storage as unknown as SaveStorage, writes, removed };
}

function fakePage() {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const win = new EventTarget();
  return { doc, win };
}

function setup(fail = false) {
  const game = new GameManager(fakeCanvas(), { playerRace: 'swarm', rivalRace: 'wildlife' });
  finishIntro(game);
  const { storage, writes, removed } = recordingStorage(fail);
  const { doc, win } = fakePage();
  const errors: string[] = [];
  const saver = new Autosaver(game, storage, { doc, win, onError: (m) => errors.push(m) });
  saver.attach();
  return { game, saver, writes, removed, doc, win, errors };
}

describe('Autosaver', () => {
  it('saves to the autosave slot every 60 s of game time', () => {
    const { game, saver, writes } = setup();
    run(game, 59);
    expect(writes).toHaveLength(0);
    run(game, 2);
    expect(writes).toHaveLength(1);
    expect(writes[0].slot).toBe('auto');
    expect(writes[0].save.meta.ticks).toBeGreaterThanOrEqual(0);
    run(game, 60);
    expect(writes).toHaveLength(2);
    saver.detach();
    game.stop();
  });

  it('pausing stops the clock: no ticks, no autosave', () => {
    const { game, saver, writes } = setup();
    game.setPaused(true);
    // The loop does not call update while paused; nothing else should save
    expect(writes).toHaveLength(0);
    saver.detach();
    game.stop();
  });

  it('saves at dawn', () => {
    const { game, saver, writes } = setup();
    const dayNight = game['dayNightSystem'] as unknown as { phaseTimer: number };
    dayNight.phaseTimer = 0.1; // dusk
    run(game, 0.5);
    const atNight = writes.length;
    dayNight.phaseTimer = 0.1; // the night ends
    run(game, 0.5);
    expect(writes.length).toBe(atNight + 1);
    expect(writes.at(-1)!.save.meta.day).toBe(2);
    saver.detach();
    game.stop();
  });

  it('saves when the page is hidden or closed (phones kill backgrounded apps)', () => {
    const { game, saver, writes, doc, win } = setup();
    run(game, 1);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(writes).toHaveLength(1);
    win.dispatchEvent(new Event('pagehide'));
    expect(writes).toHaveLength(2);
    // Coming back is not a save
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(writes).toHaveLength(2);
    saver.detach();
    win.dispatchEvent(new Event('pagehide'));
    expect(writes).toHaveLength(2);
    game.stop();
  });

  it('does not save during the opening cinematic', () => {
    const game = new GameManager(fakeCanvas(), { playerRace: 'swarm', rivalRace: 'wildlife' });
    const { storage, writes } = recordingStorage();
    const { doc, win } = fakePage();
    const saver = new Autosaver(game, storage, { doc, win });
    saver.attach();
    win.dispatchEvent(new Event('pagehide'));
    expect(writes).toHaveLength(0);
    saver.detach();
    game.stop();
  });

  it('a failing storage shows an error and the run goes on', async () => {
    const { game, saver, writes, win, errors } = setup(true);
    run(game, 1);
    win.dispatchEvent(new Event('pagehide'));
    expect(writes).toHaveLength(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toHaveLength(1);
    expect(() => run(game, 2)).not.toThrow();
    saver.detach();
    game.stop();
  });

  it('a capture that throws is reported, not thrown', () => {
    const { game, saver, errors } = setup();
    (game as unknown as { getStats: () => never }).getStats = () => {
      throw new Error('boom');
    };
    expect(() => saver.saveNow()).not.toThrow();
    expect(errors).toHaveLength(1);
    saver.detach();
    game.stop();
  });

  it('a finished run deletes its autosave instead of saving', () => {
    const { game, saver, writes, removed } = setup();
    run(game, 1);
    (game as unknown as { gameOver: unknown }).gameOver = { outcome: 'defeat' };
    saver.saveNow();
    expect(writes).toHaveLength(0);
    expect(removed).toEqual(['auto']);
    saver.detach();
    game.stop();
  });

  it('the tick that ends the run deletes the autosave', () => {
    const { game, saver, writes, removed } = setup();
    run(game, 1);
    const world = game['world'] as unknown as { destroyEntity(id: number): void; query(c: string): number[] };
    for (const queen of world.query('queen_entity')) world.destroyEntity(queen);
    run(game, DT);
    expect(game.getStats().gameOver?.outcome).toBe('defeat');
    expect(removed).toEqual(['auto']);
    expect(writes).toHaveLength(0);
    saver.detach();
    game.stop();
  });
});
