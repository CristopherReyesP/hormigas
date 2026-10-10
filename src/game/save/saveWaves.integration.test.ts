import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import type { Camera } from '../../engine/camera/Camera';
import type { TileGrid } from '../../simulation/world/TileGrid';
import { COMPONENT, Layer, type PositionComponent } from '../components/components';
import { FactionId, ownerOf } from '../factions/factions';
import type { RivalId, RunSetup } from '../run/RunSetup';
import { BOSS_COMPONENT } from '../run/miniBoss';
import { ELITE_COMPONENT } from '../run/eliteAffixes';
import { STRUCTURE_COMPONENT } from '../systems/DefenseSystem';
import { HUMAN_COMPONENT, type HumanBuildingComponent } from '../rival/humanComponents';
import type { SelectionSystem } from '../systems/SelectionSystem';
import { TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';
import { captureSave, restoreSave, serializeState } from './snapshot';
import { parseSave, stringifySave } from './format';
import { stateDiff } from './stateDiff';
import { WAVE_MARCH_COMPONENT, type WaveMarchComponent } from '../run/waveMarch';

vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());
vi.setConfig({ testTimeout: 120_000 });

const DT = 1 / 60;
const NX = Math.floor(WORLD_WIDTH / 2);
const NY = Math.floor(WORLD_HEIGHT / 2);

function start(setup: RunSetup): GameManager {
  const game = new GameManager(fakeCanvas(), setup);
  finishIntro(game);
  return game;
}

function run(game: GameManager, seconds: number): void {
  const g = game as unknown as { update(dt: number): void };
  for (let i = 0; i < Math.round(seconds / DT); i++) g['update'](DT);
}

function reload(game: GameManager): GameManager {
  const parsed = parseSave(stringifySave(captureSave(game)));
  if (!parsed.ok) throw new Error(parsed.reason);
  return restoreSave(fakeCanvas(), parsed.save);
}

function expectSameState(actual: GameManager, expected: GameManager): void {
  const a = serializeState(actual);
  const b = serializeState(expected);
  expect(stateDiff(JSON.parse(a), JSON.parse(b))).toEqual([]);
  expect(a).toBe(b);
}

/** Entities carrying `component`, as a sorted id list */
const idsOf = (game: GameManager, component: string) => (game['world'] as World).query(component).sort((a, b) => a - b);

describe.each<RivalId>(['crystal', 'human'])('saving mid-wave: Swarm vs %s, with elites, a boss and an Espina', (rival) => {
  it('round-trips and continues in lockstep', () => {
    const a = start({ playerRace: 'swarm', rivalRace: rival });
    const world = a['world'] as World;
    const surface = a['grid'] as TileGrid;
    const camera = a['camera'] as Camera;
    // An Espina east of the nest
    world.minerals.deposit(300);
    a.setDefenseBuild('spine');
    let spot: { x: number; y: number } | null = null;
    for (let x = NX + 4; x < NX + 10 && !spot; x++) if (surface.isWalkable(x, NY)) spot = { x, y: NY };
    const p = camera.worldToScreen((spot!.x + 0.5) * TILE_SIZE, (spot!.y + 0.5) * TILE_SIZE);
    a['handleClick'](p.x, p.y, { shift: false, ctrl: false });
    a.setDefenseBuild(null);
    expect(idsOf(a, STRUCTURE_COMPONENT)).toHaveLength(1);
    // Wave 6: elites and the boss
    (a['invasionSystem'] as unknown as { waveNumber: number }).waveNumber = 5;
    const scouted = a.getStats().invasion.next;
    expect(scouted?.boss).toBeTruthy();
    (a['dayNightSystem'] as unknown as { phaseTimer: number }).phaseTimer = 0.05;
    run(a, 6);
    expect(a.getStats().invasion.active).toBe(true);
    expect(idsOf(a, ELITE_COMPONENT).length).toBeGreaterThan(0);
    expect(idsOf(a, BOSS_COMPONENT).length).toBeGreaterThan(0);

    const b = reload(a);
    expectSameState(b, a);
    for (const component of [ELITE_COMPONENT, BOSS_COMPONENT, STRUCTURE_COMPONENT]) {
      expect(idsOf(b, component)).toEqual(idsOf(a, component));
    }
    const infoA = a.getStats().invasion;
    const infoB = b.getStats().invasion;
    expect(infoB.boss).toEqual(infoA.boss);
    expect({ ...infoB, threats: [] }).toEqual({ ...infoA, threats: [] });
    expect(b.getStats().defenseBuild ?? null).toBeNull();

    const errors = vi.spyOn(console, 'error');
    run(a, 6);
    run(b, 6);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    expectSameState(b, a);
    a.stop();
    b.stop();
  });

  it('keeps the scouted breach of the next wave', () => {
    const a = start({ playerRace: 'swarm', rivalRace: rival });
    run(a, 3);
    const next = a.getStats().invasion.next;
    expect(next?.entrance).toBeTruthy();
    const b = reload(a);
    expect(b.getStats().invasion.next).toEqual(next);
    a.stop();
    b.stop();
  });
});

