import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import { AntRole } from '../components/components';
import { breedButtonState } from '../../ui/console/brood';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';

// Real manager and simulation; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

function manager() {
  const game = new GameManager(fakeCanvas());
  finishIntro(game);
  return game;
}

/** Run the simulation for `seconds` of game time in 1/30 s ticks. */
function run(game: GameManager, seconds: number) {
  for (let i = 0; i < seconds * 30; i++) game['update'](1 / 30);
}

// Player report: "dice que no hay comida cuando sí hay cuando quiero criar
// hormigas". At the start the food sits on the pile at the entrance: the top
// bar counts it, but eggs are paid only from the pantry below, and the porters
// need some twenty seconds to carry the first loads down.
describe('breeding while the food is still at the entrance', () => {
  it('tells the player the food the top bar counts is on its way to the pantry', () => {
    const game = manager();
    const stats = game.getStats();
    const brood = game.getBroodSnapshot();

    expect(stats.foodStored).toBeGreaterThan(0);
    expect(stats.pantryStored).toBe(0);
    expect(stats.entranceFoodStored).toBe(stats.foodStored);
    expect(brood.surfaceStock).toBe(stats.entranceFoodStored);

    expect(game.queueBreed(AntRole.Worker)).toBe(false);
    const state = breedButtonState(AntRole.Worker, brood);
    expect(state.disabled).toBe(true);
    expect(state.reason).toContain(`Hay ${brood.surfaceStock} en la entrada: las obreras la bajan a la despensa.`);
  });

  it('lets the queen breed once the porters have carried the food down', () => {
    const game = manager();
    run(game, 60);

    const brood = game.getBroodSnapshot();
    expect(brood.pantry.stored).toBeGreaterThanOrEqual(brood.costs[AntRole.Worker]);
    expect(breedButtonState(AntRole.Worker, brood).disabled).toBe(false);
    expect(game.queueBreed(AntRole.Worker)).toBe(true);
  });
});
