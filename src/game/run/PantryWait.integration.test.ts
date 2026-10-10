import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import {
  AntRole,
  AntState,
  COMPONENT,
  Layer,
  type AntComponent,
  type CarryingComponent,
  type HungerComponent,
  type LayerComponent,
  type NestComponent,
  type PathComponent,
  type PositionComponent,
} from '../components/components';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import type { World } from '../../engine/ecs/World';
import { HUNGER_EAT_THRESHOLD } from '../../shared/constants';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';
import { ANT_STATE_LABEL } from '../../ui/console/format';

// Real manager and simulation; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

// Designer's rule: "Cuando la despensa está llena, tienen que esperar a que haya
// más espacio. Si tienen hambre, se comen la comida que tienen cargando."
// Before, a full pantry sent every load to the entrance pile, which grew to
// thousands, rotted and fed the crickets.

function manager() {
  const game = new GameManager(fakeCanvas());
  finishIntro(game);
  const world = game['world'] as World;
  const grid = game['undergroundGrid'] as UndergroundGrid;
  const nest = world.getComponent<NestComponent>(world.query(COMPONENT.NEST)[0], COMPONENT.NEST)!;
  return { game, world, grid, nest };
}

function run(game: GameManager, seconds: number, each?: () => void) {
  for (let i = 0; i < seconds * 30; i++) {
    const offer = game['mutationOffer'] as { options: Array<{ id: string }> } | null;
    if (offer) game.chooseMutation(offer.options[0].id);
    game['update'](1 / 30);
    each?.();
  }
}

function fillPantry(grid: UndergroundGrid, type: 'leaf' | 'mushroom' | 'meat', amount: number) {
  for (const t of grid.getPantryTiles()) {
    if (t.food) grid.takeFood(t.x, t.y, t.food.amount);
    grid.depositFood(t.x, t.y, type, amount);
  }
}

function workers(world: World): number[] {
  return world.query(COMPONENT.ANT, COMPONENT.CARRYING, COMPONENT.LAYER).filter(
    (id) => world.getComponent<AntComponent>(id, COMPONENT.ANT)!.role === AntRole.Worker,
  );
}

/** Hand `count` surface workers a food load and send them home, as if they had just foraged. */
function loadWorkers(world: World, count: number, amount = 10, type = 'mushroom'): number[] {
  const loaded: number[] = [];
  for (const id of workers(world)) {
    if (loaded.length >= count) break;
    const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
    if (layer.layer !== Layer.Surface) continue;
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    const load = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;
    const path = world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
    load.resourceType = type;
    load.amount = amount;
    ant.state = AntState.ReturningHome;
    ant.stateTimer = 0;
    path.waypoints = [];
    path.currentIndex = 0;
    loaded.push(id);
  }
  expect(loaded.length).toBe(count);
  return loaded;
}

function waiting(world: World): number[] {
  return world.query(COMPONENT.ANT).filter(
    (id) => world.getComponent<AntComponent>(id, COMPONENT.ANT)!.state === AntState.WaitingForPantry,
  );
}

/** Any ant on its way to forage or holding a fresh food load it did not start the test with. */
function foragers(world: World, except: Set<number> = new Set()): number {
  let count = 0;
  for (const id of world.query(COMPONENT.ANT, COMPONENT.CARRYING)) {
    if (except.has(id)) continue;
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    if (ant.role === AntRole.Nurse) continue;
    const load = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;
    const food = load.amount > 0 && load.resourceType !== null && load.resourceType !== 'ore';
    if (ant.state === AntState.GoingToFood || food) count++;
  }
  return count;
}

