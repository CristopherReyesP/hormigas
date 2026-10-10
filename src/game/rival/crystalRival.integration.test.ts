import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import { World } from '../../engine/ecs/World';
import { TileGrid } from '../../simulation/world/TileGrid';
import {
  AntRole,
  COMPONENT,
  CrystalUnitState,
  Layer,
  type CombatComponent,
  type CrystalUnitComponent,
  type HealthComponent,
  type LayerComponent,
} from '../components/components';
import { FactionId } from '../factions/factions';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';
import { setAudioSink } from '../../audio/events';
import { createAnt } from '../entities/factories';
import { createCrystalUnit } from './crystalFactories';
import { CombatSystem } from '../systems/CombatSystem';
import { ARMOR_COMPONENT, type ArmorComponent } from '../systems/helpers/combatHelpers';
import { combatVfxFor } from '../vfx/CombatVfx';
import type { ShieldComponent } from './crystalShield';
import { CRYSTAL_UNIT_STATS } from './crystalRival';
import { waveComposition } from '../run/waveComposition';
import { selectionTitle } from '../../ui/console/infoSummary';
import type { RunSetup } from '../run/RunSetup';
import type { CrystalRivalSystem } from '../systems/CrystalRivalSystem';

// Real manager, map and simulation; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

const DT = 1 / 30;
const WILDLIFE: RunSetup = { playerRace: 'swarm', rivalRace: 'wildlife' };
const CRYSTAL: RunSetup = { playerRace: 'swarm', rivalRace: 'crystal' };

function setup(runSetup: RunSetup) {
  const game = new GameManager(fakeCanvas(), runSetup);
  finishIntro(game);
  const world = game['world'] as World;
  const dayNight = game['dayNightSystem'] as unknown as { phaseTimer: number; dayNumber: number };
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) game['update'](DT);
  };
  const nightfallIn = (seconds: number) => {
    dayNight.phaseTimer = seconds;
  };
  const crystalUnits = (kind?: string) =>
    world.query(COMPONENT.CRYSTAL_UNIT).filter((id) => !kind || world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!.kind === kind);
  const undergroundBeetles = () =>
    world.query(COMPONENT.BEETLE).filter((id) => world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer === Layer.Underground);
  const info = () => game.getStats().invasion;
  const messages = () => world.notifications.map((n) => n.message);
  return { game, world, dayNight, run, nightfallIn, crystalUnits, undergroundBeetles, info, messages };
}

afterEach(() => setAudioSink(null));

describe('rival Fauna salvaje: no Crystal Hive', () => {
  it('raises no hive and registers no rival faction', () => {
    const { game, world } = setup(WILDLIFE);
    expect(world.query(COMPONENT.CRYSTAL_HIVE)).toHaveLength(0);
    expect(world.query(COMPONENT.CRYSTAL_SPIRE)).toHaveLength(0);
    expect(world.factions.has(FactionId.RIVAL)).toBe(false);
    game.stop();
  });

  it('a wave that would bring drones brings beetles instead', () => {
    const { game, run, nightfallIn, info, crystalUnits, undergroundBeetles } = setup(WILDLIFE);
    game['invasionSystem']['waveNumber'] = 3;
    const expected = waveComposition(4);
    expect(expected.drones).toBeGreaterThan(0);
    // The HUD already announces the wildlife-only mix
    expect(info().waveSize).toBe(expected.total);
    nightfallIn(0.05);
    run(0.1);
    // Every unit of the wave breaks into the nest (the first already did)
    expect(info()).toMatchObject({ active: true, waveSize: expected.total, remaining: expected.total });
    expect(game['invasionSystem']['pendingSpawns']).toHaveLength(expected.total - 1);
    expect(undergroundBeetles()).toHaveLength(1);
    while (game['invasionSystem']['pendingSpawns'].length > 0) run(DT);
    expect(crystalUnits()).toHaveLength(0);
    game.stop();
  });

  it('spawns no Crystal Queen on night 7', () => {
    const { game, dayNight, run, nightfallIn, crystalUnits, info } = setup(WILDLIFE);
    dayNight.dayNumber = 7;
    game['invasionSystem']['waveNumber'] = 6;
    nightfallIn(0.5);
    run(1);
    expect(crystalUnits('queen')).toHaveLength(0);
    expect(info().banner?.boss).toBeFalsy();
    game.stop();
  });
});

