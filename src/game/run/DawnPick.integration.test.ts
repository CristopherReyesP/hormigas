import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager, type GameStats } from '../GameManager';
import { COMPONENT, type HealthComponent } from '../components/components';
import type { DayNightSystem } from '../systems/DayNightSystem';
import type { KeyPress } from '../../engine/input/InputManager';
import { MUTATION_DEFINITIONS, MUTATION_IDS } from './MutationDefinitions';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';

// Real manager and simulation; browser-only adapters are replaced. The input mock
// records key handlers so the tests can press the game's hotkeys.
const keyHandlers = new Map<string, (press: KeyPress) => void>();
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager({
  onKeyAction(key: string, handler: (press: KeyPress) => void) { keyHandlers.set(key, handler); },
}));
vi.mock('../systems/RenderSystem', async () =>
  (await import('../../test/gameManagerMocks')).mockRenderSystem());
// The intro-skip listeners hang off window and the canvas; node has neither.
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

/** Skip to the last instant of the night, then run one real tick across dawn. */
function reachNextDawn(game: GameManager) {
  const dayNight = game['dayNightSystem'] as DayNightSystem;
  if (dayNight.getPhase() === 'day') dayNight.update(dayNight.getPhaseRemaining());
  dayNight.update(dayNight.getPhaseRemaining() - 0.001);
  game['update'](1 / 60);
}

afterEach(() => vi.restoreAllMocks());

describe('dawn mutation pick', () => {
  it('pauses at the dawn of day 2 and publishes an offer of 3 distinct valid mutations', () => {
    const { game, published } = manager();
    reachNextDawn(game);

    const offer = game.getStats().mutationOffer;
    expect(offer?.dayNumber).toBe(2);
    expect(offer?.options).toHaveLength(3);
    const ids = offer!.options.map(option => option.id);
    expect(new Set(ids).size).toBe(3);
    for (const option of offer!.options) {
      expect(MUTATION_IDS).toContain(option.id);
      expect(option).toMatchObject({ name: MUTATION_DEFINITIONS[option.id].name, stacks: 0, maxStacks: 3 });
    }
    expect(game.getStats().paused).toBe(true);
    expect(published.at(-1)).toMatchObject({ mutationOffer: offer, paused: true });
  });

  it('keeps the simulation frozen and ignores pause toggling until a card is chosen', () => {
    const { game } = manager();
    reachNextDawn(game);
    const update = vi.spyOn(game['world'], 'update');
    press('Space');
    game.togglePause();
    game.setPaused(false);
    game['update'](1 / 60);
    expect(game.getStats().paused).toBe(true);
    expect(update).not.toHaveBeenCalled();
    expect(game.getStats().mutationOffer).not.toBeNull();
  });

  it('applies the chosen card, clears the offer, resumes and publishes', () => {
    const { game, published } = manager();
    reachNextDawn(game);
    const chosen = game.getStats().mutationOffer!.options[0].id;

    expect(game.chooseMutation(chosen)).toBe(true);
    expect(game.getAppliedMutations()).toEqual([chosen]);
    expect(game.getStats()).toMatchObject({ mutationOffer: null, paused: false, lastMutationPick: chosen });
    expect(published.at(-1)).toMatchObject({ mutationOffer: null, paused: false, lastMutationPick: chosen });
  });

  it('rejects an id outside the offer and a pick with no offer pending', () => {
    const { game } = manager();
    expect(game.chooseMutation('acid_mandibles')).toBe(false);
    reachNextDawn(game);
    const offered = game.getStats().mutationOffer!.options.map(option => option.id);
    const outsider = MUTATION_IDS.find(id => !offered.includes(id))!;

    expect(game.chooseMutation(outsider)).toBe(false);
    expect(game.chooseMutation('not_a_mutation')).toBe(false);
    expect(game.getAppliedMutations()).toEqual([]);
    expect(game.getStats().mutationOffer?.options.map(option => option.id)).toEqual(offered);
    expect(game.getStats().paused).toBe(true);
  });

  it('turns keys 1-3 into card picks while an offer is pending; they never set game speed', () => {
    const { game } = manager();
    press('Digit3');
    expect(game.getStats().speed).toBe(1);
    reachNextDawn(game);
    const second = game.getStats().mutationOffer!.options[1].id;

    press('Digit2');
    expect(game.getAppliedMutations()).toEqual([second]);
    expect(game.getStats()).toMatchObject({ mutationOffer: null, paused: false, speed: 1 });
  });

  it('offers on every dawn past day 7 too: the endless run never stops at day 8', () => {
    const { game } = manager();
    for (let day = 2; day <= 10; day++) {
      reachNextDawn(game);
      expect(game.getStats().gameOver).toBeNull();
      expect(game.getStats().mutationOffer?.dayNumber).toBe(day);
      press('Digit1');
      expect(game.getStats().mutationOffer).toBeNull();
    }
    expect(game.getAppliedMutations()).toHaveLength(9);
  });

  it('does not offer once the run is lost', () => {
    const { game } = manager();
    const world = game['world'];
    const queen = world.query(COMPONENT.QUEEN_ENTITY)[0];
    world.getComponent<HealthComponent>(queen, COMPONENT.HEALTH)!.current = 0;
    reachNextDawn(game);
    expect(game.getStats().gameOver?.outcome).toBe('defeat');
    expect(game.getStats().mutationOffer).toBeNull();
  });

  it('starts every new run without an offer or picks', () => {
    const { game } = manager();
    reachNextDawn(game);
    const fresh = manager().game;
    expect(fresh.getStats()).toMatchObject({ mutationOffer: null, lastMutationPick: null, paused: false });
    expect(fresh.getAppliedMutations()).toEqual([]);
  });

  it('forces an offer for the current day with the dev-only E key', () => {
    const { game } = manager();
    press('KeyE');
    expect(game.getStats().mutationOffer?.dayNumber).toBe(1);
    expect(game.getStats().mutationOffer?.options).toHaveLength(3);
    expect(game.getStats().paused).toBe(true);
  });
});
