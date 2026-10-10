import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager, type GameStats } from '../GameManager';
import type { DayNightSystem } from '../systems/DayNightSystem';
import type { KeyPress } from '../../engine/input/InputManager';
import { OPEN_GUARD_MS, chamberKeyAction, runChamberAction, tapCardAction } from '../../ui/evolutionPick';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';

// The two-step dawn pick against the real manager: the overlay's tap and key
// mapping (ui/evolutionPick) drives GameManager's select/confirm API.
const keyHandlers = new Map<string, (press: KeyPress) => void>();
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager({
  onKeyAction(key: string, handler: (press: KeyPress) => void) { keyHandlers.set(key, handler); },
}));
vi.mock('../systems/RenderSystem', async () =>
  (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

function manager() {
  keyHandlers.clear();
  const game = new GameManager(fakeCanvas());
  finishIntro(game);
  const published: GameStats[] = [];
  game.onStats(stats => published.push(stats));
  return { game, published };
}

function press(code: string) {
  keyHandlers.get(code)?.({ shift: false, ctrl: false, repeat: false });
}

function reachNextDawn(game: GameManager) {
  const dayNight = game['dayNightSystem'] as DayNightSystem;
  if (dayNight.getPhase() === 'day') dayNight.update(dayNight.getPhaseRemaining());
  dayNight.update(dayNight.getPhaseRemaining() - 0.001);
  game['update'](1 / 60);
}

/** A tap on card `index`, `ms` after the chamber opened, as the overlay handles it. */
function tap(game: GameManager, index: number, ms = OPEN_GUARD_MS + 100) {
  const { mutationOffer, mutationSelection } = game.getStats();
  const action = tapCardAction(mutationSelection, mutationOffer!.options[index].id, ms);
  if (action) runChamberAction(game, action);
}

/** A key the overlay itself listens to (Enter, Escape). */
function overlayKey(game: GameManager, code: string) {
  const action = chamberKeyAction(code, game.getStats().mutationSelection);
  if (action) runChamberAction(game, action);
}

afterEach(() => vi.restoreAllMocks());

describe('two-step evolution pick', () => {
  it('one tap only selects: nothing is applied and the run stays paused', () => {
    const { game, published } = manager();
    reachNextDawn(game);
    const first = game.getStats().mutationOffer!.options[0].id;

    tap(game, 0);
    expect(game.getAppliedMutations()).toEqual([]);
    expect(game.getStats()).toMatchObject({ mutationSelection: first, paused: true });
    expect(game.getStats().mutationOffer).not.toBeNull();
    expect(published.at(-1)?.mutationSelection).toBe(first);
  });

  it('confirm applies the selected card and resumes', () => {
    const { game } = manager();
    reachNextDawn(game);
    const second = game.getStats().mutationOffer!.options[1].id;

    tap(game, 1);
    expect(game.confirmMutation()).toBe(true);
    expect(game.getAppliedMutations()).toEqual([second]);
    expect(game.getStats()).toMatchObject({ mutationOffer: null, mutationSelection: null, paused: false, lastMutationPick: second });
  });

  it('confirm with nothing selected does nothing', () => {
    const { game } = manager();
    reachNextDawn(game);
    expect(game.confirmMutation()).toBe(false);
    expect(game.getAppliedMutations()).toEqual([]);
    expect(game.getStats().mutationOffer).not.toBeNull();
  });

  it('a tap on another card moves the selection; a tap on the selected one clears it', () => {
    const { game } = manager();
    reachNextDawn(game);
    const [a, b] = game.getStats().mutationOffer!.options.map(option => option.id);

    tap(game, 0);
    tap(game, 1);
    expect(game.getStats().mutationSelection).toBe(b);
    tap(game, 1);
    expect(game.getStats().mutationSelection).toBeNull();
    tap(game, 0);
    expect(game.confirmMutation()).toBe(true);
    expect(game.getAppliedMutations()).toEqual([a]);
  });

  it('keyboard: digits select, Escape deselects, Enter confirms', () => {
    const { game } = manager();
    reachNextDawn(game);
    const [, second, third] = game.getStats().mutationOffer!.options.map(option => option.id);

    press('Digit2');
    expect(game.getAppliedMutations()).toEqual([]);
    expect(game.getStats().mutationSelection).toBe(second);
    press('Digit3');
    expect(game.getStats().mutationSelection).toBe(third);
    overlayKey(game, 'Escape');
    expect(game.getStats().mutationSelection).toBeNull();
    overlayKey(game, 'Enter');
    expect(game.getAppliedMutations()).toEqual([]);
    press('Digit3');
    overlayKey(game, 'Enter');
    expect(game.getAppliedMutations()).toEqual([third]);
    expect(game.getStats()).toMatchObject({ mutationOffer: null, paused: false, speed: 1 });
  });

  it('ignores taps that land right as the chamber opens', () => {
    const { game } = manager();
    reachNextDawn(game);
    tap(game, 0, 50);
    tap(game, 0, OPEN_GUARD_MS - 1);
    expect(game.getStats().mutationSelection).toBeNull();
    tap(game, 0, OPEN_GUARD_MS);
    expect(game.getStats().mutationSelection).toBe(game.getStats().mutationOffer!.options[0].id);
  });

  it('has no timeout: the offer waits, selected or not, however long the player takes', () => {
    const { game } = manager();
    reachNextDawn(game);
    for (let i = 0; i < 600; i++) game['update'](1);
    expect(game.getStats().mutationOffer).not.toBeNull();
    tap(game, 2);
    for (let i = 0; i < 600; i++) game['update'](1);
    expect(game.getAppliedMutations()).toEqual([]);
    expect(game.getStats()).toMatchObject({ paused: true, mutationSelection: game.getStats().mutationOffer!.options[2].id });
  });

  it('a selection never leaks into the next dawn', () => {
    const { game } = manager();
    reachNextDawn(game);
    press('Digit1');
    overlayKey(game, 'Enter');
    reachNextDawn(game);
    expect(game.getStats().mutationOffer?.dayNumber).toBe(3);
    expect(game.getStats().mutationSelection).toBeNull();
  });

  it('rejects selecting an id outside the offer or with no offer pending', () => {
    const { game } = manager();
    expect(game.selectMutation('acid_mandibles')).toBe(false);
    reachNextDawn(game);
    expect(game.selectMutation('not_a_mutation')).toBe(false);
    expect(game.getStats().mutationSelection).toBeNull();
  });
});
