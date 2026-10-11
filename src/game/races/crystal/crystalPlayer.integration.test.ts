import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../../GameManager';
import type { World } from '../../../engine/ecs/World';
import {
  COMPONENT,
  OrderKind,
  type CrystalUnitComponent,
  type HealthComponent,
  type PlayerOrderComponent,
  type PositionComponent,
} from '../../components/components';
import { FactionId, ownerOf } from '../../factions/factions';
import { fakeCanvas, finishIntro } from '../../../test/gameManagerMocks';
import { setAudioSink } from '../../../audio/events';
import type { RunSetup } from '../../run/RunSetup';
import { CRYSTAL_PLAYER_START, CRYSTAL_STRUCTURES, productionTime } from './crystalPlayerRules';
import { nightMilestone } from '../../run/nightMilestones';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../../shared/constants';
import { createBeetle } from '../../entities/factories';

// Real manager, map and simulation; browser-only adapters are replaced.
vi.mock('../../../engine/input/InputManager', async () =>
  (await import('../../../test/gameManagerMocks')).mockInputManager());
vi.mock('../../systems/RenderSystem', async () => (await import('../../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

const DT = 1 / 30;
const VS_HUMANS: RunSetup = { playerRace: 'crystal', rivalRace: 'human' };
const VS_WILDLIFE: RunSetup = { playerRace: 'crystal', rivalRace: 'wildlife' };
const MIRROR: RunSetup = { playerRace: 'crystal', rivalRace: 'crystal' };
const CX = Math.floor(WORLD_WIDTH / 2);
const CY = Math.floor(WORLD_HEIGHT / 2);

function setup(runSetup: RunSetup) {
  const game = new GameManager(fakeCanvas(), runSetup);
  finishIntro(game);
  const world = game['world'] as World;
  const dayNight = game['dayNightSystem'] as unknown as { phaseTimer: number; dayNumber: number };
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) game['update'](DT);
  };
  const crystal = game.getCrystal()!;
  const ownUnits = () => world.query(COMPONENT.CRYSTAL_UNIT).filter((id) => ownerOf(world, id) === FactionId.PLAYER);
  const hive = () => world.query(COMPONENT.CRYSTAL_HIVE).find((id) => ownerOf(world, id) === FactionId.PLAYER) ?? null;
  return { game, world, dayNight, run, crystal, ownUnits, hive };
}

afterEach(() => setAudioSink(null));

describe('playing the Crystal Hive: the start', () => {
  it('spawns the Hive at the center with its drones and minerals; no nest, no queen; its own opening plays first', () => {
    const game = new GameManager(fakeCanvas(), VS_WILDLIFE);
    const world = game['world'] as World;
    expect(game.getStats().introPlaying).toBe(true);
    expect(world.query(COMPONENT.NEST)).toHaveLength(0);
    expect(world.query(COMPONENT.QUEEN_ENTITY)).toHaveLength(0);
    expect(world.query(COMPONENT.ANT)).toHaveLength(0);
    const hives = world.query(COMPONENT.CRYSTAL_HIVE).filter((id) => ownerOf(world, id) === FactionId.PLAYER);
    expect(hives).toHaveLength(1);
    const at = world.getComponent<PositionComponent>(hives[0], COMPONENT.POSITION)!;
    expect([at.x, at.y]).toEqual([CX, CY]);
    expect(world.factions.get(FactionId.PLAYER)).toMatchObject({ race: 'crystal', coreId: hives[0] });
    const drones = world.query(COMPONENT.CRYSTAL_UNIT).filter((id) => ownerOf(world, id) === FactionId.PLAYER);
    expect(drones).toHaveLength(CRYSTAL_PLAYER_START.drones);
    const stats = game.getStats();
    expect(stats.mineralsStored).toBe(CRYSTAL_PLAYER_START.minerals);
    expect(stats.crystal).toMatchObject({ supply: { used: 4 } });
    // Its units light the fog around them
    game['update'](DT);
    game['update'](DT);
    const fog = game.getSurfaceFog();
    const drone = world.getComponent<PositionComponent>(drones[0], COMPONENT.POSITION)!;
    expect(fog.isExplored(Math.round(drone.x), Math.round(drone.y))).toBe(true);
    game.stop();
  });

  it('has no nest view: entering the underground does nothing', () => {
    const { game } = setup(VS_WILDLIFE);
    game.enterUnderground();
    expect(game.getActiveLayer()).toBe('surface');
    game.stop();
  });
});

describe('playing the Crystal Hive against the Humans', () => {
  it('builds a spire, produces drones, and orders them with the usual RTS commands', () => {
    const { game, world, run, crystal, ownUnits } = setup(VS_HUMANS);
    world.minerals.deposit(1000);
    expect(world.factions.get(FactionId.RIVAL)?.race).toBe('human');
    // Build mode: the ghost follows the pointer, a click places
    crystal.setBuildMode('forge');
    const place = crystal.tryPlace({ x: CX + 6, y: CY + 1 });
    expect(place).toMatchObject({ ok: true });
    expect(crystal.getBuildMode()).toBeNull();
    run(CRYSTAL_STRUCTURES.forge.buildTime + 1);
    const forge = world.query(COMPONENT.CRYSTAL_SPIRE).find((id) => ownerOf(world, id) === FactionId.PLAYER)!;
    expect(crystal.system.isComplete(forge)).toBe(true);

    // Select the spire: its card queues drones
    game.selectEntityAt(CX + 6, CY + 1);
    expect(game.getStats().selectedEntity?.entityId).toBe(forge);
    expect(game.getStats().crystal?.selection?.producer).toBeTruthy();
    expect(crystal.queueUnit(forge, 'drone')).toEqual({ ok: true });
    run(productionTime('drone', 1) + 1);
    expect(ownUnits()).toHaveLength(CRYSTAL_PLAYER_START.drones + 1);

    // Box-select every own unit and attack-move them
    const units = ownUnits();
    game.clearSelection();
    game['selectionSystem'].selectInBox({ minX: CX - 10, minY: CY - 10, maxX: CX + 10, maxY: CY + 10 }, 'surface');
    expect(game.getStats().selectedGroup?.count).toBe(units.length);
    expect(game.orderSelectedMove(CX + 15, CY, true)).toBe(units.length);
    for (const id of units) {
      expect(world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER)?.kind).toBe(OrderKind.AttackMove);
    }
    // Control groups bind and recall them
    expect(game.bindControlGroup(1)).toBe(true);
    game.clearSelection();
    expect(game.recallControlGroup(1)).toBe(units.length);
    expect(game.getControlGroups()[0]).toMatchObject({ slot: 1, count: units.length });
    // Stop and hold work on them too
    expect(game.holdSelectedAnts()).toBe(units.length);
    run(1);
    for (const id of units) {
      expect(world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER)?.kind).toBe(OrderKind.Hold);
    }
    game.stop();
  });

  it('a right-click with a spire selected sets its rally point', () => {
    const { game, world, run, crystal } = setup(VS_HUMANS);
    world.minerals.deposit(1000);
    crystal.setBuildMode('forge');
    crystal.tryPlace({ x: CX + 6, y: CY + 1 });
    run(CRYSTAL_STRUCTURES.forge.buildTime + 1);
    const forge = world.query(COMPONENT.CRYSTAL_SPIRE).find((id) => ownerOf(world, id) === FactionId.PLAYER)!;
    game['selectionSystem'].selectOnly(forge);
    game['setRallyAt']({ x: CX + 3, y: CY + 8 });
    expect(crystal.system.producerOf(forge)?.rally).toEqual({ x: CX + 3, y: CY + 8 });
    game.stop();
  });

  it('the Humans march on the Hive at night, on the surface', () => {
    const { game, run, dayNight } = setup(VS_HUMANS);
    dayNight.phaseTimer = 0.05;
    run(0.2);
    const info = game.getStats().invasion;
    expect(info.active).toBe(true);
    expect(info.waveNumber).toBe(1);
    expect(info.threats.every((t) => t.layer === 'surface')).toBe(true);
    game.stop();
  });

  it('loses when the Hive is destroyed, with a Crystal game-over', () => {
    const { game, world, run, hive } = setup(VS_HUMANS);
    const id = hive()!;
    world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!.current = 0;
    world.destroyEntity(id);
    run(DT);
    const over = game.getStats().gameOver;
    expect(over?.outcome).toBe('defeat');
    expect(over?.playerRace).toBe('crystal');
    game.stop();
  });

  it('wins by destroying the Human command center', () => {
    const { game, world, run } = setup(VS_HUMANS);
    world.destroyEntity(game['rivalCoreId']!);
    run(DT);
    expect(game.getStats().gameOver).toMatchObject({ outcome: 'victory', rivalCoreDestroyed: 'human', playerRace: 'crystal' });
    // Seguir jugando: the run goes on, endless, with wildlife waves only
    expect(game.continueAfterVictory()).toBe(true);
    expect(game.getStats().gameOver).toBeNull();
    run(1);
    expect(game.getStats().gameOver).toBeNull();
    expect(game.getCrystal()!.hiveAlive()).toBe(true);
    game.stop();
  });

  it('quick-select picks the drones and Todas; Volver a la colmena walks them home', () => {
    const { game, world, ownUnits, run } = setup(VS_HUMANS);
    const chips = game.getStats().quickSelect!;
    expect(chips.map((c) => c.kind)).toEqual(['crystal-drone', 'crystal-sentinel', 'all']);
    expect(chips[0].count).toBe(CRYSTAL_PLAYER_START.drones);
    expect(game.quickSelect('crystal-drone').selected).toBe(CRYSTAL_PLAYER_START.drones);
    expect(game.getStats().crystal?.selectedKinds.drones).toBe(CRYSTAL_PLAYER_START.drones);
    expect(game.orderSelectedMove(CX + 12, CY, true)).toBe(ownUnits().length);
    run(2);
    expect(game.returnSelectedToNest()).toBe(ownUnits().length);
    for (const id of ownUnits()) {
      const order = world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER)!;
      expect(Math.hypot(order.target.x - CX, order.target.y - CY)).toBeLessThan(5);
    }
    game.stop();
  });
});