describe('saving a Humans player run against the Crystal Hive', () => {
  it('round-trips the base, a building under construction, the training queue and the builders', () => {
    const a = start({ playerRace: 'human', rivalRace: 'crystal' });
    const world = a['world'] as World;
    const selection = a['selectionSystem'] as SelectionSystem;
    const human = a.getHumanPlayer()!;
    const mine = (type: string) => world.query(HUMAN_COMPONENT.UNIT).filter((id) => ownerOf(world, id) === FactionId.PLAYER
      && world.getComponent<{ type: string }>(id, HUMAN_COMPONENT.UNIT)!.type === type);
    const builders = mine('builder');
    expect(builders.length).toBeGreaterThan(1);
    // Builders on a mineral node
    selection.selectAnts(builders.slice(1), Layer.Surface);
    const node = world.query(COMPONENT.MINERAL).map((id) => ({ id, p: world.getComponent<PositionComponent>(id, COMPONENT.POSITION)! }))
      .sort((x, y) => Math.hypot(x.p.x - NX, x.p.y - NY) - Math.hypot(y.p.x - NX, y.p.y - NY))[0];
    expect(human.commandAt({ x: node.p.x, y: node.p.y })).toBe(true);
    // A barracks frame going up
    world.minerals.deposit(400);
    selection.selectAnts([builders[0]], Layer.Surface);
    expect(human.beginPlacement('barracks')).toBeNull();
    expect(human.clickAt({ x: NX - 6, y: NY - 6 }, false)).toBe(true);
    // Two builders queued at the command center
    expect(human.selectCore()).toBe(true);
    human.addRations(500);
    expect(human.train('builder')).toBeNull();
    expect(human.train('builder')).toBeNull();
    run(a, 4);
    const buildings = () => world.query(HUMAN_COMPONENT.BUILDING).filter((id) => ownerOf(world, id) === FactionId.PLAYER);
    // Humans start with a finished Cuartel: the frame placed above is the newest one
    const barracks = Math.max(...buildings().filter((id) => world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind === 'barracks'));
    expect(world.getComponent<HumanBuildingComponent>(barracks, HUMAN_COMPONENT.BUILDING)!.constructing).toBeGreaterThan(0);

    const save = captureSave(a);
    expect(save.meta).toMatchObject({ playerRace: 'human', rivalRace: 'crystal' });
    expect(save.meta.ants).toBe(Object.values(a.getStats().human!.units).reduce((n, v) => n + v, 0));
    expect(save.meta.ants).toBeGreaterThan(0);
    const b = reload(a);
    expect(b.getRunSetup()).toEqual({ playerRace: 'human', rivalRace: 'crystal' });
    expect(b.getHumanPlayer()).not.toBeNull();
    expect(b.getHumanPlayer()!.coreId).toBe(human.coreId);
    expectSameState(b, a);
    const statsA = a.getStats().human!;
    const statsB = b.getStats().human!;
    for (const key of ['rations', 'minerals', 'supply', 'supplyCap', 'units', 'idleBuilders'] as const) {
      expect(statsB[key]).toEqual(statsA[key]);
    }
    // The queue is kept by the building (the selection itself is not saved)
    (b['selectionSystem'] as SelectionSystem).selectOnly(human.coreId!);
    selection.selectOnly(human.coreId!);
    expect(b.getStats().human!.selected?.queue).toEqual(a.getStats().human!.selected?.queue);
    expect(b.getStats().human!.selected?.queue.length).toBeGreaterThan(0);

    run(a, 8);
    run(b, 8);
    expectSameState(b, a);
    expect(b.getStats().human!.units).toEqual(a.getStats().human!.units);
    a.stop();
    b.stop();
  });
});

describe('saving while a night wave marches on the nest', () => {
  it('round-trips the column, its road and holes, a unit digging in, and continues in lockstep', () => {
    const a = start({ playerRace: 'swarm', rivalRace: 'wildlife' });
    const world = a['world'] as World;
    (a['invasionSystem'] as unknown as { waveNumber: number }).waveNumber = 4;
    const next = a.getStats().invasion.next!;
    expect(next.wildlife).toBeTruthy();
    expect(next.hole).toBeTruthy();
    (a['dayNightSystem'] as unknown as { phaseTimer: number }).phaseTimer = 0.05;
    run(a, 6);
    // Mid-march: the column on the surface, units still leaving the edge
    const marching = () => idsOf(a, WAVE_MARCH_COMPONENT);
    expect(marching().length).toBeGreaterThan(0);
    expect(a.getInvaderCount('underground')).toBe(0);

    let b = reload(a);
    expectSameState(b, a);
    expect(idsOf(b, WAVE_MARCH_COMPONENT)).toEqual(marching());
    for (const id of marching()) {
      expect((b['world'] as World).getComponent(id, WAVE_MARCH_COMPONENT)).toEqual(world.getComponent(id, WAVE_MARCH_COMPONENT));
    }
    expect(b.getStats().invasion).toEqual(a.getStats().invasion);
    expect(b.getScoutMarks('surface')).toEqual(a.getScoutMarks('surface'));

    // Save again while a unit is digging into its hole
    const digging = () => idsOf(a, WAVE_MARCH_COMPONENT)
      .some((id) => world.getComponent<WaveMarchComponent>(id, WAVE_MARCH_COMPONENT)!.phase === 'digging');
    for (let t = 0; t < 60 && !digging(); t += 0.25) {
      run(a, 0.25);
      run(b, 0.25);
    }
    expect(digging()).toBe(true);
    expectSameState(b, a);
    b.stop();
    b = reload(a);
    expectSameState(b, a);

    // Both break in the same way afterwards
    run(a, 10);
    run(b, 10);
    expectSameState(b, a);
    expect(a.getInvaderCount('underground')).toBeGreaterThan(0);
    expect(b.getInvaderCount('underground')).toBe(a.getInvaderCount('underground'));
    a.stop();
    b.stop();
  });
});
