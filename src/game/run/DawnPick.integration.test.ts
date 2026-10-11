import { killMarkForEvolution } from './KillEvolution';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager, type GameStats } from '../GameManager';
import { COMPONENT, type HealthComponent } from '../components/components';
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

/** Kill enough enemies for the next evolution, then run one real tick: the chamber opens. */
function reachNextEvolution(game: GameManager) {
  const world = game['world'];
  world.runTally.enemiesDefeated = Math.max(world.runTally.enemiesDefeated, killMarkForEvolution(game['evolutionsEarned'] as number));
  game['update'](1 / 60);
}

afterEach(() => vi.restoreAllMocks());

describe('evolution pick, earned by enemy kills', () => {
  it('stays closed until the kill tally reaches the first mark, and counts the progress', () => {
    const { game } = manager();
    game['world'].runTally.enemiesDefeated = 3;
    game['update'](1 / 60);
    expect(game.getStats().mutationOffer).toBeNull();
    expect(game.getStats().evolution).toEqual({ kills: 3, needed: 4 });
    // Dawn alone opens nothing any more
    const dayNight = game['dayNightSystem'];
    dayNight.update(dayNight.getPhaseRemaining());
    dayNight.update(dayNight.getPhaseRemaining() - 0.001);
    game['update'](1 / 60);
    expect(game.getStats().mutationOffer).toBeNull();
  });

  it('pauses at the kill mark and publishes an offer of 3 distinct valid mutations', () => {
    const { game, published } = manager();
    reachNextEvolution(game);

    const offer = game.getStats().mutationOffer;
    expect(offer?.dayNumber).toBe(game.getStats().dayNumber);
    // The next one needs 4 kills more
    expect(game.getStats().evolution).toEqual({ kills: 0, needed: 8 });
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
    reachNextEvolution(game);
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
    reachNextEvolution(game);
    const chosen = game.getStats().mutationOffer!.options[0].id;

    expect(game.chooseMutation(chosen)).toBe(true);
    expect(game.getAppliedMutations()).toEqual([chosen]);
    expect(game.getStats()).toMatchObject({ mutationOffer: null, paused: false, lastMutationPick: chosen });
    expect(published.at(-1)).toMatchObject({ mutationOffer: null, paused: false, lastMutationPick: chosen });
  });

  it('rejects an id outside the offer and a pick with no offer pending', () => {
    const { game } = manager();
    expect(game.chooseMutation('acid_mandibles')).toBe(false);
    reachNextEvolution(game);
    const offered = game.getStats().mutationOffer!.options.map(option => option.id);
    const outsider = MUTATION_IDS.find(id => !offered.includes(id))!;

    expect(game.chooseMutation(outsider)).toBe(false);
    expect(game.chooseMutation('not_a_mutation')).toBe(false);
    expect(game.getAppliedMutations()).toEqual([]);
    expect(game.getStats().mutationOffer?.options.map(option => option.id)).toEqual(offered);
    expect(game.getStats().paused).toBe(true);
  });

  it('turns keys 1-3 into card selections while an offer is pending; they never set game speed', () => {
    const { game } = manager();
    press('Digit3');
    expect(game.getStats().speed).toBe(1);
    reachNextEvolution(game);
    const second = game.getStats().mutationOffer!.options[1].id;

    press('Digit2');
    expect(game.getAppliedMutations()).toEqual([]);
    expect(game.getStats().mutationSelection).toBe(second);
    game.confirmMutation();
    expect(game.getAppliedMutations()).toEqual([second]);
    expect(game.getStats()).toMatchObject({ mutationOffer: null, paused: false, speed: 1 });
  });

  it('keeps offering at every mark: the endless run never runs out of evolutions', () => {
    const { game } = manager();
    for (let pick = 1; pick <= 9; pick++) {
      reachNextEvolution(game);
      expect(game.getStats().gameOver).toBeNull();
      expect(game.getStats().mutationOffer).not.toBeNull();
      press('Digit1');
      game.confirmMutation();
      expect(game.getStats().mutationOffer).toBeNull();
    }
    expect(game.getAppliedMutations()).toHaveLength(9);
  });

  it('does not offer once the run is lost', () => {
    const { game } = manager();
    const world = game['world'];
    const queen = world.query(COMPONENT.QUEEN_ENTITY)[0];
    world.getComponent<HealthComponent>(queen, COMPONENT.HEALTH)!.current = 0;
    reachNextEvolution(game);
    expect(game.getStats().gameOver?.outcome).toBe('defeat');
    expect(game.getStats().mutationOffer).toBeNull();
  });

  it('starts every new run without an offer or picks', () => {
    const { game } = manager();
    reachNextEvolution(game);
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
