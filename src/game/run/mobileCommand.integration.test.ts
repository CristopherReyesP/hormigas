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
  type AntComponent,
  type LayerComponent,
  type PlayerOrderComponent,
  type PositionComponent,
} from '../components/components';
import { createAnt, createBeetleDen } from '../entities/factories';
import { snapToWalkable } from '../systems/helpers/playerOrders';
import type { SelectionSystem } from '../systems/SelectionSystem';
import type { CommandFeedback } from '../commandFeedback';
import type { OrderPing } from '../systems/RenderSystem';
import { TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { FactionId, ownerOf } from '../factions/factions';
import { HUMAN_COMPONENT, type HumanUnitComponent } from '../rival/humanComponents';
import { fakeCanvas, finishIntro, CRYSTAL_RIVAL_SETUP } from '../../test/gameManagerMocks';

// Real manager and map; browser-only adapters are replaced. These drive the
// phone controls: the quick-select bar, finger taps and the order feedback.
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
  const screenOf = (x: number, y: number) => camera.worldToScreen((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
  const orderOf = (id: number) => world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER);
  const spot = snapToWalkable(grid, { x: NX + 9, y: NY + 5 }, 6)!;
  // The random map's own ants wander, and a tap picks the ant nearest the
  // finger: park every starting surface ant far from the spots these tests tap
  // Ants riding the shaft or below can still be picked, so park them all
  for (const id of world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.LAYER)) {
    world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
    const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    pos.x = pos.prevX = NX + 25;
    pos.y = pos.prevY = NY - 25;
  }
  const soldiers = [0, 1, 2].map((i) => createAnt(world, spot.x + i * 0.4, spot.y, AntRole.Soldier));
  // One more soldier far across the map: the bar picks across the map, not just the screen
  const far = snapToWalkable(grid, { x: NX - 30, y: NY - 20 }, 6)!;
  soldiers.push(createAnt(world, far.x, far.y, AntRole.Soldier));
  const feedback: CommandFeedback[] = [];
  game.onCommandFeedback((event) => feedback.push(event));
  return { game, world, grid, camera, selection, screenOf, orderOf, soldiers, spot, feedback };
}

const roleOf = (world: World, id: number) => world.getComponent<AntComponent>(id, COMPONENT.ANT)?.role;

describe('quick-select bar', () => {
  it('a tap on Soldados selects every soldier on the surface, across the map', () => {
    const { game, world, selection, soldiers } = setup();
    const result = game.quickSelect('soldier');
    const picked = selection.getSelectedIds();
    for (const id of soldiers) expect(picked).toContain(id);
    for (const id of picked) expect(roleOf(world, id)).toBe(AntRole.Soldier);
    expect(result).toEqual({ selected: picked.length, centered: false });
    const chip = game.getStats().quickSelect?.find((c) => c.kind === 'soldier');
    expect(chip).toMatchObject({ count: picked.length, selected: true });
    game.stop();
  });

  it('a second tap on the same chip centers the camera on them', () => {
    const { game, world, camera, selection } = setup();
    game.quickSelect('soldier');
    const before = camera.screenToWorld(400, 300);
    const result = game.quickSelect('soldier');
    expect(result.centered).toBe(true);
    const ids = selection.getSelectedIds();
    let x = 0;
    let y = 0;
    for (const id of ids) {
      const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      x += pos.x;
      y += pos.y;
    }
    const view = camera.getViewport();
    const center = camera.screenToWorld(view.x + view.w / 2, view.y + view.h / 2);
    expect(center.x).toBeCloseTo((x / ids.length) * TILE_SIZE + TILE_SIZE / 2, 0);
    expect(center.y).toBeCloseTo((y / ids.length) * TILE_SIZE + TILE_SIZE / 2, 0);
    expect(camera.screenToWorld(400, 300)).not.toEqual(before);
    game.stop();
  });

  it('Todas takes every own ant on the surface; an empty caste selects nothing', () => {
    const { game, world, selection } = setup();
    game.quickSelect('all');
    const all = selection.getSelectedIds();
    const surface = world.query(COMPONENT.ANT, COMPONENT.LAYER).filter(
      (id) => world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer === Layer.Surface,
    );
    expect([...all].sort()).toEqual([...surface].sort());
    for (const id of world.query(COMPONENT.ANT)) if (roleOf(world, id) === AntRole.Scout) world.destroyEntity(id);
    expect(game.quickSelect('scout')).toEqual({ selected: 0, centered: false });
    // The selection is kept when the caste has nobody to pick
    expect(selection.getSelectedIds()).toEqual(all);
    game.stop();
  });

  it('tap Soldados, then tap a den: the soldiers get an attack order on it', () => {
    const { game, world, grid, orderOf, screenOf, soldiers, feedback } = setup();
    const at = snapToWalkable(grid, { x: NX + 16, y: NY + 12 }, 6)!;
    const den = createBeetleDen(world, at.x, at.y);
    game.quickSelect('soldier');
    const tap = screenOf(at.x, at.y);
    game['handleTap'](tap.x, tap.y);
    for (const id of soldiers) expect(orderOf(id)).toMatchObject({ kind: OrderKind.Attack, targetId: den });
    const event = feedback.at(-1);
    expect(event).toMatchObject({ type: 'order', order: 'attack', target: 'den', touch: true });
    expect(event?.type === 'order' && event.byRole[AntRole.Soldier]).toBeGreaterThanOrEqual(soldiers.length);
    game.stop();
  });
});

