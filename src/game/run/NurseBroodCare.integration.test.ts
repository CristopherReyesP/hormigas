import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import {
  AntRole,
  AntState,
  COMPONENT,
  Layer,
  type AntComponent,
  type EggComponent,
  type HungerComponent,
  type LayerComponent,
  type PositionComponent,
} from '../components/components';
import { createAnt, createEgg } from '../entities/factories';
import { ChamberType } from '../../simulation/world/types';
import { EGG_FOOD_REQUIRED, EGG_INCUBATION_WORKER } from '../../shared/constants';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';

// Real manager and simulation; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

// Player report: "hay nodrizas que no hacen nada, no importa cuántas haya;
// como hay límite no se avanza más rápido". A larva's growth was a fixed timer
// and each egg needed just one carry and one feeding trip, so past a handful of
// nurses the extras stood at their posts and the brood hatched no sooner.
// Free nurses now attend growing larvae (one each), which speeds their growth.

afterEach(() => {
  vi.restoreAllMocks();
});

interface Colony {
  game: GameManager;
  // The simulation internals this test drives directly
  world: GameManager['world'];
  grid: GameManager['undergroundGrid'];
  queenPos: PositionComponent;
}

/** A started colony with exactly `nurses` well-fed nurses below and a full pantry; deterministic randomness. */
function colony(nurses: number): Colony {
  let seed = 12345;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  });
  const game = new GameManager(fakeCanvas());
  finishIntro(game);
  const world = game['world'];
  const grid = game['undergroundGrid'];
  const queenId = world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.POSITION)[0];
  const queenPos = world.getComponent<PositionComponent>(queenId, COMPONENT.POSITION)!;

  const current = nurseIds(world).length;
  for (let i = current; i < nurses; i++) {
    const id = createAnt(world, queenPos.x + (i % 3) - 1, queenPos.y + 1, AntRole.Nurse);
    world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
  }
  expect(nurseIds(world)).toHaveLength(nurses);
  topUpPantry(grid);
  return { game, world, grid, queenPos };
}

function nurseIds(world: Colony['world']): number[] {
  return world.query(COMPONENT.ANT, COMPONENT.LAYER).filter((id) => {
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
    return ant.role === AntRole.Nurse && layer.layer === Layer.Underground;
  });
}

function topUpPantry(grid: Colony['grid']): void {
  for (const t of grid.getPantryTiles()) grid.depositFood(t.x, t.y, 'leaf', 1000);
}

function incubationTiles(grid: Colony['grid']): Array<{ x: number; y: number }> {
  const tiles: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const tile = grid.getTile(x, y);
      if (tile?.walkable && tile.chamberType === ChamberType.Incubation) tiles.push({ x, y });
    }
  }
  return tiles;
}

function run(c: Colony, seconds: number, each?: () => void): void {
  for (let i = 0; i < seconds * 30; i++) {
    c.game['update'](1 / 30);
    // Keep the nurses fed so their own meals don't muddy the measurement
    for (const id of nurseIds(c.world)) {
      const hunger = c.world.getComponent<HungerComponent>(id, COMPONENT.HUNGER);
      if (hunger) hunger.current = hunger.max;
    }
    each?.();
  }
}

/** Eggs the queen just laid beside her, waiting for nurses to carry, feed and raise them. */
function layEggsBesideQueen(c: Colony, count: number): void {
  for (let i = 0; i < count; i++) {
    createEgg(c.world, c.queenPos.x + ((i % 3) - 1) * 0.4, c.queenPos.y - 0.5, AntRole.Worker, EGG_INCUBATION_WORKER);
  }
}

function hatchedWithin(nurses: number, seconds: number): number {
  const c = colony(nurses);
  layEggsBesideQueen(c, 10);
  const before = c.world.metrics.antsHatched;
  run(c, seconds);
  return c.world.metrics.antsHatched - before;
}

describe('nurses raising the brood', () => {
  it('hatches more brood in the same time with more nurses, well past the old plateau', () => {
    // Before: 8 and 16 nurses both had 3 of 10 out at 24 s; the extra 8 idled
    const seconds = 24;
    const few = hatchedWithin(8, seconds);
    const many = hatchedWithin(16, seconds);

    expect(many).toBeGreaterThan(few);
    // Attended larvae grow in about half their 20 s, so most of the ten are out
    expect(many).toBeGreaterThanOrEqual(7);
  });

  it('a larva attended by a nurse hatches sooner than its incubation time', () => {
    const c = colony(3);
    const [tile] = incubationTiles(c.grid);
    const egg = createEgg(c.world, tile.x + 0.5, tile.y + 0.5, AntRole.Worker, EGG_INCUBATION_WORKER);
    c.world.getComponent<EggComponent>(egg, COMPONENT.EGG)!.fedAmount = EGG_FOOD_REQUIRED;

    let hatchedAt = -1;
    let t = 0;
    run(c, EGG_INCUBATION_WORKER, () => {
      t += 1 / 30;
      if (hatchedAt < 0 && !c.world.hasEntity(egg)) hatchedAt = t;
    });

    expect(hatchedAt).toBeGreaterThan(0);
    expect(hatchedAt).toBeLessThan(EGG_INCUBATION_WORKER * 0.75);
  });

  it('leaves no nurse idle while there are growing larvae to attend', () => {
    const c = colony(6);
    const tiles = incubationTiles(c.grid);
    for (let i = 0; i < 6; i++) {
      const t = tiles[i % tiles.length];
      const egg = createEgg(c.world, t.x + 0.5, t.y + 0.5, AntRole.Worker, 120);
      c.world.getComponent<EggComponent>(egg, COMPONENT.EGG)!.fedAmount = EGG_FOOD_REQUIRED;
    }

    run(c, 5);
    let idleSamples = 0;
    let samples = 0;
    run(c, 10, () => {
      samples++;
      for (const id of nurseIds(c.world)) {
        if (c.world.getComponent<AntComponent>(id, COMPONENT.ANT)!.state === AntState.Idle) idleSamples++;
      }
    });

    // Six larvae, six nurses: on average under one is between bouts at any moment
    expect(idleSamples / samples).toBeLessThan(1);
  });

  it('sends every free nurse to the pantry when a backlog of larvae is hungry', () => {
    const c = colony(10);
    const tiles = incubationTiles(c.grid);
    for (let i = 0; i < 12; i++) {
      const t = tiles[i % tiles.length];
      createEgg(c.world, t.x + 0.5, t.y + 0.5, AntRole.Worker, 0.01);
    }

    run(c, 0.5);
    const fetching = nurseIds(c.world).filter(
      (id) => c.world.getComponent<AntComponent>(id, COMPONENT.ANT)!.state === AntState.FetchingFood,
    ).length;

    // The old flat cap let only 3 fetch while 7 nurses idled beside 12 starving larvae
    expect(fetching).toBe(10);
  });

  it('still lets a hungry larva be fed while others are being attended', () => {
    const c = colony(4);
    const tiles = incubationTiles(c.grid);
    const eggs: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t = tiles[i % tiles.length];
      eggs.push(createEgg(c.world, t.x + 0.5, t.y + 0.5, AntRole.Worker, 120));
    }

    run(c, 30);
    for (const id of eggs) {
      const egg = c.world.getComponent<EggComponent>(id, COMPONENT.EGG)!;
      expect(egg.fedAmount).toBeGreaterThanOrEqual(egg.requiredFood);
    }
  });
});
