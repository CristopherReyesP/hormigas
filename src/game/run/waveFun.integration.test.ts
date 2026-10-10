import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import type { Camera } from '../../engine/camera/Camera';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { COMPONENT, Layer, type LayerComponent, type PositionComponent } from '../components/components';
import { TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { fakeCanvas, finishIntro, CRYSTAL_RIVAL_SETUP } from '../../test/gameManagerMocks';
import { DEFENSE_STATS } from './defenses';
import { BOSS_COMPONENT, type BossComponent } from './miniBoss';
import { ELITE_COMPONENT } from './eliteAffixes';
import { dealDamage } from './waveRuntime';
import { waveClearReward } from './waveRewards';
import { waveComposition } from './waveComposition';
import { STRUCTURE_COMPONENT, type StructureComponent } from '../systems/DefenseSystem';
import { HUMAN_COMPONENT, type HumanUnitComponent } from '../rival/humanComponents';

vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

afterEach(() => vi.restoreAllMocks());

const DT = 1 / 30;
const NX = Math.floor(WORLD_WIDTH / 2);
const NY = Math.floor(WORLD_HEIGHT / 2);

function setup(setup: { playerRace: 'swarm'; rivalRace: 'crystal' | 'human' | 'wildlife' } = CRYSTAL_RIVAL_SETUP) {
  const game = new GameManager(fakeCanvas(), setup);
  finishIntro(game);
  const world = game['world'] as World;
  const camera = game['camera'] as Camera;
  const surface = game['grid'] as TileGrid;
  const ug = game['undergroundGrid'] as UndergroundGrid;
  const dayNight = game['dayNightSystem'] as unknown as { phaseTimer: number };
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) game['update'](DT);
  };
  const screenOf = (x: number, y: number) => camera.worldToScreen((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
  const structures = () => world.query(STRUCTURE_COMPONENT).map((id) => world.getComponent<StructureComponent>(id, STRUCTURE_COMPONENT)!);
  /** A free walkable tile `d` tiles east of the nest */
  const buildSpot = (d: number, dy = 0) => {
    for (let x = NX + d; x < NX + d + 4; x++) if (surface.isWalkable(x, NY + dy)) return { x, y: NY + dy };
    throw new Error('no build spot');
  };
  return { game, world, surface, ug, dayNight, run, screenOf, structures, buildSpot };
}

describe('wave defenses in a real run', () => {
  it('Espina and Muro de quitina: a click in build mode places them and spends minerals', () => {
    const { game, world, screenOf, structures, buildSpot, surface } = setup();
    world.minerals.deposit(200);
    game.setDefenseBuild('spine');
    expect(game.getStats().defenseBuild).toBe('spine');
    const spineAt = buildSpot(4);
    const p = screenOf(spineAt.x, spineAt.y);
    game['handleClick'](p.x, p.y, { shift: false, ctrl: false });
    expect(structures()).toEqual([expect.objectContaining({ kind: 'spine', layer: 'surface', x: spineAt.x, y: spineAt.y })]);
    expect(world.minerals.stored).toBe(200 - DEFENSE_STATS.spine.cost);

    game.setDefenseBuild('wall');
    const wallAt = buildSpot(4, 3);
    const w = screenOf(wallAt.x, wallAt.y);
    game['handleClick'](w.x, w.y, { shift: false, ctrl: false });
    expect(structures().map((s) => s.kind).sort()).toEqual(['spine', 'wall']);
    expect(surface.isWalkable(wallAt.x, wallAt.y)).toBe(false);
    expect(world.minerals.stored).toBe(200 - DEFENSE_STATS.spine.cost - DEFENSE_STATS.wall.cost);
    game.stop();
  });

  it('by touch: the first tap shows the ghost, a second tap on it builds', () => {
    const { game, world, screenOf, structures, buildSpot } = setup();
    world.minerals.deposit(200);
    game.setDefenseBuild('trap');
    const at = buildSpot(5);
    const p = screenOf(at.x, at.y);
    game['handleTap'](p.x, p.y);
    expect(structures()).toHaveLength(0);
    expect(game.getPlacementGhost()).toMatchObject({ kind: 'trap', x: at.x, y: at.y, valid: true, cost: DEFENSE_STATS.trap.cost });
    game['handleTap'](p.x, p.y);
    expect(structures()).toEqual([expect.objectContaining({ kind: 'trap' })]);
    game.stop();
  });

  it('refuses a placement the bank cannot pay, with a reason on the ghost', () => {
    const { game, screenOf, structures, buildSpot } = setup();
    game.setDefenseBuild('spine');
    const at = buildSpot(4);
    const p = screenOf(at.x, at.y);
    game['handleClick'](p.x, p.y, { shift: false, ctrl: false });
    expect(structures()).toHaveLength(0);
    game['updateGhostAt'](p.x, p.y);
    expect(game.getPlacementGhost()).toMatchObject({ valid: false });
    expect(game.getPlacementGhost()!.reason).toMatch(/minerales/i);
    game.stop();
  });
});

describe('scouting and elite waves in a real run', () => {
  it('the Próxima oleada intel names the breach the wave then uses', () => {
    const { game, world, dayNight, run } = setup();
    const next = game.getStats().invasion.next!;
    expect(next.wave).toBe(1);
    expect(next.entrance).not.toBeNull();
    dayNight.phaseTimer = 0.05;
    run(0.2);
    const beetle = world.query(COMPONENT.BEETLE).find((id) => world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer === Layer.Underground)!;
    const pos = world.getComponent<PositionComponent>(beetle, COMPONENT.POSITION)!;
    expect(Math.floor(pos.x)).toBe(next.entrance!.x);
    expect(Math.floor(pos.y)).toBe(next.entrance!.y);
    game.stop();
  });

  it('Crystal wave 6 brings elites and the Prisma Guardián, whose shards join the wave', () => {
    const { game, world, dayNight, run } = setup();
    game['invasionSystem']['waveNumber'] = 5;
    expect(game.getStats().invasion.next!.boss).toMatchObject({ name: 'Prisma Guardián' });
    dayNight.phaseTimer = 0.05;
    run(0.2);
    const info = game.getStats().invasion;
    expect(info.boss).toMatchObject({ name: 'Prisma Guardián' });
    expect(info.banner).toMatchObject({ kind: 'arrival', bossName: 'Prisma Guardián' });
    expect(world.query(ELITE_COMPONENT).length).toBeGreaterThan(0);
    const before = game.getStats().invasion.remaining;
    expect(before).toBe(waveComposition(6, 'crystal').total);
    run(9);
    const boss = world.query(BOSS_COMPONENT).find((id) => world.getComponent<BossComponent>(id, BOSS_COMPONENT)!.kind === 'prism')!;
    expect(boss).toBeDefined();
    const shards = world.getComponent<BossComponent>(boss, BOSS_COMPONENT)!.shards;
    expect(shards.length).toBeGreaterThan(0);
    // The shards count as part of the wave
    expect(game.getStats().invasion.waveSize).toBe(waveComposition(6, 'crystal').total + shards.length);
    game.stop();
  });

  it('Human wave 6 is led by the Coronel en Tanque Pesado, with elite troops', () => {
    const { game, world, dayNight, run } = setup({ playerRace: 'swarm', rivalRace: 'human' });
    game['invasionSystem']['waveNumber'] = 5;
    dayNight.phaseTimer = 0.05;
    run(0.2);
    expect(game.getStats().invasion.boss).toMatchObject({ kind: 'colonel', name: 'Coronel en Tanque Pesado' });
    const colonel = world.query(BOSS_COMPONENT)[0];
    expect(world.getComponent<HumanUnitComponent>(colonel, HUMAN_COMPONENT.UNIT)!.type).toBe('tank');
    expect(world.query(ELITE_COMPONENT, HUMAN_COMPONENT.UNIT).length).toBeGreaterThan(0);
    game.stop();
  });

  it('a wave cleared pays its reward into the minerals bank', () => {
    const { game, world, dayNight, run } = setup({ playerRace: 'swarm', rivalRace: 'wildlife' });
    dayNight.phaseTimer = 0.05;
    run(0.2);
    while (game['invasionSystem']['pendingSpawns'].length > 0) run(DT);
    const minerals = world.minerals.stored;
    for (const id of world.query(COMPONENT.BEETLE)) {
      if (world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer === Layer.Underground) dealDamage(world, id, 1e9);
    }
    run(0.2);
    const banner = game.getStats().invasion.banner!;
    expect(banner.kind).toBe('cleared');
    const gained = world.minerals.stored - minerals;
    expect(gained).toBeGreaterThanOrEqual(waveClearReward(1, banner.perfect ?? false).minerals);
    expect(banner.reward).toEqual(waveClearReward(1, banner.perfect ?? false));
    game.stop();
  });
});
