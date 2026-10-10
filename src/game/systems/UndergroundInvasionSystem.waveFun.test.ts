import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { TileGrid } from '../../simulation/world/TileGrid';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { createAnt } from '../entities/factories';
import { createCrystalUnit } from '../rival/crystalFactories';
import { AntRole, COMPONENT, Layer, type LayerComponent, type PositionComponent } from '../components/components';
import { ENTRANCE_ROW, WAVE_WARNING_LEAD } from '../../shared/constants';
import { waveComposition } from '../run/waveComposition';
import { ELITE_COMPONENT, type EliteComponent } from '../run/eliteAffixes';
import { BOSS_COMPONENT, type BossComponent } from '../run/miniBoss';
import { BOSS_REWARD, waveClearReward } from '../run/waveRewards';
import { dealDamage } from '../run/waveRuntime';
import { WAVE_MARCH_COMPONENT, type WaveMarchComponent } from '../run/waveMarch';
import { CombatSystem } from './CombatSystem';
import { DayNightSystem } from './DayNightSystem';
import { TransitSystem } from './TransitSystem';
import { UndergroundInvasionSystem, type RaidSource } from './UndergroundInvasionSystem';
import type { EntityId } from '../../shared/types';

const DT = 1 / 16;

function setup() {
  const world = new World();
  const ug = new UndergroundGrid();
  const dayNight = new DayNightSystem(world, createDefaultModifiers());
  const transit = new TransitSystem(world, ug);
  const invasion = new UndergroundInvasionSystem(world, ug, transit, dayNight);
  const combat = new CombatSystem(world, new TileGrid());
  const step = () => {
    dayNight.update(DT);
    invasion.update(DT);
    combat.update(DT);
  };
  const toNightfall = () => {
    while (dayNight.getPhase() === 'day') step();
  };
  const finishEntry = () => {
    while (invasion['pendingSpawns'].length > 0) step();
  };
  return { world, ug, dayNight, invasion, step, toNightfall, finishEntry };
}

/** Open extra entrances: a walkable tile on the entrance row is a way in */
function openEntrance(ug: UndergroundGrid, x: number): void {
  ug.designate(x, ENTRANCE_ROW);
  ug.excavate(x, ENTRANCE_ROW);
}

/** The wave's beetles: on their march across the surface or already inside the nest */
const waveBeetles = (world: World) =>
  world.query(COMPONENT.BEETLE).filter((id) =>
    world.getComponent(id, WAVE_MARCH_COMPONENT) !== undefined || world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer === Layer.Underground);

const killAll = (world: World, ids: EntityId[]) => {
  for (const id of ids) dealDamage(world, id, 1e9);
};

describe('scouting the next wave', () => {
  it('shows the coming wave all day: its size, mix, elites, boss and where it breaks in', () => {
    const { invasion } = setup();
    invasion['waveNumber'] = 2;
    const next = invasion.getInfo().next!;
    const wave = waveComposition(3, 'wildlife');
    expect(next).toMatchObject({ wave: 3, total: wave.total });
    expect(next.groups.reduce((n, g) => n + g.count, 0) + (next.boss ? 1 : 0)).toBe(wave.total);
    expect(next.elites.reduce((n, e) => n + e.count, 0)).toBe(wave.elites.length);
    expect(next.elites[0].name).toBe('Blindado');
    expect(next.boss).toMatchObject({ kind: 'colossus', name: 'Acorazado Colosal' });
    expect(next.entrance).not.toBeNull();
  });

  it('the scouted entrance is where the wave really breaches, with several entrances open', () => {
    for (let wave = 0; wave < 6; wave++) {
      const { world, ug, invasion, toNightfall } = setup();
      openEntrance(ug, 12);
      openEntrance(ug, 70);
      expect(ug.getEntrances()).toHaveLength(3);
      invasion['waveNumber'] = wave;
      const scouted = invasion.getInfo().next!.entrance!;
      toNightfall();
      const first = waveBeetles(world)[0];
      // It marches on that entrance's hole, then breaks in right there
      expect(world.getComponent<WaveMarchComponent>(first, WAVE_MARCH_COMPONENT)!.entrance).toEqual({ x: scouted.x, y: scouted.y });
      invasion['breakIn'](first, world.getComponent<WaveMarchComponent>(first, WAVE_MARCH_COMPONENT)!);
      const pos = world.getComponent<PositionComponent>(first, COMPONENT.POSITION)!;
      expect(world.getComponent<LayerComponent>(first, COMPONENT.LAYER)!.layer).toBe(Layer.Underground);
      expect({ x: Math.floor(pos.x), y: Math.floor(pos.y) }).toEqual({ x: scouted.x, y: scouted.y });
    }
  });

  it('spreads the breach over the entrances from wave to wave, deterministically', () => {
    const picks = (waves: number[]) => waves.map((w) => {
      const { ug, invasion } = setup();
      openEntrance(ug, 12);
      openEntrance(ug, 70);
      invasion['waveNumber'] = w;
      return invasion.getInfo().next!.entrance!.x;
    });
    const first = picks([0, 1, 2, 3, 4, 5]);
    expect(new Set(first).size).toBeGreaterThan(1);
    expect(picks([0, 1, 2, 3, 4, 5])).toEqual(first);
  });

  it('names the surface direction the raiders come from', () => {
    const { world, invasion } = setup();
    invasion.setRaidSource({ rival: 'human', launch: () => [], origin: () => ({ x: 100, y: 10 }) });
    expect(world).toBeDefined();
    expect(invasion.getInfo().next!.surface).toMatchObject({ x: 100, y: 10, direction: 'noreste' });
  });

  it('the warning banner carries the elites and the boss', () => {
    const { invasion, dayNight, step } = setup();
    invasion['waveNumber'] = 2;
    while (dayNight.getPhaseRemaining() > WAVE_WARNING_LEAD - 1) step();
    const banner = invasion.getInfo().banner!;
    expect(banner.kind).toBe('warning');
    expect(banner.bossName).toBe('Acorazado Colosal');
    expect(banner.elites).toBe(1);
  });
});

