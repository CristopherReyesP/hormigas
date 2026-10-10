import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import type { Camera } from '../../engine/camera/Camera';
import type { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import type { PathGrid } from '../../simulation/pathfinding/AStar';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { ChamberType, UndergroundTerrainType } from '../../simulation/world/types';
import {
  AntRole,
  COMPONENT,
  Layer,
  OrderKind,
  type PlayerOrderComponent,
  type PositionComponent,
  type LayerComponent,
} from '../components/components';
import { createAnt } from '../entities/factories';
import { snapToWalkable } from '../systems/helpers/playerOrders';
import type { SelectionSystem } from '../systems/SelectionSystem';
import { TILE_SIZE, UNDERGROUND_HEIGHT, UNDERGROUND_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { fakeCanvas, finishIntro, CRYSTAL_RIVAL_SETUP } from '../../test/gameManagerMocks';

// Real manager and map; browser-only adapters are replaced. These drive the
// touch entry points the InputManager calls (tap, long press, drag strokes).
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

afterEach(() => vi.restoreAllMocks());

const NX = Math.floor(WORLD_WIDTH / 2);
const NY = Math.floor(WORLD_HEIGHT / 2);

function setup() {
  const game = new GameManager(fakeCanvas(), CRYSTAL_RIVAL_SETUP);
  finishIntro(game);
  const world = game['world'] as World;
  const camera = game['camera'] as Camera;
  const grid = game['grid'] as PathGrid;
  const selection = game['selectionSystem'] as SelectionSystem;
  const fog = game['visibilityGrid'] as VisibilityGrid;
  fog.revealArea(NX, NY, WORLD_WIDTH);
  /** Canvas px where an entity at (x, y) is drawn */
  const screenOf = (x: number, y: number) => camera.worldToScreen((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
  const orderOf = (id: number) => world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER);
  const spot = snapToWalkable(grid, { x: NX + 9, y: NY + 5 }, 6)!;
  // The random map's own ants wander; keep the tap spot clear of them so a tap
  // can only land on the soldiers placed here
  for (const id of world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.LAYER)) {
    if (world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer !== Layer.Surface) continue;
    const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    if (Math.hypot(pos.x - spot.x, pos.y - spot.y) < 4) {
      pos.x = pos.prevX = NX - 20;
      pos.y = pos.prevY = NY - 20;
    }
  }
  const soldiers = [0, 1, 2].map((i) => createAnt(world, spot.x + i * 0.4, spot.y, AntRole.Soldier));
  return { game, world, grid, selection, screenOf, orderOf, soldiers, spot };
}

describe('tap on the surface', () => {
  it('a tap on an own ant with nothing selected selects it', () => {
    const { game, selection, screenOf, soldiers, spot } = setup();
    selection.clearSelection();
    const at = screenOf(spot.x, spot.y);
    game['handleTap'](at.x, at.y);
    expect(selection.getSelectedIds()).toEqual([soldiers[0]]);
    game.stop();
  });

  it('with own ants selected, a tap on open ground orders them to move there', () => {
    const { game, grid, selection, screenOf, orderOf, soldiers } = setup();
    selection.selectAnts(soldiers, Layer.Surface);
    const ground = snapToWalkable(grid, { x: NX - 12, y: NY + 8 }, 6)!;
    const at = screenOf(ground.x, ground.y);
    game['handleTap'](at.x, at.y);
    for (const id of soldiers) expect(orderOf(id)).toMatchObject({ kind: OrderKind.Move });
    // The selection stays: the tap was an order, not a pick
    expect([...selection.getSelectedIds()].sort()).toEqual([...soldiers].sort());
    game.stop();
  });

  it('with own ants selected, a tap on an enemy base orders an attack on it', () => {
    const { game, world, selection, screenOf, orderOf, soldiers } = setup();
    const hive = world.query(COMPONENT.CRYSTAL_HIVE, COMPONENT.POSITION)[0];
    const pos = world.getComponent<PositionComponent>(hive, COMPONENT.POSITION)!;
    selection.selectAnts(soldiers, Layer.Surface);
    const at = screenOf(pos.x, pos.y);
    game['handleTap'](at.x, at.y);
    for (const id of soldiers) expect(orderOf(id)).toMatchObject({ kind: OrderKind.Attack, targetId: hive });
    game.stop();
  });

  it('with own ants selected, a tap on another own ant switches the selection to it', () => {
    const { game, world, selection, screenOf, orderOf, soldiers, grid } = setup();
    const far = snapToWalkable(grid, { x: NX - 10, y: NY - 7 }, 6)!;
    const worker = createAnt(world, far.x, far.y, AntRole.Worker);
    selection.selectAnts(soldiers, Layer.Surface);
    const at = screenOf(far.x, far.y);
    game['handleTap'](at.x, at.y);
    expect(selection.getSelectedIds()).toEqual([worker]);
    for (const id of soldiers) expect(orderOf(id)).toBeUndefined();
    game.stop();
  });

  it('Atacar armed, then a tap on the ground: an attack-move', () => {
    const { game, grid, selection, screenOf, orderOf, soldiers } = setup();
    selection.selectAnts(soldiers, Layer.Surface);
    game.armAttackTarget();
    const ground = snapToWalkable(grid, { x: NX - 12, y: NY + 8 }, 6)!;
    const at = screenOf(ground.x, ground.y);
    game['handleTap'](at.x, at.y);
    for (const id of soldiers) expect(orderOf(id)).toMatchObject({ kind: OrderKind.AttackMove });
    game.stop();
  });

  it('a tap on empty ground with a non-ant selection deselects', () => {
    const { game, world, selection, grid, screenOf } = setup();
    const nest = world.query(COMPONENT.NEST, COMPONENT.POSITION)[0];
    selection.selectOnly(nest);
    const ground = snapToWalkable(grid, { x: NX - 14, y: NY + 10 }, 6)!;
    const at = screenOf(ground.x, ground.y);
    game['handleTap'](at.x, at.y);
    expect(selection.getSelectedIds()).toEqual([]);
    game.stop();
  });

  it('a long press on an own ant selects every ant of its caste on screen', () => {
    const { game, world, selection, screenOf, soldiers, spot } = setup();
    const other = createAnt(world, spot.x + 2, spot.y + 1, AntRole.Soldier);
    selection.clearSelection();
    const at = screenOf(spot.x, spot.y);
    game['handleLongPress'](at.x, at.y);
    const picked = selection.getSelectedIds();
    for (const id of [...soldiers, other]) expect(picked).toContain(id);
    game.stop();
  });
});

describe('touch drags', () => {
  it('pan by default, box while Seleccionar área is on (one box, then it turns off), paint in a build mode', () => {
    const { game } = setup();
    expect(game['touchDragMode']()).toBe('pan');
    game.setAreaSelect(true);
    expect(game['touchDragMode']()).toBe('box');
    game['selectInScreenBox']({ x0: 0, y0: 0, x1: 10, y1: 10 }, { shift: false, ctrl: false });
    expect(game.isAreaSelect()).toBe(false);
    game.enterUnderground();
    expect(game['touchDragMode']()).toBe('pan');
    game.setDigMode(true);
    expect(game['touchDragMode']()).toBe('paint');
    game.stop();
  });

  it('a finger drag in dig mode marks every earth tile along the stroke', () => {
    const { game } = setup();
    game.enterUnderground();
    game.setDigMode(true);
    const ug = game['undergroundGrid'] as UndergroundGrid;
    const cam = game['undergroundCamera'] as Camera;
    // A horizontal run of six earth tiles
    let row: { x: number; y: number } | null = null;
    for (let y = 2; y < UNDERGROUND_HEIGHT - 2 && !row; y++) {
      for (let x = 2; x < UNDERGROUND_WIDTH - 8 && !row; x++) {
        let ok = true;
        for (let i = 0; i < 6; i++) {
          const t = ug.getTile(x + i, y)!;
          if (t.terrain !== UndergroundTerrainType.Earth || t.designated) ok = false;
        }
        if (ok) row = { x, y };
      }
    }
    expect(row).not.toBeNull();
    const screenOfTile = (x: number, y: number) => cam.worldToScreen((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
    const a = screenOfTile(row!.x, row!.y);
    const b = screenOfTile(row!.x + 5, row!.y);
    // Only the two ends are reported: the tiles between are filled in
    game['paintAt'](a.x, a.y, 'start');
    game['paintAt'](b.x, b.y, 'move');
    game['paintAt'](b.x, b.y, 'end');
    for (let i = 0; i < 6; i++) expect(ug.getTile(row!.x + i, row!.y)!.designated).toBe(true);
    game.stop();
  });

  it('a zone stroke paints what it starts on: from a plain tile it adds, from a zone tile it erases', () => {
    const { game } = setup();
    game.enterUnderground();
    const ug = game['undergroundGrid'] as UndergroundGrid;
    const cam = game['undergroundCamera'] as Camera;
    // Three dug-out plain tiles in a row (a fresh tunnel)
    const row = { x: 4, y: 4 };
    for (let i = 0; i < 3; i++) Object.assign(ug.getTile(row.x + i, row.y)!, { walkable: true, chamberType: null });
    const s = (i: number) => cam.worldToScreen((row!.x + i + 0.5) * TILE_SIZE, (row!.y + 0.5) * TILE_SIZE);
    const type = (i: number) => ug.getTile(row!.x + i, row!.y)!.chamberType;
    game.setDefenseMode(true);
    // Mark the middle tile first, then stroke across all three: they all end up defense
    game['handleTap'](s(1).x, s(1).y);
    expect(type(1)).toBe(ChamberType.Defense);
    game['paintAt'](s(0).x, s(0).y, 'start');
    game['paintAt'](s(2).x, s(2).y, 'move');
    game['paintAt'](s(2).x, s(2).y, 'end');
    expect([type(0), type(1), type(2)]).toEqual([ChamberType.Defense, ChamberType.Defense, ChamberType.Defense]);
    // A stroke that starts on a defense tile clears them
    game['paintAt'](s(2).x, s(2).y, 'start');
    game['paintAt'](s(0).x, s(0).y, 'move');
    game['paintAt'](s(0).x, s(0).y, 'end');
    for (const i of [0, 1, 2]) expect(type(i)).not.toBe(ChamberType.Defense);
    game.stop();
  });
});
