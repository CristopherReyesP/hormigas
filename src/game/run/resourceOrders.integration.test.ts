import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import type { Camera } from '../../engine/camera/Camera';
import type { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import type { PathGrid } from '../../simulation/pathfinding/AStar';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import {
  AntRole,
  AntState,
  COMPONENT,
  FoodType,
  Layer,
  type AntComponent,
  type CarryingComponent,
  type FoodSourceComponent,
  type LayerComponent,
  type MineralComponent,
  type PositionComponent,
} from '../components/components';
import { createAnt, createFood, createMineral } from '../entities/factories';
import { snapToWalkable } from '../systems/helpers/playerOrders';
import type { SelectionSystem } from '../systems/SelectionSystem';
import { TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';
import { feedbackText } from '../../ui/console/feedbackText';
import type { CommandFeedback } from '../commandFeedback';

vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

afterEach(() => vi.restoreAllMocks());
// Every test here runs the real simulation for a while
vi.setConfig({ testTimeout: 60_000 });

const NX = Math.floor(WORLD_WIDTH / 2);
const NY = Math.floor(WORLD_HEIGHT / 2);
const DT = 1 / 30;

function setup() {
  const game = new GameManager(fakeCanvas());
  finishIntro(game);
  const world = game['world'] as World;
  const camera = game['camera'] as Camera;
  const grid = game['grid'] as PathGrid;
  const selection = game['selectionSystem'] as SelectionSystem;
  const fog = game['visibilityGrid'] as VisibilityGrid;
  fog.revealArea(NX, NY, 30);
  const screenOf = (x: number, y: number) => camera.worldToScreen((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
  const spot = (dx: number, dy: number) => snapToWalkable(grid, { x: NX + dx, y: NY + dy }, 6)!;
  const workers = (n: number) => {
    const at = spot(3, 3);
    return Array.from({ length: n }, (_, i) => createAnt(world, at.x + (i % 2) * 0.4, at.y + Math.floor(i / 2) * 0.4, AntRole.Worker));
  };
  const run = (seconds: number, until?: () => boolean) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      game['update'](DT);
      if (until?.()) return;
    }
  };
  const ant = (id: number) => world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
  const lastToast = () => world.notifications[world.notifications.length - 1]?.message ?? '';
  return { game, world, selection, screenOf, spot, workers, run, ant, lastToast };
}

describe('the gather order', () => {
  it('loops: the workers carry from the ordered source to the pantry and come back, until it is empty', () => {
    const { game, world, selection, spot, workers, run, ant, lastToast } = setup();
    const at = spot(7, -2);
    const food = createFood(world, at.x, at.y, 400, FoodType.Leaf);
    // Room for the whole source: with a full pantry the loads would wait below
    // for space (the designer's rule) and this loop is about the order itself
    (game['undergroundGrid'] as UndergroundGrid).setPantryTileCapacityBonus(500);
    const team = workers(2);
    selection.selectAnts(team, Layer.Surface);
    expect(game.orderSelectedGather(food)).toBe(2);
    expect(lastToast()).toBe('2 obreras → recolectar hojas');
    for (const id of team) expect(ant(id).resourceOrder).toBe('gather');

    // Count the loads each ordered worker picks up at the source
    const trips = new Map(team.map((id) => [id, 0]));
    const held = new Map(team.map((id) => [id, 0]));
    for (let i = 0; i < 240 * 30 && world.hasEntity(food); i++) {
      game['update'](DT);
      for (const id of team) {
        const load = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!.amount;
        if (load > 0 && held.get(id) === 0 && world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer === Layer.Surface) {
          trips.set(id, trips.get(id)! + 1);
        }
        held.set(id, load);
      }
    }
    expect(world.hasEntity(food)).toBe(false);
    for (const id of team) expect(trips.get(id)).toBeGreaterThanOrEqual(2);
    // The source is empty: the order ends and they go back to their own work
    run(30, () => team.every((id) => ant(id).resourceOrder === undefined));
    for (const id of team) expect(ant(id).resourceOrder).toBeUndefined();
    game.stop();
  });

  it('ends when the source is gone, and the workers go back to work', () => {
    const { game, world, selection, spot, workers, run, ant } = setup();
    const at = spot(6, 2);
    const food = createFood(world, at.x, at.y, 40, FoodType.Mushroom);
    const team = workers(2);
    selection.selectAnts(team, Layer.Surface);
    game.orderSelectedGather(food);
    world.destroyEntity(food);
    run(2);
    for (const id of team) {
      expect(ant(id).resourceOrder).toBeUndefined();
      // Back under the colony AI: any of its own jobs (the random map decides
      // which), never a state a player order holds it in
      expect([AntState.Moving, AntState.Guarding, AntState.Holding]).not.toContain(ant(id).state);
    }
    game.stop();
  });

  it('a right-click, a tap or Recolectar then a click on a food source gives it', () => {
    const { game, world, selection, screenOf, spot, workers, ant } = setup();
    const at = spot(8, 4);
    const food = createFood(world, at.x, at.y, 80, FoodType.BeetleMeat);
    const team = workers(3);
    const onFood = screenOf(at.x + 0.5, at.y - 0.3); // on the sprite, off its center

    selection.selectAnts(team, Layer.Surface);
    game['commandAt'](onFood.x, onFood.y);
    for (const id of team) expect(ant(id).resourceOrder).toBe('gather');
    expect(world.notifications.at(-1)?.message).toBe('3 obreras → recolectar carne');

    game.stopSelectedAnts();
    for (const id of team) expect(ant(id).resourceOrder).toBeUndefined();
    game['handleTap'](onFood.x, onFood.y);
    for (const id of team) expect(ant(id).resourceOrder).toBe('gather');

    game.stopSelectedAnts();
    game.armGatherTarget();
    expect(game.getStats().commandTarget).toBe('gather');
    game['handleClick'](onFood.x, onFood.y, { shift: false, ctrl: false });
    for (const id of team) expect(ant(id).resourceOrder).toBe('gather');
    expect(game.getStats().commandTarget ?? null).toBeNull();
    void food;
    game.stop();
  });

  it('soldiers in the selection do not gather; with no workers nothing happens', () => {
    const { game, world, selection, spot } = setup();
    const at = spot(7, -3);
    const food = createFood(world, at.x, at.y, 50);
    const soldier = createAnt(world, at.x - 3, at.y, AntRole.Soldier);
    selection.selectAnts([soldier], Layer.Surface);
    expect(game.orderSelectedGather(food)).toBe(0);
    expect(world.notifications.at(-1)?.message).toContain('obreras');
    game.stop();
  });
});

describe('the mine order from the player', () => {
  it('a right-click or a tap on a mineral node sends the selected workers to mine it', () => {
    const { game, world, selection, screenOf, spot, workers, ant, lastToast } = setup();
    const at = spot(9, -4);
    const node = createMineral(world, at.x, at.y);
    const team = workers(3);
    selection.selectAnts(team, Layer.Surface);
    const onNode = screenOf(at.x, at.y - 0.4);
    game['commandAt'](onNode.x, onNode.y);
    for (const id of team) {
      expect(ant(id).resourceOrder).toBe('mine');
      expect(ant(id).mineralTargetId).toBe(node);
    }
    expect(lastToast()).toBe('3 obreras → minar');

    game.stopSelectedAnts();
    const feedback: unknown[] = [];
    const off = game.onCommandFeedback((event) => feedback.push(event));
    game['handleTap'](onNode.x, onNode.y);
    off();
    for (const id of team) expect(ant(id).resourceOrder).toBe('mine');
    // A tap gets the same phone feedback as the other orders: the toast event, not a second notice
    expect(feedback).toEqual([expect.objectContaining({ type: 'order', order: 'mine', count: 3, touch: true })]);
    expect(feedbackText(feedback[0] as CommandFeedback)).toBe('3 obreras → minar');

    game.stopSelectedAnts();
    game.armMineTarget();
    expect(game.getStats().commandTarget).toBe('mine');
    game['handleClick'](onNode.x, onNode.y, { shift: false, ctrl: false });
    for (const id of team) expect(ant(id).resourceOrder).toBe('mine');
    game.stop();
  });
});

describe('resource cards', () => {
  it('a selected mineral node shows its ore and the workers mining it', () => {
    const { game, world, selection, spot, workers } = setup();
    const at = spot(9, 5);
    const node = createMineral(world, at.x, at.y);
    world.getComponent<MineralComponent>(node, COMPONENT.MINERAL)!.amount = 180;
    const team = workers(3);
    selection.selectAnts(team, Layer.Surface);
    game.orderSelectedMine(node);
    game.clearSelection();
    game.selectEntityAt(at.x, at.y);
    expect(game.getSelectedEntity()).toMatchObject({ type: 'mineral', mineralAmount: 180, mineralMax: 250, workers: 3 });
    game.stop();
  });

  it('a selected food source shows its type, what is left and the ants gathering it', () => {
    const { game, world, selection, spot, workers } = setup();
    const at = spot(-8, 4);
    const food = createFood(world, at.x, at.y, 100, FoodType.Leaf);
    world.getComponent<FoodSourceComponent>(food, COMPONENT.FOOD_SOURCE)!.amount = 80;
    const team = workers(2);
    selection.selectAnts(team, Layer.Surface);
    game.orderSelectedGather(food);
    game.clearSelection();
    game.selectEntityAt(at.x, at.y);
    expect(game.getSelectedEntity()).toMatchObject({ type: 'food', foodType: 'leaf', foodAmount: 80, foodMax: 100, workers: 2 });
    game.stop();
  });
});

describe('the colony mines on its own', () => {
  it('banks ore within the first 90 s of a run with no input, every time', () => {
    for (let run = 0; run < 3; run++) {
      const game = new GameManager(fakeCanvas());
      finishIntro(game);
      const world = game['world'] as World;
      let firstOre = -1;
      for (let i = 0; i < 90 * 30 && firstOre < 0; i++) {
        game['update'](DT);
        if (world.minerals.stored > 0) firstOre = i * DT;
      }
      expect(firstOre).toBeGreaterThan(0);
      expect(game.getStats().miners).toMatchObject({ target: 2 });
      // The home field is on the map from the start, so the player can see where the miners go
      const fog = game['visibilityGrid'] as VisibilityGrid;
      const known = world.query(COMPONENT.MINERAL, COMPONENT.POSITION).filter((id) => {
        const p = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        return fog.isExplored(Math.round(p.x), Math.round(p.y));
      });
      expect(known.length).toBeGreaterThan(0);
      game.stop();
    }
  }, 120000);
});

describe('Minar and Recolectar belong to the Swarm', () => {
  it('a Crystal or Human run gives no resource orders and keeps no autonomous ant miners', () => {
    for (const playerRace of ['crystal', 'human'] as const) {
      const game = new GameManager(fakeCanvas(), { playerRace, rivalRace: 'wildlife' });
      finishIntro(game);
      const world = game['world'] as World;
      const node = world.query(COMPONENT.MINERAL)[0];
      const food = world.query(COMPONENT.FOOD_SOURCE)[0];
      expect(game.orderSelectedMine(node)).toBe(0);
      if (food !== undefined) expect(game.orderSelectedGather(food)).toBe(0);
      for (let i = 0; i < 30 * 5; i++) game['update'](DT);
      expect(game.getMinerStatus().miners).toBe(0);
      game.stop();
    }
  });
});
