import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import {
  AntRole,
  AntState,
  COMPONENT,
  Layer,
  type AntComponent,
  type CarryingComponent,
  type LayerComponent,
  type NestComponent,
} from '../components/components';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import type { World } from '../../engine/ecs/World';
import { porterCeiling } from '../systems/PorterSystem';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';

// Real manager and simulation; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

// Player report: "Lo de la despensa sigue sin solucionarse: arriba se ven
// muchos recursos pero en la despensa nada". In a real run the giant mushroom
// haul fills the 9 starting pantry tiles (450) in about 90 s. From then on every
// worker sat below ground with ~30 food in its jaws (400-550 food in mouths, the
// whole workforce idle), and food of a type the full piles did not hold could
// never be stored even with room left in the pantry.

function manager() {
  const game = new GameManager(fakeCanvas());
  finishIntro(game);
  return game;
}

function parts(game: GameManager) {
  const world = game['world'] as World;
  const grid = game['undergroundGrid'] as UndergroundGrid;
  const nest = world.getComponent<NestComponent>(world.query(COMPONENT.NEST)[0], COMPONENT.NEST)!;
  return { world, grid, nest };
}

/** Run the simulation for `seconds` of game time, picking the dawn mutation like a player would. */
function run(game: GameManager, seconds: number, each?: () => void) {
  for (let i = 0; i < seconds * 30; i++) {
    const offer = game['mutationOffer'] as { options: Array<{ id: string }> } | null;
    if (offer) game.chooseMutation(offer.options[0].id);
    game['update'](1 / 30);
    each?.();
  }
}

/** Workers below ground holding food while doing nothing: food the HUD cannot place. */
function idleLoadedBelow(world: World): number {
  let held = 0;
  for (const id of world.query(COMPONENT.ANT, COMPONENT.CARRYING, COMPONENT.LAYER)) {
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
    const load = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;
    if (ant.role === AntRole.Worker && ant.state === AntState.Idle && layer.layer === Layer.Underground && load.amount > 0) {
      held += load.amount;
    }
  }
  return held;
}

/** Workers on porter duty: fetching from the entrance pile or carrying a load below. */
function porters(world: World): number {
  let count = 0;
  for (const id of world.query(COMPONENT.ANT)) {
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    if (ant.role === AntRole.Worker && (ant.state === AntState.FetchingFood || ant.state === AntState.Hauling)) count++;
  }
  return count;
}

/** Fill every pantry tile with `amount` of `type`. */
function fillPantry(grid: UndergroundGrid, type: 'leaf' | 'mushroom' | 'meat', amount: number) {
  for (const t of grid.getPantryTiles()) {
    if (t.food) grid.takeFood(t.x, t.y, t.food.amount);
    grid.depositFood(t.x, t.y, type, amount);
  }
}

function putOnEntrance(nest: NestComponent, type: 'leaf' | 'mushroom' | 'meat', amount: number) {
  nest.foodStored += amount;
  if (type === 'mushroom') nest.mushroomStored += amount;
  if (type === 'meat') nest.meatStored += amount;
}

