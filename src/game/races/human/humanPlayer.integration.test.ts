import { describe, expect, it, vi } from 'vitest';
import { GameManager, type GameOverStats } from '../../GameManager';
import type { World } from '../../../engine/ecs/World';
import {
  COMPONENT,
  CrystalUnitState,
  Layer,
  OrderKind,
  type CrystalUnitComponent,
  type PlayerOrderComponent,
  type PositionComponent,
} from '../../components/components';
import { FactionId, ownerOf } from '../../factions/factions';
import { fakeCanvas, finishIntro } from '../../../test/gameManagerMocks';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent } from '../../rival/humanComponents';
import { HUMAN_BUILDING_STATS, HUMAN_UNIT_STATS } from '../../rival/humanBase';
import type { SelectionSystem } from '../../systems/SelectionSystem';
import type { RunSetup } from '../../run/RunSetup';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../../shared/constants';
import { HUMAN_PLAYER_COMPONENT } from './humanPlayerComponents';
import { PLAYER_HUMAN_START } from './humanPlayerRules';
import { nightMilestone } from '../../run/nightMilestones';
import { BEST_NIGHT_KEY } from '../../run/nightRecord';

// Real manager and map; browser-only adapters are replaced.
vi.mock('../../../engine/input/InputManager', async () =>
  (await import('../../../test/gameManagerMocks')).mockInputManager());
