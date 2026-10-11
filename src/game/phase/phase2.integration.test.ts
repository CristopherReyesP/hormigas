import { describe, expect, it, vi } from 'vitest';
import { GameManager, type GameOverStats } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { COMPONENT, type PositionComponent } from '../components/components';
import { fakeCanvas, finishIntro, CRYSTAL_RIVAL_SETUP } from '../../test/gameManagerMocks';
import { PHASE1_ZONE_HEIGHT, PHASE1_ZONE_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { inBounds } from '../../simulation/world/frontier';
import { FRONTIER_CREATURE_COMPONENT, FRONTIER_DEN_COMPONENT, frontierCreatureOf } from './frontierCreatures';
import { captureSave, restoreSave } from '../save/snapshot';

// Real manager and map; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

const TICK = 1 / 60;

function setup(setupRun: ConstructorParameters<typeof GameManager>[1] = CRYSTAL_RIVAL_SETUP) {
  const game = new GameManager(fakeCanvas(), setupRun);
  finishIntro(game);
  const world = game['world'] as World;
  const grid = game['grid'] as TileGrid;
  const fog = game['visibilityGrid'] as VisibilityGrid;
  const state = game as unknown as { gameOver: GameOverStats | null; update: (dt: number) => void };
  /** Scout the whole zone and wipe out its dens: the dominion is full */
  const dominate = () => {
    fog.revealCircle(Math.floor(WORLD_WIDTH / 2), Math.floor(WORLD_HEIGHT / 2), 120);
    for (const store of [COMPONENT.BEETLE_DEN, COMPONENT.CRICKET_DEN]) {
      for (const id of world.query(store)) {
        world.destroyEntity(id);
        world.metrics.densDestroyed++;
      }
    }
  };
  const tickFor = (seconds: number) => {
    for (let t = 0; t < seconds; t += TICK) state.update(TICK);
  };
  return { game, world, grid, state, dominate, tickFor };
}

describe('Phase 2: La Frontera Salvaje, in a real run', () => {
  it('starts inside the thorn wall: the outer ring is sealed and the camera stays on the zone', () => {
    const { game, grid } = setup();
    expect(grid.frontier).not.toBeNull();
    expect(grid.isWalkable(1, 1)).toBe(false);
    expect(grid.isSealed(1, 1)).toBe(true);
    expect(game.getSurfaceArea()).toMatchObject({ width: PHASE1_ZONE_WIDTH, height: PHASE1_ZONE_HEIGHT });
    expect(game.getStats().frontier).toMatchObject({ phase: 1, coreNeeded: true, coreDestroyed: false });
    game.stop();
  });

  it('needs the rival core AND the dominion; then a meteor shower brings more rivals, the picked one first', () => {
    const { game, world, grid, state, dominate, tickFor } = setup();
    dominate();
    tickFor(1.5);
    // The dominion alone does not open it
    expect(game.getStats().frontier?.phase).toBe(1);
    expect(grid.frontier).not.toBeNull();

    // The core falls: victory, and "Seguir jugando" opens the frontier
    const zone = grid.frontier!;
    for (const id of world.query(COMPONENT.CRYSTAL_HIVE)) world.destroyEntity(id);
    state.update(TICK);
    expect(state.gameOver?.outcome).toBe('victory');
    expect(game.continueAfterVictory()).toBe(true);
    tickFor(1.5);

    const stats = game.getStats();
    expect(stats.frontier?.phase).toBe(2);
    expect(grid.frontier).toBeNull();
    expect(game.getSurfaceArea()).toMatchObject({ x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT });
    expect(stats.frontierBanner?.title).toContain('FASE 2');

    // The meteor shower: 2 Hives of the picked rival and a Human base, all on the new ground
    const hives = world.query(COMPONENT.CRYSTAL_HIVE, COMPONENT.POSITION);
    expect(hives).toHaveLength(2);
    const cores = game['phase2Cores'] as number[];
    expect(cores).toHaveLength(3);
    for (const id of cores) {
      const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      expect(inBounds(zone, pos.x, pos.y)).toBe(false);
    }
    expect(stats.frontier?.basesLeft).toBe(3);
    // And the wildlife beyond the wall
    const kinds = new Set(world.query(FRONTIER_CREATURE_COMPONENT).map((id) => frontierCreatureOf(world, id)!.kind));
    expect(kinds).toEqual(new Set(['legion_queen', 'legionary', 'spider', 'mantis']));
    expect(world.query(FRONTIER_DEN_COMPONENT).length).toBeGreaterThanOrEqual(2);

    // Every new base destroyed is not enough: the Legionary nest and Queen too
    for (const id of cores) world.destroyEntity(id);
    state.update(TICK);
    expect(state.gameOver).toBeNull();
    const frontier = game['frontierSystem'] as { legionNestId: number; legionQueenId: number };
    world.destroyEntity(frontier.legionNestId);
    world.destroyEntity(frontier.legionQueenId);
    state.update(TICK);
    expect(state.gameOver).toMatchObject({ outcome: 'victory', frontierConquered: true });
    expect(game.continueAfterVictory()).toBe(true);
    state.update(TICK);
    expect(state.gameOver).toBeNull();
    game.stop();
  });

  it('against Fauna salvaje, the dominion alone opens it and the legionaries raid with the waves', () => {
    const { game, world, dominate, tickFor } = setup({ playerRace: 'swarm', rivalRace: 'wildlife' });
    dominate();
    tickFor(1.5);
    expect(game.getStats().frontier?.phase).toBe(2);
    // Every rival race comes: a Hive and a Human base, and the Legionary nest
    expect(world.query(COMPONENT.CRYSTAL_HIVE)).toHaveLength(1);
    expect(game['phase2Cores'] as number[]).toHaveLength(2);
    const frontier = game['frontierSystem'] as { launchRaid(n: number): number[]; raidOrigin(): unknown };
    expect(frontier.raidOrigin()).not.toBeNull();
    const raiders = frontier.launchRaid(4);
    expect(raiders).toHaveLength(4);
    expect(raiders.every((id) => frontierCreatureOf(world, id)?.raider)).toBe(true);
    // Raiders march: a few seconds later they have a route
    tickFor(2);
    const moving = raiders.filter((id) => world.hasEntity(id) && (world.getComponent<{ waypoints: unknown[] }>(id, COMPONENT.PATH)?.waypoints.length ?? 0) > 0);
    expect(moving.length).toBeGreaterThan(0);
    game.stop();
  });

  it('the waves split their raiders across every rival still standing', () => {
    const { game, world, dominate, tickFor } = setup({ playerRace: 'swarm', rivalRace: 'wildlife' });
    dominate();
    tickFor(1.5);
    const invasion = game['invasionSystem'] as unknown as { raidSource: { launch(n: number): number[] } };
    const sent = invasion.raidSource.launch(6);
    // 6 asked, +50% per base standing (2): 12 raiders from the Hive, the Human base and the nest
    expect(sent.length).toBeGreaterThanOrEqual(9);
    const kinds = new Set(sent.map((id) => (world.getComponent(id, COMPONENT.CRYSTAL_UNIT) ? 'crystal' : frontierCreatureOf(world, id) ? 'legion' : 'human')));
    expect(kinds.size).toBe(3);
    game.stop();
  });

  it('a save made in Phase 2 loads with the frontier open', () => {
    const { game, dominate, tickFor } = setup({ playerRace: 'swarm', rivalRace: 'wildlife' });
    dominate();
    tickFor(1.5);
    const save = captureSave(game);
    game.stop();
    const loaded = restoreSave(fakeCanvas(), JSON.parse(JSON.stringify(save)));
    expect((loaded['grid'] as TileGrid).frontier).toBeNull();
    expect(loaded.getStats().frontier?.phase).toBe(2);
    expect(loaded.getSurfaceArea()).toMatchObject({ width: WORLD_WIDTH, height: WORLD_HEIGHT });
    // Every rival race's systems are back, with their bases
    const names = (loaded['world'] as unknown as { systems: Array<{ name: string }> }).systems.map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(['CrystalHiveSystem', 'HumanBaseSystem', 'FrontierSystem']));
    expect(loaded.getStats().frontier?.basesLeft).toBe(2);
    loaded.stop();
  });
});