describe('finger taps', () => {
  it('with nothing selected, a tap near a small ant picks the nearest one, with a reach that grows as the camera zooms out', () => {
    const { game, world, grid, camera, selection, screenOf } = setup();
    const lone = snapToWalkable(grid, { x: NX - 22, y: NY + 14 }, 6)!;
    const scout = createAnt(world, lone.x, lone.y, AntRole.Scout);
    const second = createAnt(world, lone.x + 1.5, lone.y, AntRole.Scout);
    camera.setZoom(0.5); // zoomed all the way out: an ant is a few px on screen
    selection.clearSelection();
    // Over two tiles off the ant: past a mouse click's reach, inside a finger's
    const at = screenOf(lone.x - 2.1, lone.y);
    game['handleTap'](at.x, at.y);
    expect(selection.getSelectedIds()).toEqual([scout]);
    // Between the two, the nearer one wins
    selection.clearSelection();
    const between = screenOf(lone.x + 1, lone.y);
    game['handleTap'](between.x, between.y);
    expect(selection.getSelectedIds()).toEqual([second]);
    game.stop();
  });

  it('a long press reports how many ants of the caste it took, where the finger is', () => {
    const { game, screenOf, spot, feedback } = setup();
    const at = screenOf(spot.x, spot.y);
    game['handleLongPress'](at.x, at.y);
    const event = feedback.at(-1);
    expect(event).toMatchObject({ type: 'caste-select', role: AntRole.Soldier });
    expect(event?.type === 'caste-select' && event.count).toBeGreaterThanOrEqual(3);
    expect(event?.type === 'caste-select' && [event.x, event.y]).toEqual([at.x, at.y]);
    game.stop();
  });
});

describe('order feedback', () => {
  it('a tap order marks the target big and links the units to it', () => {
    const { game, grid, screenOf, soldiers, selection, feedback } = setup();
    selection.selectAnts(soldiers, Layer.Surface);
    const ground = snapToWalkable(grid, { x: NX - 12, y: NY + 8 }, 6)!;
    const at = screenOf(ground.x, ground.y);
    game['handleTap'](at.x, at.y);
    const pings = game.drainOrderPings();
    expect(pings).toHaveLength(1);
    const ping: OrderPing = pings[0];
    expect(ping).toMatchObject({ kind: 'move', big: true });
    expect([...(ping.units ?? [])].sort()).toEqual([...soldiers].sort());
    expect(feedback.at(-1)).toMatchObject({ type: 'order', order: 'move', count: soldiers.length, touch: true, target: null });
    game.stop();
  });

  it('a mouse order keeps the small desktop ping and is not a touch event', () => {
    const { game, grid, screenOf, soldiers, selection, feedback } = setup();
    selection.selectAnts(soldiers, Layer.Surface);
    const ground = snapToWalkable(grid, { x: NX - 12, y: NY + 8 }, 6)!;
    const at = screenOf(ground.x, ground.y);
    game['commandAt'](at.x, at.y);
    const [ping] = game.drainOrderPings();
    expect(ping.big).toBeFalsy();
    expect(feedback.at(-1)).toMatchObject({ type: 'order', order: 'move', touch: false });
    game.stop();
  });

  it('Volver al nido sends the selected ants to the nest', () => {
    const { game, world, soldiers, selection, orderOf, feedback } = setup();
    selection.selectAnts(soldiers, Layer.Surface);
    expect(game.returnSelectedToNest()).toBe(soldiers.length);
    const nest = world.query(COMPONENT.NEST, COMPONENT.POSITION)[0];
    const pos = world.getComponent<PositionComponent>(nest, COMPONENT.POSITION)!;
    for (const id of soldiers) {
      const order = orderOf(id)!;
      expect(order.kind).toBe(OrderKind.Move);
      expect(Math.hypot(order.target.x - pos.x, order.target.y - pos.y)).toBeLessThan(6);
    }
    expect(feedback.at(-1)).toMatchObject({ type: 'order', order: 'rally', count: soldiers.length });
    game.stop();
  });
});

