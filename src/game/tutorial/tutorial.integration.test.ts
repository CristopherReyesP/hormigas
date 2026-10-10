import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import type { Camera } from '../../engine/camera/Camera';
import type { SelectionSystem } from '../systems/SelectionSystem';
import { AntRole, COMPONENT, Layer, type AntComponent, type LayerComponent, type PositionComponent } from '../components/components';
import { TILE_SIZE, UNDERGROUND_HEIGHT, UNDERGROUND_WIDTH } from '../../shared/constants';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';
import { TutorialController } from './TutorialController';
import { TUTORIAL_SETUP, createTutorialGame } from './createTutorialGame';
import type { TutorialEvent } from './TutorialMachine';

vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

afterEach(() => {
  vi.restoreAllMocks();
});

const DT = 1 / 20;

function setup() {
  const game = createTutorialGame((setup) => new GameManager(fakeCanvas(), setup));
  finishIntro(game);
  const camera = game['camera'] as Camera;
  camera.setCanvasSize(800, 600);
  const controller = new TutorialController(game);
  controller.start();
  const world = game['world'] as World;
  const selection = game['selectionSystem'] as SelectionSystem;
  const tick = (seconds: number) => {
    for (let t = 0; t < seconds; t += DT) game['update'](DT);
  };
  /** Run the world until the current step completes (or give up) */
  const playUntilStepDone = (maxSeconds: number): TutorialEvent[] => {
    const seen: TutorialEvent[] = [];
    for (let t = 0; t < maxSeconds; t += 0.5) {
      tick(0.5);
      const events = controller.poll();
      seen.push(...events);
      if (events.some((e) => e.type === 'step-done')) return seen;
    }
    return seen;
  };
  const surfaceAnts = (role: AntRole) =>
    world.query(COMPONENT.ANT, COMPONENT.POSITION).filter((id) => {
      const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface;
      return ant.role === role && layer === Layer.Surface;
    });
  return { game, camera, controller, world, selection, tick, playUntilStepDone, surfaceAnts };
}

const stepDone = (events: TutorialEvent[]) => events.some((e) => e.type === 'step-done');

