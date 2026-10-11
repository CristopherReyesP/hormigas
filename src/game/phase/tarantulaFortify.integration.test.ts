import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, AntRole, type HealthComponent, type PathComponent, type PositionComponent } from '../components/components';
import { createAnt } from '../entities/factories';
import { fakeCanvas, finishIntro, CRYSTAL_RIVAL_SETUP } from '../../test/gameManagerMocks';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { frontierCreatureOf } from './frontierCreatures';
import type { TarantulaSystem } from './TarantulaSystem';
import { FORTIFY, FORTIFY_CORE_COMPONENT, FORTIFY_DEFENSE_COMPONENT, type FortifyCoreComponent } from '../rival/fortify';
import { HUMAN_COMPONENT, type HumanBuildingComponent } from '../rival/humanComponents';

vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

const TICK = 1 / 60;

function setup(setupRun: ConstructorParameters<typeof GameManager>[1] = CRYSTAL_RIVAL_SETUP) {
  const game = new GameManager(fakeCanvas(), setupRun);
  finishIntro(game);
  const world = game['world'] as World;
  const tarantulas = game['tarantulaSystem'] as TarantulaSystem;
  const update = (dt: number) => (game as unknown as { update: (dt: number) => void }).update(dt);
  const tickFor = (seconds: number) => {
    for (let t = 0; t < seconds; t += TICK) update(TICK);
  };
  return { game, world, tarantulas, tickFor };
}

describe('the alien tarantula', () => {
  it('stays away on the first days, then comes from the edge of the zone', () => {
    const { game, tarantulas } = setup();
    expect(tarantulas.cap()).toBe(0);
    const clock = game['dayNightSystem'] as { getDayNumber(): number };
    vi.spyOn(clock, 'getDayNumber').mockReturnValue(3);
    expect(tarantulas.cap()).toBe(1);
    const id = tarantulas.spawn()!;
    expect(id).not.toBeNull();
    expect(frontierCreatureOf(game['world'] as World, id)?.kind).toBe('tarantula');
    game.stop();
  });

  it('hunts ants only: it ignores food, closes in on the nearest ant and bites it', () => {
    const { game, world, tarantulas, tickFor } = setup();
    const id = tarantulas.spawn()!;
    // On the nest's clearing (always walkable), 7 tiles from a worker
    const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const cx = Math.floor(WORLD_WIDTH / 2);
    const cy = Math.floor(WORLD_HEIGHT / 2);
    pos.x = pos.prevX = cx - 4;
    pos.y = pos.prevY = cy + 3;
    // Alone with it: the starting workers would be nearer prey
    for (const other of world.query(COMPONENT.ANT)) world.destroyEntity(other);
    const first = createAnt(world, cx + 3, cy + 3, AntRole.Worker);
    const from = { x: pos.x, y: pos.y };
    tickFor(0.2);
    // It has a route toward the ant (or already pounced)
    const path = world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
    expect(path.waypoints.length).toBeGreaterThan(0);
    // It moves on the ant's side: east, where the worker stood
    tickFor(1.5);
    expect(pos.x - from.x).toBeGreaterThan(1.5);

    // A worker within its reach: within an attack cooldown one of the two (the nearer) is bitten
    const prey = createAnt(world, pos.x + 1.2, pos.y, AntRole.Worker);
    const bitten = (ant: number) => {
      const h = world.getComponent<HealthComponent>(ant, COMPONENT.HEALTH);
      return !world.hasEntity(ant) || (h !== undefined && h.current < h.max);
    };
    tickFor(1.5);
    expect(bitten(prey) || bitten(first)).toBe(true);
    game.stop();
  });

  it('comes more often and in numbers in Phase 2', () => {
    const { game, tarantulas } = setup();
    tarantulas.setPhase2();
    expect(tarantulas.cap()).toBeGreaterThanOrEqual(3);
    game.stop();
  });
});

describe('rival bases dig in as time goes by', () => {
  it('the Crystal Hive starts dug in, then grows its hull, its obelisks and its guard, step after step', () => {
    const { game, world, tickFor } = setup();
    const hive = world.query(COMPONENT.CRYSTAL_HIVE)[0];
    const startMax = world.getComponent<HealthComponent>(hive, COMPONENT.HEALTH)!.max;
    // Two steps before the first dawn (its mutation pick pauses the run)
    tickFor(FORTIFY.interval * 2 + 1);
    const state = world.getComponent<FortifyCoreComponent>(hive, FORTIFY_CORE_COMPONENT)!;
    // It started dug in, then took two more steps
    expect(state.steps).toBe(FORTIFY.startSteps + 2);
    // Its guard grew with it: drones and sentinels
    const guards = (state.guards ?? []).filter((id) => world.hasEntity(id));
    expect(guards.length).toBeGreaterThanOrEqual(FORTIFY.guards.start + state.steps - 2);
    expect(guards.some((id) => world.getComponent<{ kind: string }>(id, COMPONENT.CRYSTAL_UNIT)?.kind === 'sentinel')).toBe(true);
    expect(world.getComponent<HealthComponent>(hive, COMPONENT.HEALTH)!.max).toBeGreaterThan(startMax);
    const obelisks = world.query(FORTIFY_DEFENSE_COMPONENT);
    expect(obelisks.length).toBeGreaterThanOrEqual(FORTIFY.startSteps);
    for (const id of obelisks) {
      expect(world.getComponent(id, COMPONENT.CRYSTAL_SPIRE)).toBeDefined();
      expect(world.getComponent(id, COMPONENT.COMBAT)).toBeDefined();
    }
    game.stop();
  });

  it('a Human base raises bunkers and calls in soldiers', () => {
    const { game, world, tickFor } = setup({ playerRace: 'swarm', rivalRace: 'human' });
    tickFor(FORTIFY.interval * 2 + 1);
    const defenses = world.query(FORTIFY_DEFENSE_COMPONENT);
    expect(defenses.length).toBeGreaterThanOrEqual(FORTIFY.startSteps);
    for (const id of defenses) {
      expect(world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)?.kind).toBe('bunker');
    }
    game.stop();
  });
});