vi.mock('../../systems/RenderSystem', async () => (await import('../../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

const DT = 1 / 30;
const CX = Math.floor(WORLD_WIDTH / 2);
const CY = Math.floor(WORLD_HEIGHT / 2);

function start(setup: RunSetup) {
  const game = new GameManager(fakeCanvas(), setup);
  finishIntro(game);
  const world = game['world'] as World;
  const selection = game['selectionSystem'] as SelectionSystem;
  const state = game as unknown as { gameOver: GameOverStats | null; update: (dt: number) => void };
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) state.update(DT);
  };
  const mine = (type?: string) => world.query(HUMAN_COMPONENT.UNIT).filter((id) => ownerOf(world, id) === FactionId.PLAYER
    && (type === undefined || world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type === type));
  const myBuildings = (kind?: string) => world.query(HUMAN_COMPONENT.BUILDING).filter((id) => ownerOf(world, id) === FactionId.PLAYER
    && (kind === undefined || world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind === kind));
  const core = () => myBuildings('command_center')[0];
  const human = game.getHumanPlayer()!;
  return { game, world, selection, state, run, mine, myBuildings, core, human };
}

const VS_CRYSTAL: RunSetup = { playerRace: 'human', rivalRace: 'crystal' };
const VS_WILDLIFE: RunSetup = { playerRace: 'human', rivalRace: 'wildlife' };

describe('a Humans run against the Crystal Hive', () => {
  it('lands the expedition at the map center: a command center, builders and soldiers; no nest, no queen', () => {
    const { game, world, mine, core } = start(VS_CRYSTAL);
    const pos = world.getComponent<PositionComponent>(core(), COMPONENT.POSITION)!;
    expect([pos.x, pos.y]).toEqual([CX, CY]);
    expect(mine('builder')).toHaveLength(PLAYER_HUMAN_START.builders);
    expect(mine('soldier')).toHaveLength(PLAYER_HUMAN_START.soldiers);
    expect(world.query(COMPONENT.NEST)).toHaveLength(0);
    expect(world.query(COMPONENT.QUEEN_ENTITY)).toHaveLength(0);
    expect(world.query(COMPONENT.ANT)).toHaveLength(0);
    expect(world.query(COMPONENT.CRYSTAL_HIVE)).toHaveLength(1);
    expect(world.factions.get(FactionId.PLAYER)).toMatchObject({ race: 'human', coreId: core() });
    const stats = game.getStats();
    expect(stats.human).toMatchObject({ rations: PLAYER_HUMAN_START.rations, supplyCap: HUMAN_BUILDING_STATS.command_center.supply });
    expect(stats.human!.minerals).toBe(PLAYER_HUMAN_START.minerals);
    expect(stats.human!.supply).toBe(PLAYER_HUMAN_START.builders + PLAYER_HUMAN_START.soldiers);
    game.stop();
  });

  it('skips the meteor cinematic and greets the expedition instead', () => {
    const game = new GameManager(fakeCanvas(), VS_CRYSTAL);
    const stats = game.getStats();
    expect(stats.introPlaying).toBe(false);
    expect(stats.human?.intro).toMatch(/EXPEDICI/);
    game.stop();
  });

  it('plays a full opening: mine, build a barracks, train soldiers and attack-move them', () => {
    const { game, world, selection, run, mine, myBuildings, human } = start(VS_CRYSTAL);
    const builders = mine('builder');
    const minerals = world.minerals.stored;
    // The expedition lands with one Cuartel; this opening raises a second
    const starter = myBuildings('barracks');
    expect(starter).toHaveLength(1);
    // Right-click a home mineral node with the builders selected: they mine it
    selection.selectAnts(builders, Layer.Surface);
    const node = world.query(COMPONENT.MINERAL).map((id) => ({ id, p: world.getComponent<PositionComponent>(id, COMPONENT.POSITION)! }))
      .sort((a, b) => Math.hypot(a.p.x - CX, a.p.y - CY) - Math.hypot(b.p.x - CX, b.p.y - CY))[0];
    expect(human.commandAt({ x: node.p.x, y: node.p.y })).toBe(true);
    run(25);
    expect(world.minerals.stored).toBeGreaterThan(minerals);

    // Construir → Cuartel, then a click on open ground
    world.minerals.deposit(150);
    selection.selectAnts([builders[0]], Layer.Surface);
    expect(human.beginPlacement('barracks')).toBeNull();
    expect(game.getStats().human?.placing?.kind).toBe('barracks');
    const spot = { x: CX - 6, y: CY - 6 };
    human.hover(spot);
    expect(game.getStats().human?.placing?.valid).toBe(true);
    expect(human.clickAt(spot, false)).toBe(true);
    expect(game.getStats().human?.placing).toBeNull();
    const barracks = myBuildings('barracks').find((id) => !starter.includes(id))!;
    expect(barracks).toBeDefined();
    run(HUMAN_BUILDING_STATS.barracks.buildTime + 15);
    expect(world.getComponent<HumanBuildingComponent>(barracks, HUMAN_COMPONENT.BUILDING)!.constructing).toBe(0);

    // The barracks trains two soldiers
    selection.selectOnly(barracks);
    human.addRations(500);
    expect(human.train('soldier')).toBeNull();
    expect(human.train('soldier')).toBeNull();
    expect(game.getStats().human?.selected?.queue).toEqual(['soldier', 'soldier']);
    run(HUMAN_UNIT_STATS.soldier.trainTime * 2 + 2);
    const soldiers = mine('soldier');
    expect(soldiers.length).toBe(PLAYER_HUMAN_START.soldiers + 2);

    // Box-select-like pick of the soldiers and an attack-move
    selection.selectAnts(soldiers, Layer.Surface);
    expect(game.orderSelectedMove(CX + 12, CY, true)).toBe(soldiers.length);
    for (const id of soldiers) {
      expect(world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER)?.kind).toBe(OrderKind.AttackMove);
    }
    run(15);
    const near = soldiers.filter((id) => {
      const p = world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
      return p && Math.hypot(p.x - (CX + 12), p.y - CY) < 3;
    });
    expect(near.length).toBeGreaterThan(0);
    game.stop();
  });

  it('the Crystal Hive\'s raids march on the command center', () => {
    const { game, world, core } = start(VS_CRYSTAL);
    const source = (game.getHumanPlayer()!.waves as unknown as { raidSource: { launch(n: number): number[] } }).raidSource;
    const sent = source.launch(2);
    expect(sent.length).toBeGreaterThan(0);
    const corePos = world.getComponent<PositionComponent>(core(), COMPONENT.POSITION)!;
    for (const id of sent) {
      const unit = world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!;
      expect(unit.state).toBe(CrystalUnitState.Assaulting);
      expect(Math.hypot(unit.goal!.x - corePos.x, unit.goal!.y - corePos.y)).toBeLessThan(1.5);
    }
    game.stop();
  });

  it('loses the run when the command center falls', () => {
    const { game, world, state, core } = start(VS_CRYSTAL);
    world.destroyEntity(core());
    state.update(DT);
    expect(state.gameOver?.outcome).toBe('defeat');
    expect(state.gameOver?.playerRace).toBe('human');
    game.stop();
  });

  it('wins by destroying the Crystal Hive', () => {
    const { game, world, state } = start(VS_CRYSTAL);
    world.destroyEntity(world.query(COMPONENT.CRYSTAL_HIVE)[0]);
    state.update(DT);
    expect(state.gameOver?.outcome).toBe('victory');
    expect(state.gameOver?.rivalCoreDestroyed).toBe('crystal');
    game.stop();
  });

  it('has no nest to go down into and no dawn mutation pick', () => {
    const { game, run } = start(VS_CRYSTAL);
    game.enterUnderground();
    expect(game.getActiveLayer()).toBe('surface');
    const dayNight = game['dayNightSystem'] as unknown as { phaseTimer: number };
    dayNight.phaseTimer = 0.2;
    run(1); // nightfall
    dayNight.phaseTimer = 0.2;
    run(1); // dawn
    expect(game.getStats().mutationOffer).toBeNull();
    game.stop();
  });
});

