import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import type { Camera } from '../../engine/camera/Camera';
import type { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import type { PathGrid } from '../../simulation/pathfinding/AStar';
import {
  AntRole,
  COMPONENT,
  Layer,
  OrderKind,
  type HealthComponent,
  type PlayerOrderComponent,
  type PositionComponent,
} from '../components/components';
import { createAnt, createCricketDen } from '../entities/factories';
import { snapToWalkable } from '../systems/helpers/playerOrders';
import type { SelectionSystem } from '../systems/SelectionSystem';
import { TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';

// Real manager and map; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

/** A seeded Math.random (mulberry32), so the map is the same every time. */
function seedRandom(seed: number) {
  let a = seed >>> 0;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

type BaseKind = 'beetle_den' | 'cricket_den' | 'crystal_hive';
const STORE: Record<BaseKind, string> = {
  beetle_den: COMPONENT.BEETLE_DEN,
  cricket_den: COMPONENT.CRICKET_DEN,
  crystal_hive: COMPONENT.CRYSTAL_HIVE,
};
/** A point on the base's sprite, away from its center: a den's corner, a spire of the hive's crown. */
const ON_SPRITE: Record<BaseKind, { dx: number; dy: number }> = {
  beetle_den: { dx: 1.1, dy: -1.1 },
  cricket_den: { dx: -1.1, dy: 1.1 },
  crystal_hive: { dx: 0.4, dy: -3 },
};

function setup(kind: BaseKind) {
  seedRandom(7);
  const game = new GameManager(fakeCanvas());
  finishIntro(game);
  const world = game['world'] as World;
  const camera = game['camera'] as Camera;
  const grid = game['grid'] as PathGrid;
  const fog = game['visibilityGrid'] as VisibilityGrid;
  const selection = game['selectionSystem'] as SelectionSystem;
  // The player has scouted the whole map
  fog.revealArea(Math.floor(WORLD_WIDTH / 2), Math.floor(WORLD_HEIGHT / 2), WORLD_WIDTH);

  // Leaper dens appear later in a run: raise one on open ground away from the nest
  if (kind === 'cricket_den') {
    const ground = snapToWalkable(grid, { x: Math.floor(WORLD_WIDTH / 2) + 22, y: Math.floor(WORLD_HEIGHT / 2) + 12 }, 6)!;
    createCricketDen(world, ground.x, ground.y);
  }
  const base = world.query(STORE[kind], COMPONENT.POSITION)[0];
  expect(base, `the map has a ${kind}`).toBeDefined();
  const at = world.getComponent<PositionComponent>(base, COMPONENT.POSITION)!;
  // A squad a few tiles off, already on the surface
  const spot = snapToWalkable(grid, { x: at.x + 5, y: at.y }, 4)!;
  const soldiers = Array.from({ length: 6 }, (_, i) => createAnt(world, spot.x + (i % 3) * 0.3, spot.y + Math.floor(i / 3) * 0.3, AntRole.Soldier));
  selection.selectAnts(soldiers, Layer.Surface);

  const off = ON_SPRITE[kind];
  /** Canvas px of entity-space (x, y): an entity at (x, y) is drawn centered on tile (x, y) */
  const screenOf = (x: number, y: number) => camera.worldToScreen((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
  const onSprite = screenOf(at.x + off.dx, at.y + off.dy);
  const health = () => world.getComponent<HealthComponent>(base, COMPONENT.HEALTH)!.current;
  const orderOf = (id: number) => world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER);
  const run = (seconds: number, until: () => boolean = () => false) => {
    for (let i = 0; i < seconds * 30 && !until(); i++) game['update'](1 / 30);
  };
  return { game, world, base, at, soldiers, onSprite, health, orderOf, run, selection };
}

// Player report: "sigo sin poder atacar bases".
describe.each(['beetle_den', 'cricket_den', 'crystal_hive'] as const)('attacking a %s from the real controls', (kind) => {
  it('right-click on the base sprite: the selected soldiers attack it and it loses health', () => {
    const { game, base, soldiers, onSprite, health, orderOf, run } = setup(kind);
    game['commandAt'](onSprite.x, onSprite.y);
    for (const id of soldiers) expect(orderOf(id)).toMatchObject({ kind: OrderKind.Attack, targetId: base });
    const full = health();
    run(30, () => health() < full);
    expect(health()).toBeLessThan(full);
    game.stop();
  });

  it('A, then a click on the base sprite: the same attack', () => {
    const { game, base, soldiers, onSprite, health, orderOf, run } = setup(kind);
    game.armAttackTarget();
    game['attackAt'](onSprite.x, onSprite.y);
    for (const id of soldiers) expect(orderOf(id)).toMatchObject({ kind: OrderKind.Attack, targetId: base });
    const full = health();
    run(30, () => health() < full);
    expect(health()).toBeLessThan(full);
    game.stop();
  });

  it('attack-move onto the base: the soldiers attack it on arrival', () => {
    const { game, at, health, run } = setup(kind);
    expect(game.orderSelectedMove(Math.round(at.x), Math.round(at.y) + 2, true)).toBeGreaterThan(0);
    const full = health();
    run(40, () => health() < full);
    expect(health()).toBeLessThan(full);
    game.stop();
  });

  it('a click on the base selects it, and its card sends the free soldiers at it', () => {
    const { game, base, soldiers, onSprite, health, orderOf, run, selection } = setup(kind);
    selection.clearSelection();
    game['clickSelect'](onSprite.x, onSprite.y, { shift: false, ctrl: false });
    const card = game.getSelectedEntity();
    expect(card).toMatchObject({ entityId: base, type: kind });
    expect(game.dispatchAttackWave(base, soldiers.length)).toBe(soldiers.length);
    for (const id of soldiers) expect(orderOf(id)).toMatchObject({ kind: OrderKind.Attack, targetId: base });
    const full = health();
    run(30, () => health() < full);
    expect(health()).toBeLessThan(full);
    game.stop();
  });
});