describe('a full pantry: loaded workers wait for room', () => {
  it('keeps the load in the jaws below ground and leaves the entrance pile alone', () => {
    const { game, world, grid, nest } = manager();
    fillPantry(grid, 'leaf', grid.getPantryTileCapacity());
    const pileBefore = nest.foodStored;
    const loaded = loadWorkers(world, 4);

    run(game, 30);

    expect(nest.foodStored).toBeLessThanOrEqual(pileBefore);
    const now = waiting(world);
    for (const id of loaded) {
      expect(now).toContain(id);
      expect(world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!.amount).toBeGreaterThan(0);
      expect(world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer).toBe(Layer.Underground);
    }
    // They wait in the storage area, off the foot of the shaft
    const entrances = grid.getEntrances();
    for (const id of loaded) {
      const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      for (const e of entrances) expect(Math.hypot(pos.x - e.x, pos.y - e.y)).toBeGreaterThan(1.5);
    }

    const stats = game.getStats();
    expect(stats.pantryFull).toBe(true);
    expect(stats.antsWaitingForPantry).toBe(4);
    // The waiting loads count as food on its way
    expect(stats.foodInTransit).toBeGreaterThanOrEqual(40);
  });

  it('shows the wait on the ant card', () => {
    const { game, world, grid } = manager();
    fillPantry(grid, 'leaf', grid.getPantryTileCapacity());
    const [id] = loadWorkers(world, 1);
    run(game, 30);
    expect(waiting(world)).toContain(id);
    (game['selectionSystem'] as { selectOnly(id: number): void }).selectOnly(id);
    const info = game.getSelectedEntity();
    expect(info?.state).toBe(AntState.WaitingForPantry);
    expect(ANT_STATE_LABEL[info!.state!]).toBe('Esperando espacio en la despensa');
  });

  it('deposits as soon as a pile frees room (the colony ate from it)', () => {
    const { game, world, grid } = manager();
    fillPantry(grid, 'mushroom', grid.getPantryTileCapacity());
    const loaded = loadWorkers(world, 2, 10, 'mushroom');
    run(game, 30);
    expect(waiting(world).length).toBe(2);

    // Eating takes 20 off one pile: room for exactly the two loads
    const tile = grid.getPantryTiles()[0];
    grid.takeFood(tile.x, tile.y, 20);
    const stored = grid.getPantryStored().total;
    run(game, 20);

    expect(grid.getPantryStored().total).toBeGreaterThanOrEqual(stored + 19);
    for (const id of loaded) {
      expect(world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!.amount).toBe(0);
      expect(waiting(world)).not.toContain(id);
    }
  });

  it('deposits into new Almacén room, a type the full piles did not hold included', () => {
    const { game, world, grid } = manager();
    fillPantry(grid, 'leaf', grid.getPantryTileCapacity());
    const loaded = loadWorkers(world, 3, 10, 'meat');
    run(game, 30);
    expect(waiting(world).length).toBe(3);

    // A free tile: the type-lock merge does not help a pantry of full piles
    const tile = grid.getPantryTiles()[0];
    grid.takeFood(tile.x, tile.y, grid.getPantryTileCapacity());
    run(game, 20);

    expect(grid.getPantryStored().meat).toBeGreaterThanOrEqual(29);
    // (foraging resumed with the free tile: a new load of another type may
    // be waiting now, which is the rule, not these three)
    for (const id of loaded) expect(waiting(world)).not.toContain(id);
    expect(game.getStats().antsWaitingForPantry).toBe(waiting(world).length);
  });

  it('a hungry waiting ant eats from its own load, not the pantry, and does not starve holding food', () => {
    const { game, world, grid } = manager();
    fillPantry(grid, 'leaf', grid.getPantryTileCapacity());
    const [id] = loadWorkers(world, 1, 10, 'leaf');
    run(game, 30);
    expect(waiting(world)).toContain(id);

    const hunger = world.getComponent<HungerComponent>(id, COMPONENT.HUNGER)!;
    // Hungry (would head out to eat), but not yet at the starving bite of 30 %
    hunger.current = hunger.max * (HUNGER_EAT_THRESHOLD - 0.1);
    const before = hunger.current;
    run(game, 3);

    expect(world.hasEntity(id)).toBe(true);
    expect(hunger.current).toBeGreaterThan(before);
    // The meal came out of its own jaws: the load shrank and it is still waiting
    expect(world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!.amount).toBeLessThan(10);
    expect(world.getComponent<AntComponent>(id, COMPONENT.ANT)!.state).toBe(AntState.WaitingForPantry);
  });

  it('starts no new foraging trips while full, and forages again once there is room', () => {
    const { game, world, grid } = manager();
    fillPantry(grid, 'leaf', grid.getPantryTileCapacity());
    let seen = 0;
    run(game, 40, () => {
      seen = Math.max(seen, foragers(world));
    });

    expect(seen).toBe(0);
    expect(waiting(world).length).toBe(0);
    // Free workers are not frozen: they keep doing other jobs on the surface
    const busy = workers(world).filter((id) =>
      world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer === Layer.Surface &&
      world.getComponent<AntComponent>(id, COMPONENT.ANT)!.state !== AntState.Idle);
    expect(busy.length).toBeGreaterThan(0);

    grid.setPantryTileCapacityBonus(150);
    const stored = grid.getPantryStored().total;
    let resumed = 0;
    run(game, 60, () => {
      resumed = Math.max(resumed, foragers(world));
    });

    expect(resumed).toBeGreaterThan(0);
    expect(grid.getPantryStored().total).toBeGreaterThan(stored);
  });

  it('never grows the entrance pile with worker loads over a long full-pantry stretch', () => {
    const { game, world, grid, nest } = manager();
    fillPantry(grid, 'leaf', grid.getPantryTileCapacity());
    loadWorkers(world, 5);
    const pile = nest.foodStored;
    let biggest = pile;
    run(game, 90, () => {
      biggest = Math.max(biggest, nest.foodStored);
    });
    expect(biggest).toBeLessThanOrEqual(pile + 1e-6);
  });
});