describe('food flow from the entrance to the pantry', () => {
  // Updated for the designer's rule ("cuando la despensa está llena, tienen que
  // esperar a que haya más espacio"): a full pantry no longer sends loads to
  // the entrance pile. Loaded workers wait below in the WaitingForPantry state,
  // which the HUD counts, and nobody else starts a foraging trip, so the
  // workforce still never freezes idle below with food in its jaws.
  it('does not leave the workforce idle below ground with food in its jaws once the pantry fills up', () => {
    const game = manager();
    const { world, grid, nest } = parts(game);
    fillPantry(grid, 'leaf', grid.getPantryTileCapacity());
    const pile = nest.foodStored;
    const loaded = world.query(COMPONENT.ANT, COMPONENT.CARRYING, COMPONENT.LAYER).filter((id) => {
      const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      return ant.role === AntRole.Worker && world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer === Layer.Surface;
    }).slice(0, 3);
    for (const id of loaded) {
      const load = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;
      load.resourceType = 'mushroom';
      load.amount = 20;
      world.getComponent<AntComponent>(id, COMPONENT.ANT)!.state = AntState.ReturningHome;
    }
    run(game, 40);

    const stats = game.getStats();
    expect(stats.pantryFull).toBe(true);
    expect(idleLoadedBelow(world)).toBe(0);
    // The loads wait in the jaws of the waiting workers, counted as on their way
    expect(stats.antsWaitingForPantry).toBe(3);
    expect(nest.foodStored).toBeLessThanOrEqual(pile);
    expect(stats.foodInTransit).toBeGreaterThanOrEqual(60);
  });

  it('carries the entrance pile down as soon as the pantry has room, instead of letting it grow', () => {
    const game = manager();
    const { world, grid, nest } = parts(game);
    fillPantry(grid, 'leaf', grid.getPantryTileCapacity());
    // Soldiers and scouts still leave their loads on the pile
    putOnEntrance(nest, 'leaf', 300);
    run(game, 40);
    const waiting = nest.foodStored;
    expect(waiting).toBeGreaterThan(100);
    expect(waiting).toBeLessThanOrEqual(300);

    // The player answers "Despensa llena": more room in the pantry
    grid.setPantryTileCapacityBonus(150);
    // Peaks, not the end state: a cricket raid late in the run can empty the
    // pile and the pantry, which says nothing about the porters
    let most = 0;
    let pantry = 0;
    let pile = waiting;
    run(game, 60, () => {
      most = Math.max(most, porters(world));
      pantry = Math.max(pantry, grid.getPantryStored().total);
      pile = Math.min(pile, nest.foodStored);
    });

    expect(game.getStats().pantryFull).toBe(false);
    expect(pile).toBeLessThan(waiting - 45);
    expect(pantry).toBeGreaterThan(450 + 45);
    // More than the old flat four porters work the pile
    expect(most).toBeGreaterThan(4);
  });

  it('lets more porters work a bigger entrance pile', () => {
    expect(porterCeiling(0, 0)).toBe(4);
    expect(porterCeiling(30, 1)).toBe(5);
    expect(porterCeiling(600, 0)).toBe(14);
  });

  it('stores a food type the partly full piles do not hold, instead of leaving it at the entrance', () => {
    const game = manager();
    const { world, grid, nest } = parts(game);
    // No forage around: the porters' work on the pile is all that moves food
    for (const id of world.query(COMPONENT.FOOD_SOURCE)) world.destroyEntity(id);
    // 9 tiles of mushrooms at 30/50: 180 of room, but no tile free for leaves
    fillPantry(grid, 'mushroom', 30);
    putOnEntrance(nest, 'leaf', 120);
    expect(grid.getPantryStored().total).toBe(270);

    run(game, 60);

    // Before, no leaf could ever land: every tile was claimed by mushrooms
    expect(grid.getPantryStored().leaf).toBeGreaterThanOrEqual(60);
    expect(nest.foodStored - nest.mushroomStored - nest.meatStored).toBeLessThan(40);
  });
});

describe('food numbers on the HUD', () => {
  it('counts only the pantry in the food totals and shows the food on its way apart', () => {
    const game = manager();
    const { world, grid, nest } = parts(game);
    fillPantry(grid, 'leaf', 0);
    grid.depositFood(grid.getPantryTiles()[0].x, grid.getPantryTiles()[0].y, 'leaf', 30);
    grid.depositFood(grid.getPantryTiles()[1].x, grid.getPantryTiles()[1].y, 'mushroom', 20);
    putOnEntrance(nest, 'mushroom', 40);
    const worker = world.query(COMPONENT.ANT, COMPONENT.CARRYING).find(
      (id) => world.getComponent<AntComponent>(id, COMPONENT.ANT)!.role === AntRole.Worker,
    )!;
    const load = world.getComponent<CarryingComponent>(worker, COMPONENT.CARRYING)!;
    load.resourceType = 'meat';
    load.amount = 15;

    const stats = game.getStats();
    expect(stats.pantryStored).toBe(50);
    expect(stats.foodStored).toBe(50);
    expect(stats.foodStored - stats.mushroomStored - stats.meatStored).toBe(30);
    expect(stats.mushroomStored).toBe(20);
    expect(stats.meatStored).toBe(0);
    expect(stats.entranceFoodStored).toBe(40);
    expect(stats.foodInTransit).toBe(55);
    expect(stats.pantryFull).toBe(false);
  });

  it('flags the pantry as full when no pile can take more food', () => {
    const game = manager();
    const { grid } = parts(game);
    fillPantry(grid, 'leaf', grid.getPantryTileCapacity());

    const stats = game.getStats();
    expect(stats.pantryStored).toBe(stats.pantryCapacity);
    expect(stats.pantryFull).toBe(true);
  });
});
