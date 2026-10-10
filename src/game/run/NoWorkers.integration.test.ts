import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import { AntRole, COMPONENT, type AntComponent, type NestComponent, type PositionComponent } from '../components/components';
import { createAnt } from '../entities/factories';
import { breedButtonState } from '../../ui/console/brood';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import type { World } from '../../engine/ecs/World';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';

// Real manager and simulation; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

// Player report: "Me quedé sin obreras y toda la comida quedó en la entrada."
// Porters were workers only and eggs were paid only from the pantry: with every
// worker dead the entrance pile never went down and no worker could be bred.

function setup() {
  const game = new GameManager(fakeCanvas());
  finishIntro(game);
  const world = game['world'] as World;
  const grid = game['undergroundGrid'] as UndergroundGrid;
  const nestId = world.query(COMPONENT.NEST)[0];
  const nest = world.getComponent<NestComponent>(nestId, COMPONENT.NEST)!;
  // Nothing left to forage: the entrance pile is all the food there is
  for (const id of world.query(COMPONENT.FOOD_SOURCE)) world.destroyEntity(id);
  // Every worker died; the pantry is empty and the food sits at the entrance
  killAll(world, AntRole.Worker);
  grid.drainFood(grid.getPantryStored().total);
  nest.foodStored = 150;
  nest.mushroomStored = 0;
  nest.meatStored = 0;
  return { game, world, grid, nest, nestId };
}

function killAll(world: World, role: AntRole) {
  for (const id of world.query(COMPONENT.ANT)) {
    if (world.getComponent<AntComponent>(id, COMPONENT.ANT)!.role === role) world.destroyEntity(id);
  }
}

function run(game: GameManager, seconds: number) {
  for (let i = 0; i < seconds * 30; i++) {
    const offer = game['mutationOffer'] as { options: Array<{ id: string }> } | null;
    if (offer) game.chooseMutation(offer.options[0].id);
    game['update'](1 / 30);
  }
}

function messages(world: World): string[] {
  return world.notifications.map((n) => n.message);
}

describe('a colony with no workers left', () => {
  it('still gets the entrance food into the pantry: the nurses carry it down from the shaft', () => {
    const { game, grid, nest } = setup();
    run(game, 60);

    expect(grid.getPantryStored().total).toBeGreaterThanOrEqual(20);
    expect(nest.foodStored).toBeLessThan(150 - 20);
  });

  it('has soldiers carry the entrance food down when there are no workers and no nurses', () => {
    const { game, world, grid, nestId } = setup();
    killAll(world, AntRole.Nurse);
    const nestPos = world.getComponent<PositionComponent>(nestId, COMPONENT.POSITION)!;
    createAnt(world, nestPos.x + 1, nestPos.y + 1, AntRole.Soldier);
    createAnt(world, nestPos.x - 1, nestPos.y + 1, AntRole.Scout);
    run(game, 60);

    expect(grid.getPantryStored().total).toBeGreaterThanOrEqual(10);
  });

  it('can breed a worker paid with the entrance food when the pantry is empty', () => {
    const { game, nest } = setup();
    const brood = game.getBroodSnapshot();
    const cost = brood.costs[AntRole.Worker];
    const button = breedButtonState(AntRole.Worker, brood);
    expect(button.disabled).toBe(false);
    expect(button.note).toContain('entrada');
    // Other castes still wait for the pantry
    expect(breedButtonState(AntRole.Soldier, brood).disabled).toBe(true);

    expect(game.queueBreed(AntRole.Worker)).toBe(true);
    expect(nest.foodStored).toBeCloseTo(150 - cost);
    expect(game.queueBreed(AntRole.Soldier)).toBe(false);
  });

  it('recovers: the worker egg paid with the entrance food hatches into a worker', () => {
    const { game, world } = setup();
    expect(game.queueBreed(AntRole.Worker)).toBe(true);
    let hatched = false;
    for (let t = 0; t < 300 && !hatched; t += 5) {
      run(game, 5);
      hatched = world.query(COMPONENT.ANT).some((id) => world.getComponent<AntComponent>(id, COMPONENT.ANT)!.role === AntRole.Worker);
    }
    expect(hatched).toBe(true);
  });

  it('warns that the colony has no workers', () => {
    const { game, world } = setup();
    run(game, 2);
    expect(messages(world)).toContain('¡Sin obreras! Cría obreras para recolectar y llevar comida');
    const status = game.getBroodSnapshot();
    expect(status.workers).toBe(0);
  });

  it('warns when food sits at the entrance and nobody carries it down', () => {
    const { game, world } = setup();
    killAll(world, AntRole.Nurse);
    run(game, 20);
    expect(messages(world)).toContain('Hay comida en la entrada y nadie la baja a la despensa');
  });
});