describe('phone controls in a Humans run', () => {
  const HUMANS = { playerRace: 'human', rivalRace: 'wildlife' } as const;

  function humanSetup() {
    const game = new GameManager(fakeCanvas(), HUMANS);
    finishIntro(game);
    const world = game['world'] as World;
    const camera = game['camera'] as Camera;
    const grid = game['grid'] as PathGrid;
    const selection = game['selectionSystem'] as SelectionSystem;
    (game['visibilityGrid'] as VisibilityGrid).revealArea(NX, NY, WORLD_WIDTH);
    const screenOf = (x: number, y: number) => camera.worldToScreen((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
    const mine = (type: string) => world.query(HUMAN_COMPONENT.UNIT).filter(
      (id) => ownerOf(world, id) === FactionId.PLAYER && world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type === type,
    );
    const feedback: CommandFeedback[] = [];
    game.onCommandFeedback((event) => feedback.push(event));
    return { game, world, grid, selection, screenOf, mine, feedback };
  }

  it('the bar offers the Human unit kinds and selects them across the map', () => {
    const { game, selection, mine } = humanSetup();
    const chips = game.getStats().quickSelect!;
    expect(chips.map((c) => c.kind)).toEqual(['human-soldier', 'human-marksman', 'human-tank', 'human-builder', 'all']);
    expect(chips.find((c) => c.kind === 'human-soldier')!.count).toBe(mine('soldier').length);
    expect(chips.find((c) => c.kind === 'human-builder')!.count).toBe(mine('builder').length);
    expect(mine('soldier').length).toBeGreaterThan(0);
    expect(game.quickSelect('human-soldier').selected).toBe(mine('soldier').length);
    expect([...selection.getSelectedIds()].sort()).toEqual([...mine('soldier')].sort());
    expect(game.quickSelect('human-soldier').centered).toBe(true);
    game.stop();
  });

  it('tap Soldados, then tap a den: the soldiers attack it and the feedback counts Human soldiers', () => {
    const { game, world, grid, screenOf, mine, feedback } = humanSetup();
    const at = snapToWalkable(grid, { x: NX + 14, y: NY + 10 }, 6)!;
    const den = createBeetleDen(world, at.x, at.y);
    game.quickSelect('human-soldier');
    const tap = screenOf(at.x, at.y);
    game['handleTap'](tap.x, tap.y);
    for (const id of mine('soldier')) {
      expect(world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER)).toMatchObject({ kind: OrderKind.Attack, targetId: den });
    }
    expect(feedback.at(-1)).toMatchObject({
      type: 'order', order: 'attack', target: 'den', touch: true, byHuman: { soldier: mine('soldier').length },
    });
    game.stop();
  });

  it('Volver a la base sends the selection to the command center', () => {
    const { game, world, mine, feedback } = humanSetup();
    game.quickSelect('human-soldier');
    expect(game.returnSelectedToNest()).toBe(mine('soldier').length);
    for (const id of mine('soldier')) {
      const order = world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER)!;
      expect(Math.hypot(order.target.x - NX, order.target.y - NY)).toBeLessThan(6);
    }
    expect(feedback.at(-1)).toMatchObject({ order: 'rally' });
    game.stop();
  });

  it('a long press on a Human soldier reports Human soldiers', () => {
    const { game, world, screenOf, mine, feedback } = humanSetup();
    const pos = world.getComponent<PositionComponent>(mine('soldier')[0], COMPONENT.POSITION)!;
    const at = screenOf(pos.x, pos.y);
    game['handleLongPress'](at.x, at.y);
    expect(feedback.at(-1)).toMatchObject({ type: 'caste-select', humanType: 'soldier' });
    game.stop();
  });
});
