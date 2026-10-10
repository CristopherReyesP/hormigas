import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import { fakeCanvas } from '../../test/gameManagerMocks';
import { INITIAL_ANTS, TILE_SIZE } from '../../shared/constants';
import {
  AntRole,
  AntState,
  COMPONENT,
  Layer,
  type AntComponent,
  type LayerComponent,
  type PositionComponent,
} from '../components/components';

// Real manager, world, systems and intro clock; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () =>
  (await import('../../test/gameManagerMocks')).mockRenderSystem());
// The intro-skip listeners hang off window and the canvas; node has neither.
vi.stubGlobal('window', new EventTarget());

const FRAME = 1 / 60;
/** Thirty seconds of 60 fps frames: an intro that runs past this is broken, not slow. */
const MAX_FRAMES = 60 * 30;
const games: GameManager[] = [];

afterEach(() => {
  for (const game of games.splice(0)) game.stop();
});

/** Every starting worker, with what the surface renderer needs to draw it. */
function startingWorkers(game: GameManager) {
  const world = game['world'];
  return world.query(COMPONENT.ANT, COMPONENT.POSITION).flatMap((id) => {
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    if (ant.role !== AntRole.Worker) return [];
    return [{
      state: ant.state,
      layer: world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer,
      pos: world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!,
    }];
  });
}

describe('the starting colony after the opening cinematic', () => {
  it('is still on the surface, beside the nest and in view, when the player gets control', () => {
    const game = new GameManager(fakeCanvas());
    games.push(game);
    const clock = game['introClock'];

    // What the GameLoop does every frame: a fixed simulation step, then a render
    for (let i = 0; i < MAX_FRAMES && clock.isPlaying(); i++) {
      game['update'](FRAME);
      game['render'](0, FRAME);
    }
    expect(clock.isPlaying()).toBe(false);

    // Before the fix the world ran under the cinematic: every worker foraged,
    // came home loaded and rode the shaft down as a Hauler, so the surface the
    // camera returned to was empty for the next half minute.
    const workers = startingWorkers(game);
    expect(workers).toHaveLength(INITIAL_ANTS);
    for (const w of workers) {
      expect(w.layer).toBe(Layer.Surface);
      expect(w.state).not.toBe(AntState.Hauling);
    }

    const camera = game['camera'];
    const view = camera.getCanvasWorldRect();
    for (const { pos } of workers) {
      const px = pos.x * TILE_SIZE + TILE_SIZE / 2;
      const py = pos.y * TILE_SIZE + TILE_SIZE / 2;
      expect(px).toBeGreaterThanOrEqual(view.x);
      expect(px).toBeLessThanOrEqual(view.x + view.w);
      expect(py).toBeGreaterThanOrEqual(view.y);
      expect(py).toBeLessThanOrEqual(view.y + view.h);
    }
  });

  it('does not tick the world while the intro plays (the wave timer waits for the player too)', () => {
    const game = new GameManager(fakeCanvas());
    games.push(game);
    const update = vi.spyOn(game['world'], 'update');
    expect(game['introClock'].isPlaying()).toBe(true);
    game['update'](FRAME);
    expect(update).not.toHaveBeenCalled();
  });
});