describe('a Humans run against the wildlife', () => {
  it('has no rival base, and the night wave comes over the surface at the command center', () => {
    const { game, world, run, core } = start(VS_WILDLIFE);
    expect(world.query(COMPONENT.CRYSTAL_HIVE)).toHaveLength(0);
    expect(world.query(HUMAN_COMPONENT.BUILDING).filter((id) => ownerOf(world, id) === FactionId.RIVAL)).toHaveLength(0);
    const dayNight = game['dayNightSystem'] as unknown as { phaseTimer: number };
    dayNight.phaseTimer = 0.2;
    run(10);
    const info = game.getStats().invasion;
    expect(info.active).toBe(true);
    const invaders = world.query(HUMAN_PLAYER_COMPONENT.WAVE_INVADER);
    expect(invaders.length).toBeGreaterThan(0);
    for (const id of invaders) expect(world.getComponent<{ layer: string }>(id, COMPONENT.LAYER)!.layer).toBe(Layer.Surface);
    expect(info.threats.every((t) => t.layer === 'surface')).toBe(true);
    void core;
    game.stop();
  });

  it('is endless: dawn after night 7 does not end the run, and the waves keep coming past night 10', () => {
    const { game, state, run, world } = start(VS_WILDLIFE);
    const dayNight = game['dayNightSystem'] as unknown as { dayNumber: number; phase: string; phaseTimer: number };
    dayNight.dayNumber = 7;
    dayNight.phase = 'night';
    dayNight.phaseTimer = 0.01;
    state.update(DT);
    state.update(DT);
    expect(state.gameOver).toBeNull();
    // Keep the command center standing and push on to night 11
    const waves = game.getHumanPlayer()!.waves as unknown as { waveNumber: number };
    waves.waveNumber = 10;
    dayNight.dayNumber = 11;
    dayNight.phase = 'day';
    dayNight.phaseTimer = 0.2;
    run(6);
    const info = game.getStats().invasion;
    expect(state.gameOver).toBeNull();
    expect(info.active).toBe(true);
    expect(info.waveNumber).toBe(11);
    expect(world.query(HUMAN_PLAYER_COMPONENT.WAVE_INVADER).length).toBeGreaterThan(0);
    game.stop();
  });
});

describe('a Humans run is endless, like the Swarm\'s', () => {
  it('celebrates the seventh night with minerals and rations, and records the night', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); } });
    const { game, world, state, human } = start(VS_WILDLIFE);
    const dayNight = game['dayNightSystem'] as unknown as { dayNumber: number; phase: string; phaseTimer: number };
    dayNight.dayNumber = 7;
    dayNight.phase = 'night';
    dayNight.phaseTimer = 0.01;
    const minerals = world.minerals.stored;
    const rations = human.economy.stock().rations;
    state.update(DT);
    const milestone = nightMilestone(7)!;
    expect(state.gameOver).toBeNull();
    expect(game.getStats().milestone).toMatchObject({ night: 7, title: '¡Sobreviviste 7 noches!', foodUnit: 'raciones' });
    expect(world.minerals.stored - minerals).toBeGreaterThanOrEqual(milestone.reward.minerals);
    expect(human.economy.stock().rations - rations).toBeGreaterThanOrEqual(milestone.reward.food);
    expect(game.getStats().notifications.some((n) => n.message.includes(`+${milestone.reward.food} raciones`))).toBe(true);
    expect(storage.get(BEST_NIGHT_KEY)).toBe('7');
    vi.stubGlobal('localStorage', undefined);
    game.stop();
  });

  it('a rival-core victory can be continued: Seguir jugando, then waves from the wildlife, until the command center falls', () => {
    vi.stubGlobal('localStorage', undefined);
    const { game, world, state, core, human } = start(VS_CRYSTAL);
    world.destroyEntity(world.query(COMPONENT.CRYSTAL_HIVE)[0]);
    state.update(DT);
    expect(state.gameOver).toMatchObject({ outcome: 'victory', playerRace: 'human', rivalCoreDestroyed: 'crystal', nightsSurvived: 0 });
    expect(game.continueAfterVictory()).toBe(true);
    expect(state.gameOver).toBeNull();
    expect(game.getStats().paused).toBe(false);
    expect(human.waves['raidSource']).toBeNull();
    state.update(DT);
    expect(state.gameOver).toBeNull();
    world.destroyEntity(core());
    state.update(DT);
    expect(state.gameOver).toMatchObject({ outcome: 'defeat', playerRace: 'human' });
    expect(game.continueAfterVictory()).toBe(false);
    game.stop();
  });
});

describe('a Human mirror match', () => {
  it('puts a rival Human base on the far side that runs on its own, apart from the player\'s base', () => {
    const { game, world, core, run } = start({ playerRace: 'human', rivalRace: 'human' });
    const rivalCore = world.query(HUMAN_COMPONENT.BUILDING).find((id) => ownerOf(world, id) === FactionId.RIVAL
      && world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind === 'command_center');
    expect(rivalCore).toBeDefined();
    expect(rivalCore).not.toBe(core());
    const a = world.getComponent<PositionComponent>(core(), COMPONENT.POSITION)!;
    const b = world.getComponent<PositionComponent>(rivalCore!, COMPONENT.POSITION)!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(25);
    run(5);
    // The rival's AI never trains or builds for the player: still the command center and the starting Cuartel
    expect(world.query(HUMAN_COMPONENT.BUILDING).filter((id) => ownerOf(world, id) === FactionId.PLAYER)).toHaveLength(2);
    game.stop();
  });
});
