import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import { TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { COMPONENT, type PositionComponent } from '../components/components';
import { FactionId, ownerOf } from '../factions/factions';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent } from '../rival/humanComponents';
import type { RunSetup } from '../run/RunSetup';
import type { IntroArrival } from './introArrival';
import { INTRO_TIMELINE as T, type IntroClock } from './introTimeline';
import { fakeCanvas } from '../../test/gameManagerMocks';

// Real manager, map, bases, intro clock and director; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
/** What the GameManager handed the (fake) render system for the opening */
const staged: Array<{ crater: { x: number; y: number }; clock: IntroClock; arrival: IntroArrival | undefined }> = [];
const art = { skips: 0 };
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem({
  startMeteorIntro(crater: { x: number; y: number }, _nest: unknown, clock: IntroClock, arrival?: IntroArrival) {
    staged.push({ crater, clock, arrival });
  },
  skipIntro() { art.skips++; return true; },
}));
vi.stubGlobal('window', new EventTarget());

const HOME = { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) };
const FRAME = 1 / 60;
const MAX_FRAMES = 60 * 30;
const games: GameManager[] = [];

function run(setup: RunSetup) {
  staged.length = 0;
  art.skips = 0;
  const canvas = fakeCanvas();
  const game = new GameManager(canvas, setup);
  games.push(game);
  expect(staged).toHaveLength(1);
  const { crater, clock, arrival } = staged[0];
  const world = game['world'];
  const tileOf = (id: number) => {
    const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    return { x: pos.x, y: pos.y };
  };
  const runTo = (t: number) => {
    for (let i = 0; i < MAX_FRAMES && clock.elapsed < t; i++) game['render'](0, FRAME);
  };
  const director = game['introDirector'] as unknown as { impact: { x: number; y: number }; isActive(): boolean };
  return { game, canvas, world, crater, clock, arrival: arrival!, tileOf, runTo, director };
}

const center = (t: { x: number; y: number }) => ({ x: t.x * TILE_SIZE + TILE_SIZE / 2, y: t.y * TILE_SIZE + TILE_SIZE / 2 });

afterEach(() => {
  for (const game of games.splice(0)) game.stop();
});

describe('a Crystal player opens on their own Hive', () => {
  it('Crystal vs Humanos: the meteor lands on the Hive at the center, the drones on their posts', () => {
    const { game, world, crater, arrival, tileOf, director } = run({ playerRace: 'crystal', rivalRace: 'human' });
    expect(arrival.variant).toBe('crystal-player');
    expect(arrival.target).toEqual(HOME);
    expect(crater).toEqual(HOME);
    const hive = world.query(COMPONENT.CRYSTAL_HIVE).find((id) => ownerOf(world, id) === FactionId.PLAYER)!;
    const at = tileOf(hive);
    expect({ x: Math.round(at.x), y: Math.round(at.y) }).toEqual(HOME);
    expect(director.impact).toEqual(center(HOME));
    // The intro's drones park where the real starting drones stand
    const drones = world.query(COMPONENT.CRYSTAL_UNIT).filter((id) => ownerOf(world, id) === FactionId.PLAYER).map(tileOf);
    expect(arrival.drones).toEqual(drones);
    // It ends on the rival: the Human command center
    const cc = world.query(HUMAN_COMPONENT.BUILDING, COMPONENT.POSITION)
      .find((id) => world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind === 'command_center')!;
    const site = tileOf(cc);
    expect(arrival.rivalBase).toEqual({ x: Math.round(site.x), y: Math.round(site.y) });
    expect(arrival.rival).toBe('human');
    expect(arrival.rivalLine).toBe('RIVAL: HUMANOS');
    expect(arrival.from).toBeDefined();
    expect(game.getStats().introPlaying).toBe(true);
  });

  it('holds the simulation under the intro, and a key after the impact skips it and starts the run', () => {
    const { game, world, tileOf, runTo } = run({ playerRace: 'crystal', rivalRace: 'human' });
    const drones = () => world.query(COMPONENT.CRYSTAL_UNIT).filter((id) => ownerOf(world, id) === FactionId.PLAYER).map(tileOf);
    const clock = () => game['dayNightSystem'].getPhaseRemaining();
    const before = { day: clock(), drones: drones(), minerals: world.minerals.stored };
    for (let i = 0; i < 60; i++) game['update'](0.05);
    expect(clock()).toBe(before.day);
    expect(drones()).toEqual(before.drones);
    expect(world.minerals.stored).toBe(before.minerals);

    runTo(T.meteorStart + 0.5);
    window.dispatchEvent(new Event('keydown'));
    expect(game.getStats().introPlaying).toBe(true);
    runTo(T.impact + 0.1);
    window.dispatchEvent(new Event('keydown'));
    expect(art.skips).toBe(1);
    expect(game.getStats().introPlaying).toBe(false);
    expect(game['camera'].isDirected()).toBe(false);
    for (let i = 0; i < 5; i++) game['update'](0.05);
    expect(clock()).toBeLessThan(before.day);
  });
});