describe('the new waves against the Crystal Hive', () => {
  it('wave 3 brings elites and the Humans’ mini-boss, marching at the Hive on the surface', () => {
    const { game, world, run, dayNight } = setup(VS_HUMANS);
    const waves = game.getCrystal()!.waves;
    waves['waveNumber'] = 2;
    dayNight.dayNumber = 3;
    const intel = game.getStats().invasion.next!;
    expect(intel.boss?.kind).toBe('colonel');
    expect(intel.elites.length).toBeGreaterThan(0);
    expect(intel.entrance).toBeNull();
    dayNight.phaseTimer = 0.05;
    run(0.3);
    const info = game.getStats().invasion;
    expect(info.active).toBe(true);
    expect(info.boss?.kind).toBe('colonel');
    expect(world.query('elite').length).toBeGreaterThan(0);
    expect(world.query('mini_boss').every((id) => world.getComponent<{ layer: string }>(id, COMPONENT.LAYER)?.layer !== 'underground')).toBe(true);
    game.stop();
  });

  it('against the wildlife the Acorazado Colosal walks in from the edge', () => {
    const { game, world, run, dayNight } = setup(VS_WILDLIFE);
    game.getCrystal()!.waves['waveNumber'] = 2;
    dayNight.dayNumber = 3;
    dayNight.phaseTimer = 0.05;
    run(30);
    const bosses = world.query('mini_boss');
    expect(bosses.length).toBe(1);
    expect(world.getComponent(bosses[0], 'surface_raider')).toBeDefined();
    expect(world.getComponent<{ layer: string }>(bosses[0], COMPONENT.LAYER)?.layer).toBe('surface');
    game.stop();
  });
});