// Whole simulated minutes of a real run: slow on a busy machine
describe('tutorial with the real GameManager', { timeout: 60_000 }, () => {
  it('runs a calm Swarm skirmish against wildlife on a seeded map', () => {
    expect(TUTORIAL_SETUP).toEqual({ playerRace: 'swarm', rivalRace: 'wildlife' });
    const a = setup();
    const b = setup();
    // Seeded: the same crater and the same food in both runs
    expect(a.game.getCraterSite()).toEqual(b.game.getCraterSite());
    const foodAt = (w: World) => w.query(COMPONENT.FOOD_SOURCE, COMPONENT.POSITION).map((id) => w.getComponent<PositionComponent>(id, COMPONENT.POSITION)!).map((p) => `${p.x},${p.y}`).sort();
    expect(foodAt(a.world)).toEqual(foodAt(b.world));
  });

  it('holds the day clock: no dusk, no night and no wave while the tutorial runs', () => {
    const { game, tick, controller } = setup();
    const before = game.getStats().phaseRemaining;
    const world = game['world'] as World;
    let wildlifeSeen = 0;
    for (let t = 0; t < 200; t += 2) {
      tick(2);
      controller.poll();
      wildlifeSeen = Math.max(wildlifeSeen, world.query(COMPONENT.BEETLE).length + world.query(COMPONENT.CRICKET).length);
    }
    const stats = game.getStats();
    // No random events and no wildlife wandering in
    expect(stats.activeEvents).toEqual([]);
    expect(wildlifeSeen).toBe(0);
    expect(stats.dayPhase).toBe('day');
    expect(stats.phaseRemaining).toBe(before);
    expect(stats.invasion.armed).toBe(false);
    expect(stats.invasion.waveNumber).toBe(0);
    // Leaving the tutorial gives the clock back
    controller.exit();
    tick(2);
    expect(game.getStats().phaseRemaining).toBeLessThan(before);
  });

  it('a remount (dispose, then start again) keeps the clock held and the lessons staged once', () => {
    const { game, tick, controller, world } = setup();
    controller.dispose();
    controller.start();
    const before = game.getStats().phaseRemaining;
    tick(5);
    expect(game.getStats().phaseRemaining).toBe(before);
    expect(world.query(COMPONENT.BEETLE_DEN)).toHaveLength(1);
  });

  it('only the weak tutorial den is left on the map', () => {
    const { world, controller } = setup();
    const dens = world.query(COMPONENT.BEETLE_DEN);
    expect(dens).toHaveLength(1);
    expect(controller.focus('den')).not.toBeNull();
    expect(controller.focus('minerals')).not.toBeNull();
  });

  it('simulated player actions walk through all ten steps', () => {
    const { game, camera, controller, world, selection, playUntilStepDone, surfaceAnts, tick } = setup();
    const next = () => controller.next();
    expect(controller.state).toMatchObject({ stepIndex: 0, phase: 'active' });

    // 1. Camera: pan, then zoom
    expect(controller.poll()).toEqual([]);
    const view = game.getActiveView();
    camera.centerOn((view.x + view.w / 2 + 6) * TILE_SIZE, (view.y + view.h / 2) * TILE_SIZE);
    controller.poll();
    camera.setZoom(camera.getZoom() * 1.5);
    expect(stepDone(controller.poll())).toBe(true);
    expect(controller.state.stars).toBe(1);
    next();

    // 2. Select one ant, then a group
    controller.poll();
    const workers = surfaceAnts(AntRole.Worker);
    const first = world.getComponent<PositionComponent>(workers[0], COMPONENT.POSITION)!;
    game.selectEntityAt(first.x, first.y);
    controller.poll();
    expect(controller.state.goalIndex).toBe(1);
    selection.selectAnts(workers.slice(0, 4), Layer.Surface);
    expect(stepDone(controller.poll())).toBe(true);
    next();

    // 3. Move them
    controller.poll();
    const nest = game.getTutorialStage().nest;
    expect(game.orderSelectedMove(nest.x + 3, nest.y + 3)).toBeGreaterThan(0);
    expect(stepDone(controller.poll())).toBe(true);
    next();

    // 4. Food comes home
    game.clearSelection();
    controller.poll();
    expect(stepDone(playUntilStepDone(120))).toBe(true);
    next();

    // 5. Into the nest: dig a tunnel, mark a pantry tile
    controller.poll();
    game.enterUnderground();
    controller.poll();
    const cx = Math.floor(UNDERGROUND_WIDTH / 2);
    const cy = Math.floor(UNDERGROUND_HEIGHT / 2);
    let dug = false;
    for (let y = cy + 2; y < UNDERGROUND_HEIGHT - 1 && !dug; y++) dug = game.designateDig(cx, y);
    expect(dug).toBe(true);
    controller.poll();
    const grid = game.getUndergroundGrid();
    let marked = false;
    for (let x = 1; x < UNDERGROUND_WIDTH - 1 && !marked; x++) {
      const tile = grid.getTile(x, cy);
      if (tile?.walkable && tile.chamberType === null) marked = game.designateStorage(x, cy);
    }
    expect(marked).toBe(true);
    expect(stepDone(controller.poll())).toBe(true);
    next();

    // 6. Breed a worker; the nurses carry the egg to incubation
    controller.poll();
    expect(game.queueBreed(AntRole.Worker)).toBe(true);
    controller.poll();
    expect(controller.state.goalIndex).toBe(1);
    expect(stepDone(playUntilStepDone(120))).toBe(true);
    next();

    // 7. Minerals: back on the surface, the workers mine the field by the nest
    game.exitUnderground();
    controller.poll();
    expect(stepDone(playUntilStepDone(180))).toBe(true);
    next();

    // 8. Hormi lends soldiers: select them, press Atacar, pick the den
    controller.poll();
    const soldiers = surfaceAnts(AntRole.Soldier);
    expect(soldiers.length).toBeGreaterThanOrEqual(3);
    selection.selectAnts(soldiers, Layer.Surface);
    controller.poll();
    game.armAttackTarget();
    expect(game.getStats().commandTarget).toBe('attack');
    controller.poll();
    // Hormi brings the camera to the den, and Atacar stays armed
    const denAt = controller.focus('den')!;
    const v = game.getActiveView();
    expect(Math.abs(v.x + v.w / 2 - (denAt.x + 0.5))).toBeLessThan(2);
    expect(game.getStats().commandTarget).toBe('attack');
    const denId = world.query(COMPONENT.BEETLE_DEN)[0];
    expect(game.orderSelectedAttack(denId)).toBeGreaterThan(0);
    controller.poll();
    expect(stepDone(playUntilStepDone(120))).toBe(true);
    expect(world.hasEntity(denId)).toBe(false);
    next();

    // 9. The practice wave: two weak beetles; the soldiers send them off
    controller.poll();
    const practice = controller.focus('practice');
    expect(practice).not.toBeNull();
    selection.selectAnts(surfaceAnts(AntRole.Soldier), Layer.Surface);
    game.orderSelectedMove(Math.round(practice!.x), Math.round(practice!.y), true);
    expect(stepDone(playUntilStepDone(120))).toBe(true);
    next();

    // 10. Wrap-up waits for the player to say they are ready
    controller.poll();
    tick(1);
    expect(controller.poll()).toEqual([]);
    controller.ack();
    expect(stepDone(controller.poll())).toBe(true);
    expect(next()).toEqual([{ type: 'finished' }]);
    expect(controller.state.stars).toBe(10);
    // The run goes on as a normal game, with the clock running again
    const before = game.getStats().phaseRemaining;
    tick(1);
    expect(game.getStats().phaseRemaining).toBeLessThan(before);
    expect(game.getStats().gameOver).toBeNull();
  });

  it('skipping a step still stages what later steps need', () => {
    const { controller, surfaceAnts } = setup();
    for (let i = 0; i < 7; i++) controller.skipStep();
    expect(controller.state.stepIndex).toBe(7);
    expect(surfaceAnts(AntRole.Soldier).length).toBeGreaterThanOrEqual(3);
    controller.skipStep();
    expect(controller.focus('practice')).not.toBeNull();
  });
});