describe('elites and bosses in a wave', () => {
  it('wave 5 sends its elites with their affixes', () => {
    const { world, invasion, toNightfall, finishEntry } = setup();
    invasion['waveNumber'] = 4;
    toNightfall();
    finishEntry();
    const affixes = waveBeetles(world)
      .map((id) => world.getComponent<EliteComponent>(id, ELITE_COMPONENT)?.affix)
      .filter(Boolean)
      .sort();
    expect(affixes).toEqual(waveComposition(5, 'wildlife').elites.map((e) => e.affix).sort());
    expect(affixes).toEqual(['furious', 'healer']);
  });

  it('wildlife wave 3: the Acorazado Colosal marches on the nest, has a health bar and pays out when killed', () => {
    const { world, invasion, toNightfall, finishEntry, step } = setup();
    invasion['waveNumber'] = 2;
    toNightfall();
    finishEntry();
    const info = invasion.getInfo();
    expect(info.banner).toMatchObject({ kind: 'arrival', bossName: 'Acorazado Colosal' });
    expect(info.boss).toMatchObject({ name: 'Acorazado Colosal' });
    const boss = world.query(BOSS_COMPONENT)[0];
    expect(world.getComponent<BossComponent>(boss, BOSS_COMPONENT)!.kind).toBe('colossus');
    expect(info.remaining).toBe(waveComposition(3, 'wildlife').total);
    const minerals = world.minerals.stored;
    killAll(world, [boss]);
    step();
    step();
    expect(invasion.getInfo().boss).toBeNull();
    expect(world.minerals.stored).toBeGreaterThanOrEqual(minerals + BOSS_REWARD.minerals);
    expect(world.notifications.some((n) => n.message.includes('Acorazado Colosal'))).toBe(true);
  });

  it('Crystal wave 6: one of the hive raiders becomes the Prisma Guardián', () => {
    const { world, invasion, toNightfall } = setup();
    const raid: RaidSource = {
      rival: 'crystal',
      launch: (count) => Array.from({ length: count }, (_, i) => createCrystalUnit(world, 'drone', 80 + i, 20)),
      origin: () => ({ x: 80, y: 20 }),
    };
    invasion.setRaidSource(raid);
    invasion['waveNumber'] = 5;
    const wave = waveComposition(6, 'crystal');
    toNightfall();
    const prism = world.query(BOSS_COMPONENT).filter((id) => world.getComponent<BossComponent>(id, BOSS_COMPONENT)!.kind === 'prism');
    expect(prism).toHaveLength(1);
    expect(world.query(COMPONENT.CRYSTAL_UNIT)).toHaveLength(wave.drones + 1);
    expect(invasion.getInfo().remaining).toBe(wave.total);
  });
});

describe('clean defense bonus', () => {
  it('a wave cleared without losing an ant pays the perfect bonus in minerals and food', () => {
    const { world, ug, invasion, toNightfall, finishEntry, step } = setup();
    for (let i = 0; i < 4; i++) {
      const ant = createAnt(world, 30 + i, 30, AntRole.Worker);
      world.getComponent<LayerComponent>(ant, COMPONENT.LAYER)!.layer = Layer.Underground;
    }
    const pantry = ug.getPantryStored().total;
    toNightfall();
    finishEntry();
    killAll(world, waveBeetles(world));
    step();
    step();
    const reward = waveClearReward(1, true);
    expect(reward.minerals).toBeGreaterThan(waveClearReward(1, false).minerals);
    expect(world.minerals.stored).toBe(reward.minerals);
    expect(ug.getPantryStored().total).toBe(pantry + reward.food);
    const banner = invasion.getInfo().banner!;
    expect(banner).toMatchObject({ kind: 'cleared', perfect: true, reward });
  });

  it('losing an ant during the wave pays only the smaller clear reward', () => {
    const { world, invasion, toNightfall, finishEntry, step } = setup();
    const ants: EntityId[] = [];
    for (let i = 0; i < 4; i++) {
      const ant = createAnt(world, 30 + i, 30, AntRole.Worker);
      world.getComponent<LayerComponent>(ant, COMPONENT.LAYER)!.layer = Layer.Underground;
      ants.push(ant);
    }
    toNightfall();
    finishEntry();
    killAll(world, [ants[0]]);
    step();
    killAll(world, waveBeetles(world));
    step();
    step();
    expect(world.minerals.stored).toBe(waveClearReward(1, false).minerals);
    expect(invasion.getInfo().banner).toMatchObject({ kind: 'cleared', perfect: false });
  });
});