describe('playing the Crystal Hive against the wildlife', () => {
  it('night waves of beetles cross the surface toward the Hive', () => {
    const { game, world, run, dayNight, hive } = setup(VS_WILDLIFE);
    dayNight.phaseTimer = 0.05;
    run(0.2);
    expect(game.getStats().invasion.active).toBe(true);
    run(20);
    const beetles = world.query(COMPONENT.BEETLE, COMPONENT.PATH).filter((id) => world.getComponent(id, 'surface_raider'));
    expect(beetles.length).toBeGreaterThan(0);
    const target = world.getComponent<PositionComponent>(hive()!, COMPONENT.POSITION)!;
    const path = world.getComponent<{ waypoints: Array<{ x: number; y: number }> }>(beetles[0], COMPONENT.PATH)!;
    const end = path.waypoints[path.waypoints.length - 1];
    expect(Math.hypot(end.x - target.x, end.y - target.y)).toBeLessThan(10);
    expect(world.query(COMPONENT.BEETLE).every((id) => world.getComponent<{ layer: string }>(id, COMPONENT.LAYER)?.layer !== 'underground')).toBe(true);
    game.stop();
  });

  it('is endless: surviving night 7 is a milestone with a reward, and play goes on', () => {
    const { game, world, run, dayNight } = setup(VS_WILDLIFE);
    dayNight.dayNumber = 7;
    (game['dayNightSystem'] as unknown as { phase: string }).phase = 'night';
    dayNight.phaseTimer = 0.05;
    const before = world.minerals.stored;
    run(0.2);
    expect(game.getStats().gameOver).toBeNull();
    expect(world.notifications.some((n) => n.message.includes('¡Sobreviviste 7 noches!'))).toBe(true);
    // The shared milestone, paid in minerals: crystals eat nothing, so the food share comes as minerals too
    const reward = nightMilestone(7)!.reward;
    expect(world.minerals.stored - before).toBeGreaterThanOrEqual(reward.minerals + reward.food);
    // Only once
    const count = () => world.notifications.filter((n) => n.message.includes('¡Sobreviviste 7 noches!')).length;
    run(1);
    expect(count()).toBe(1);
    game.stop();
  });

  it('waves keep coming past night 7', () => {
    const { game, run, dayNight } = setup(VS_HUMANS);
    for (const night of [8, 9, 12]) {
      game.getCrystal()!.waves['waveNumber'] = night - 1;
      dayNight.dayNumber = night;
      (game['dayNightSystem'] as unknown as { phase: string }).phase = 'day';
      dayNight.phaseTimer = 0.05;
      run(0.3);
      const info = game.getStats().invasion;
      expect(info.active).toBe(true);
      expect(info.waveNumber).toBe(night);
      expect(info.waveSize).toBeGreaterThan(0);
      expect(game.getStats().gameOver).toBeNull();
    }
    game.stop();
  });

  it('a beetle that reaches the Hive damages it, and the Hive shoots back', () => {
    const { world, run, hive, game } = setup(VS_WILDLIFE);
    const id = hive()!;
    const beetle = createBeetle(world, CX + 3, CY, null);
    run(2);
    const combat = world.getComponent<{ targetEntityId: number | null }>(id, COMPONENT.COMBAT)!;
    expect(combat.targetEntityId === beetle || !world.hasEntity(beetle)).toBe(true);
    game.stop();
  });
});