describe('a Human player opens on the expedition landing', () => {
  it('Humanos vs Crystal: the dropship lands on the center Command Center and raises the Cuartel', () => {
    const { game, world, arrival, tileOf, director } = run({ playerRace: 'human', rivalRace: 'crystal' });
    expect(arrival.variant).toBe('human-player');
    expect(arrival.target).toEqual(HOME);
    expect(director.impact).toEqual(center(HOME));
    const mine = world.query(HUMAN_COMPONENT.BUILDING).filter((id) => ownerOf(world, id) === FactionId.PLAYER);
    const kinds = mine.map((id) => world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind);
    expect(arrival.base?.buildings[0]).toMatchObject({ kind: 'command_center', ...HOME });
    expect(arrival.base?.buildings.map((b) => b.kind).sort()).toEqual([...kinds].sort());
    expect(kinds).toContain('barracks');
    const troops = world.query(HUMAN_COMPONENT.UNIT).filter((id) => ownerOf(world, id) === FactionId.PLAYER);
    expect(arrival.base?.troops).toHaveLength(troops.length);
    const builders = troops.filter((id) => world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type === 'builder');
    expect(arrival.base?.troops.filter((t) => t.builder)).toHaveLength(builders.length);
    // It ends on the rival: the Crystal Hive at the crater
    expect(arrival.rivalBase).toEqual(game.getCraterSite());
    expect(arrival.rivalLine).toBe('RIVAL: COLMENA DE CRISTAL');
    const rivalHive = world.query(COMPONENT.CRYSTAL_HIVE).find((id) => ownerOf(world, id) !== FactionId.PLAYER)!;
    const hiveAt = tileOf(rivalHive);
    expect({ x: Math.round(hiveAt.x), y: Math.round(hiveAt.y) }).toEqual(game.getCraterSite());
    expect(game.getStats().introPlaying).toBe(true);
  });

  it('holds the simulation under the intro, and a tap after the landing skips it', () => {
    const { game, canvas, runTo } = run({ playerRace: 'human', rivalRace: 'crystal' });
    const clock = () => game['dayNightSystem'].getPhaseRemaining();
    const day = clock();
    for (let i = 0; i < 60; i++) game['update'](0.05);
    expect(clock()).toBe(day);
    runTo(T.impact + 0.1);
    canvas.dispatchEvent(new Event('pointerdown'));
    expect(art.skips).toBe(1);
    expect(game.getStats().introPlaying).toBe(false);
    for (let i = 0; i < 5; i++) game['update'](0.05);
    expect(clock()).toBeLessThan(day);
  });

  it('plays to the end on its own and hands the camera back on home', () => {
    const { game, runTo, director } = run({ playerRace: 'human', rivalRace: 'wildlife' });
    runTo(T.end);
    expect(game.getStats().introPlaying).toBe(false);
    expect(director.isActive()).toBe(false);
    const view = game['camera'].screenToWorld(game['camera'].getViewport().w / 2, game['camera'].getViewport().h / 2);
    expect(Math.round(view.x / TILE_SIZE - 0.5)).toBe(HOME.x);
  });
});