describe('rival Colmena de Cristal: the full rival', () => {
  it('raises the hive at the crater with a shield on top of its health', () => {
    const { game, world } = setup(CRYSTAL);
    const hives = world.query(COMPONENT.CRYSTAL_HIVE);
    expect(hives).toHaveLength(1);
    const shield = world.getComponent<ShieldComponent>(hives[0], COMPONENT.SHIELD);
    expect(shield?.max).toBeGreaterThan(0);
    expect(world.factions.get(FactionId.RIVAL)).toMatchObject({ race: 'crystal', controller: 'ai' });
    game.stop();
  });

  it('grows its base by the build order and crystallizes Sentinels from its spires', () => {
    const { game, world, dayNight, run, crystalUnits } = setup(CRYSTAL);
    const rival = game['crystalRival'] as CrystalRivalSystem;
    expect(rival).toBeTruthy();
    dayNight.dayNumber = 4;
    dayNight.phaseTimer = 400; // a long day: no wave interrupts the build
    rival['bank'] = 2000;
    run(150);
    const spires = world.query(COMPONENT.CRYSTAL_SPIRE);
    expect(spires.length).toBeGreaterThanOrEqual(3);
    expect(crystalUnits('sentinel').length).toBeGreaterThan(0);
    const sentinel = crystalUnits('sentinel')[0];
    expect(world.getComponent<CombatComponent>(sentinel, COMPONENT.COMBAT)!.attackRange).toBe(CRYSTAL_UNIT_STATS.sentinel.attackRange);
    expect(world.getComponent<ShieldComponent>(sentinel, COMPONENT.SHIELD)!.max).toBe(CRYSTAL_UNIT_STATS.sentinel.shield);
    game.stop();
  });

  it('brings the Crystal Queen on night 7 with a big announcement', () => {
    const { game, world, dayNight, run, nightfallIn, crystalUnits, info, messages } = setup(CRYSTAL);
    dayNight.dayNumber = 7;
    game['invasionSystem']['waveNumber'] = 6;
    nightfallIn(0.5);
    run(1);
    const queens = crystalUnits('queen');
    expect(queens).toHaveLength(1);
    const queen = queens[0];
    expect(world.getComponent<CrystalUnitComponent>(queen, COMPONENT.CRYSTAL_UNIT)!.state).toBe(CrystalUnitState.Assaulting);
    expect(world.getComponent<HealthComponent>(queen, COMPONENT.HEALTH)!.max).toBe(CRYSTAL_UNIT_STATS.queen.health);
    expect(info().banner).toMatchObject({ kind: 'arrival', boss: true });
    expect(messages().some((m) => m.includes('Reina de Cristal'))).toBe(true);
    // She is part of the wave the HUD counts
    expect(info().remaining).toBeGreaterThan(0);
    run(5);
    expect(crystalUnits('queen')).toHaveLength(1); // only one queen per run
    game.stop();
  });

  it('shows a selected crystal unit with its name, shield and health', () => {
    const { game, world, crystalUnits } = setup(CRYSTAL);
    const hive = world.query(COMPONENT.CRYSTAL_HIVE)[0];
    createCrystalUnit(world, 'sentinel', 10, 10, hive, FactionId.RIVAL);
    const sentinel = crystalUnits('sentinel')[0];
    game.selectOnly(sentinel);
    const sel = game.getSelectedEntity()!;
    expect(sel.type).toBe('crystal_unit');
    expect(sel.shield).toEqual({ current: CRYSTAL_UNIT_STATS.sentinel.shield, max: CRYSTAL_UNIT_STATS.sentinel.shield });
    expect(sel.health).toEqual({ current: CRYSTAL_UNIT_STATS.sentinel.health, max: CRYSTAL_UNIT_STATS.sentinel.health });
    expect(selectionTitle(sel).name).toBe('Centinela');
    game.selectOnly(hive);
    const hiveSel = game.getSelectedEntity()!;
    expect(hiveSel.type).toBe('crystal_hive');
    expect(hiveSel.shield?.max).toBeGreaterThan(0);
    game.stop();
  });
});

describe('shields in combat', () => {
  it('a hit drains the shield first, with a cyan shield flash, and the hull only after it breaks', () => {
    const world = new World();
    const combat = new CombatSystem(world, new TileGrid());
    const drone = createCrystalUnit(world, 'drone', 20, 20, null, FactionId.RIVAL);
    const soldier = createAnt(world, 21, 20, AntRole.Soldier);
    const attack = world.getComponent<CombatComponent>(soldier, COMPONENT.COMBAT) ?? (() => {
      world.addComponent<CombatComponent>(soldier, COMPONENT.COMBAT, {
        attackDamage: 30, attackRange: 1.5, attackCooldown: 0.01, attackTimer: 0, targetEntityId: drone,
      });
      return world.getComponent<CombatComponent>(soldier, COMPONENT.COMBAT)!;
    })();
    attack.attackDamage = 30;
    attack.attackCooldown = 0.01;
    attack.targetEntityId = drone;
    const shield = world.getComponent<ShieldComponent>(drone, COMPONENT.SHIELD)!;
    const health = world.getComponent<HealthComponent>(drone, COMPONENT.HEALTH)!;

    combat.update(1 / 60);
    expect(shield.current).toBe(shield.max - 30);
    expect(health.current).toBe(health.max);
    expect(combatVfxFor(world).countAlive('shield')).toBeGreaterThan(0);

    for (let i = 0; i < 10 && shield.current > 0; i++) combat.update(0.02);
    expect(shield.current).toBe(0);
    combat.update(0.02);
    expect(health.current).toBeLessThan(health.max);
  });

  it('the shield soaks first; armor then cuts only the part that reaches the hull', () => {
    const world = new World();
    const combat = new CombatSystem(world, new TileGrid());
    const drone = createCrystalUnit(world, 'drone', 20, 20, null, FactionId.RIVAL);
    world.addComponent<ArmorComponent>(drone, ARMOR_COMPONENT, { armor: 4 });
    const soldier = createAnt(world, 21, 20, AntRole.Soldier);
    world.addComponent<CombatComponent>(soldier, COMPONENT.COMBAT, {
      attackDamage: 30, attackRange: 1.5, attackCooldown: 0.01, attackTimer: 0, targetEntityId: drone,
    });
    const attack = world.getComponent<CombatComponent>(soldier, COMPONENT.COMBAT)!;
    attack.attackDamage = 30;
    attack.targetEntityId = drone;
    const shield = world.getComponent<ShieldComponent>(drone, COMPONENT.SHIELD)!;
    const health = world.getComponent<HealthComponent>(drone, COMPONENT.HEALTH)!;
    shield.current = 10;
    combat.update(1 / 60);
    // 10 on the shield, 20 left, minus 4 armor on the hull
    expect(shield.current).toBe(0);
    expect(health.current).toBe(health.max - 16);
  });
});