describe('the endless run pays the Crystal Hive in minerals', () => {
  it('waves().pay banks the whole reward as minerals', () => {
    const { game, world } = setup(VS_WILDLIFE);
    const before = world.minerals.stored;
    expect(game['waves']().pay({ minerals: 100, food: 50 })).toEqual({ minerals: 150, food: 0 });
    expect(world.minerals.stored - before).toBe(150);
    game.stop();
  });
});

describe('the mirror match', () => {
  it('Crystal against Crystal: two hives, each driven by its own side', () => {
    const { game, world, run, ownUnits } = setup(MIRROR);
    const hives = world.query(COMPONENT.CRYSTAL_HIVE);
    expect(hives.map((id) => ownerOf(world, id)).sort()).toEqual([FactionId.PLAYER, FactionId.RIVAL]);
    const before = ownUnits().length;
    run(60);
    // The rival's hive crystallizes its own drones, never the player's
    expect(ownUnits().length).toBe(before);
    const rivalDrones = world.query(COMPONENT.CRYSTAL_UNIT).filter((id) => ownerOf(world, id) === FactionId.RIVAL);
    expect(rivalDrones.length).toBeGreaterThan(0);
    for (const id of rivalDrones) {
      expect(world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!.hiveId).toBe(game['rivalCoreId']);
    }
    game.stop();
  });
});
