import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import { AntRole, COMPONENT } from '../components/components';
import { createAnt } from '../entities/factories';
import type { DayNightSystem } from '../systems/DayNightSystem';
import type { KeyPress } from '../../engine/input/InputManager';
import { TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { finishIntro } from '../../test/gameManagerMocks';

// Real manager and simulation; browser-only adapters are replaced. The input mock
// records key handlers so the tests can press the game's hotkeys with modifiers.
const keyHandlers = new Map<string, (press: KeyPress) => void>();
vi.mock('../../engine/input/InputManager', () => ({ InputManager: class {
  setCamera() {} onCanvasClick() {} destroy() {} getDragBox() { return null; }
  onKeyAction(key: string, handler: (press: KeyPress) => void) { keyHandlers.set(key, handler); }
} }));
vi.mock('../systems/RenderSystem', () => ({ RenderSystem: class {
  setCamera() {} setUndergroundContext() {} setDayPhaseProvider() {}
  setFarmStatusProvider() {} setFarmFocusProvider() {} queueFarmHarvest() {} setWaveOverlayProvider() {} setDigOverlayProvider() {} invalidateTerrain() {} startMeteorIntro() {} skipIntro() {}
} }));
vi.stubGlobal('window', new EventTarget());

const NX = Math.floor(WORLD_WIDTH / 2);
const NY = Math.floor(WORLD_HEIGHT / 2);

function manager() {
  keyHandlers.clear();
  const game = new GameManager(Object.assign(new EventTarget(), { getContext: () => ({}) }) as unknown as HTMLCanvasElement);
  finishIntro(game);
  return game;
}

function press(code: string, mods: Partial<KeyPress> = {}) {
  keyHandlers.get(code)?.({ shift: false, ctrl: false, repeat: false, ...mods });
}

/** Three soldiers and a worker off the nest, with the soldiers selected. */
function squad(game: GameManager) {
  const world = game['world'];
  const soldiers = [0, 1, 2].map((i) => createAnt(world, NX + 10 + i, NY + 6, AntRole.Soldier));
  const worker = createAnt(world, NX - 8, NY - 4, AntRole.Worker);
  game['selectionSystem'].selectAnts(soldiers, 'surface');
  return { world, soldiers, worker };
}

const selected = (game: GameManager) => [...game['selectionSystem'].getSelectedIds()];

function reachNextDawn(game: GameManager) {
  const dayNight = game['dayNightSystem'] as DayNightSystem;
  if (dayNight.getPhase() === 'day') dayNight.update(dayNight.getPhaseRemaining());
  dayNight.update(dayNight.getPhaseRemaining() - 0.001);
  game['update'](1 / 60);
}

afterEach(() => vi.restoreAllMocks());

describe('control groups on the digit keys', () => {
  it('Ctrl+digit binds the selection, the digit recalls it, Shift+digit adds to it', () => {
    const game = manager();
    const { soldiers, worker } = squad(game);
    press('Digit1', { ctrl: true });
    game.clearSelection();
    expect(selected(game)).toEqual([]);

    press('Digit1');
    expect(selected(game)).toEqual(soldiers);

    game['selectionSystem'].selectAnts([worker], 'surface');
    press('Digit1', { shift: true });
    expect(selected(game)).toEqual([worker]); // adding does not change the selection
    press('Digit1');
    expect(selected(game)).toEqual([...soldiers, worker]);
    expect(game.getStats().controlGroups).toEqual([
      { slot: 1, count: 4, role: AntRole.Soldier, selected: true },
    ]);
  });

  it('a recall drops the dead from the group', () => {
    const game = manager();
    const { world, soldiers } = squad(game);
    press('Digit4', { ctrl: true });
    world.destroyEntity(soldiers[1]);
    game.clearSelection();
    press('Digit4');
    expect(selected(game)).toEqual([soldiers[0], soldiers[2]]);
    expect(game.getStats().controlGroups?.[0]).toMatchObject({ slot: 4, count: 2 });
  });

  it('a double tap centers the camera on the group, unless the intro directs it', () => {
    const game = manager();
    const { soldiers } = squad(game);
    press('Digit2', { ctrl: true });
    const camera = game['camera'];
    const centerOn = vi.spyOn(camera, 'centerOn');
    const now = vi.spyOn(performance, 'now');

    now.mockReturnValue(10_000);
    press('Digit2');
    expect(centerOn).not.toHaveBeenCalled();
    now.mockReturnValue(10_200);
    press('Digit2');
    expect(selected(game)).toEqual(soldiers);
    expect(centerOn).toHaveBeenCalledWith((NX + 11) * TILE_SIZE + TILE_SIZE / 2, (NY + 6) * TILE_SIZE + TILE_SIZE / 2);

    centerOn.mockClear();
    vi.spyOn(camera, 'isDirected').mockReturnValue(true);
    now.mockReturnValue(20_000);
    press('Digit2');
    now.mockReturnValue(20_100);
    press('Digit2');
    expect(centerOn).not.toHaveBeenCalled();
  });

  it('holding a digit down does not repeat', () => {
    const game = manager();
    const { soldiers, worker } = squad(game);
    press('Digit3', { ctrl: true });
    game['selectionSystem'].selectAnts([worker], 'surface');
    press('Digit3', { repeat: true });
    press('Digit3', { ctrl: true, repeat: true });
    expect(selected(game)).toEqual([worker]);
    game.clearSelection();
    press('Digit3');
    expect(selected(game)).toEqual(soldiers);
    expect(game.getStats().speed).toBe(1);
  });

  it('digits select a card while the dawn offer is open, and never touch the groups', () => {
    const game = manager();
    const { worker } = squad(game);
    press('Digit2', { ctrl: true });
    game['selectionSystem'].selectAnts([worker], 'surface');
    reachNextDawn(game);
    const second = game.getStats().mutationOffer!.options[1].id;

    press('Digit1', { ctrl: true });
    expect(game.getAppliedMutations()).toEqual([]);
    expect(game.getStats().mutationSelection).toBeNull();
    press('Digit2');
    expect(game.getAppliedMutations()).toEqual([]);
    expect(game.getStats().mutationSelection).toBe(second);
    game.confirmMutation();
    expect(game.getAppliedMutations()).toEqual([second]);
    expect(selected(game)).toEqual([worker]);
    expect(game.getStats().controlGroups?.map((g) => g.slot)).toEqual([2]);
  });

  it('ants below are not recalled while the surface is in view', () => {
    const game = manager();
    const { world, soldiers } = squad(game);
    press('Digit5', { ctrl: true });
    world.getComponent<{ layer: string }>(soldiers[0], COMPONENT.LAYER)!.layer = 'underground';
    game.clearSelection();
    press('Digit5');
    expect(selected(game)).toEqual([soldiers[1], soldiers[2]]);
  });

  it('a chip click recalls its group like the digit', () => {
    const game = manager();
    const { soldiers } = squad(game);
    press('Digit6', { ctrl: true });
    game.clearSelection();
    expect(game.recallControlGroup(6)).toBe(3);
    expect(selected(game)).toEqual(soldiers);
    expect(game.recallControlGroup(7)).toBe(0);
  });

  it('the group chip shows the caste most of the group belongs to', () => {
    const game = manager();
    const world = game['world'];
    const workers = [0, 1, 2].map((i) => createAnt(world, NX + i, NY + 9, AntRole.Worker));
    const soldier = createAnt(world, NX + 5, NY + 9, AntRole.Soldier);
    game['selectionSystem'].selectAnts([...workers, soldier], 'surface');
    press('Digit9', { ctrl: true });
    game.clearSelection();
    expect(game.getStats().controlGroups).toEqual([{ slot: 9, count: 4, role: AntRole.Worker, selected: false }]);
  });
});

describe('game speed on + and -', () => {
  it('+ speeds up to ×3 and - slows down to ×1; the digits no longer touch it', () => {
    const game = manager();
    press('Digit3');
    expect(game.getStats().speed).toBe(1);
    press('+');
    expect(game.getStats().speed).toBe(2);
    press('=');
    expect(game.getStats().speed).toBe(3);
    press('+');
    expect(game.getStats().speed).toBe(3);
    press('-');
    expect(game.getStats().speed).toBe(2);
    press('-');
    press('-');
    expect(game.getStats().speed).toBe(1);
  });
});
