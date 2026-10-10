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
// hormigas". The starting food sat on the entrance pile, which the top bar
// counts, while eggs are paid only from the pantry below. Food is only stored
// underground, so the starting stock now begins in the pantry.
describe('breeding with the starting food', () => {
  it('starts the food in the pantry, so the queen can breed right away', () => {
    const game = manager();
    const stats = game.getStats();
    const brood = game.getBroodSnapshot();

    expect(stats.entranceFoodStored).toBe(0);
    expect(stats.pantryStored).toBe(stats.foodStored);
    expect(brood.pantry.stored).toBeGreaterThanOrEqual(brood.costs[AntRole.Worker]);
    expect(breedButtonState(AntRole.Worker, brood).disabled).toBe(false);
    expect(game.queueBreed(AntRole.Worker)).toBe(true);
  });

  it('keeps breeding possible once the foragers bring food home', () => {
    const game = manager();
    run(game, 60);

    const brood = game.getBroodSnapshot();
    expect(brood.pantry.stored).toBeGreaterThanOrEqual(brood.costs[AntRole.Worker]);
    expect(breedButtonState(AntRole.Worker, brood).disabled).toBe(false);
    expect(game.queueBreed(AntRole.Worker)).toBe(true);
  });
});
