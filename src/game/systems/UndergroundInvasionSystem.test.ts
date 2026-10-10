import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { COMPONENT, Layer, type LayerComponent } from '../components/components';
import {
  DAY_DURATION,
  INVASION_ARM_LEAD,
  INVASION_BOSS_NIGHT,
  WAVE_WARNING_LEAD,
} from '../../shared/constants';
import { waveComposition } from '../run/waveComposition';
import { WAVE_MARCH_COMPONENT } from '../run/waveMarch';
import { DayNightSystem } from './DayNightSystem';
import { TransitSystem } from './TransitSystem';
import { UndergroundInvasionSystem, isBossNight, type RaidSource } from './UndergroundInvasionSystem';
import type { EntityId } from '../../shared/types';

// A power of two keeps the tick sum exact, so nightfall lands on a known tick
const DT = 1 / 16;

function setup() {
  const world = new World();
  const ug = new UndergroundGrid();
  const dayNight = new DayNightSystem(world, createDefaultModifiers());
  const transit = new TransitSystem(world, ug);
  const invasion = new UndergroundInvasionSystem(world, ug, transit, dayNight);
  let t = 0;
  const step = () => {
    dayNight.update(DT);
    invasion.update(DT);
    t += DT;
  };
  return { world, dayNight, invasion, step, now: () => t };
}

/** The endless run has no last night: check the waves well past the old 7 */
const ENDLESS_TEST_NIGHTS = 20;

const beetles = (world: World) => world.query(COMPONENT.BEETLE).length;

const sizes = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => waveComposition(from + i).total);

describe('wave size per wave number', () => {
  it('keeps the Crystal Queen on night 7 only, even in an endless run', () => {
    expect(INVASION_BOSS_NIGHT).toBe(7);
    const bossNights = Array.from({ length: 40 }, (_, i) => i + 1).filter(isBossNight);
    expect(bossNights).toEqual([7]);
  });

  it('sends exactly the composition curve, one wave per night, to night 20 and past the cap', () => {
    const { world, invasion, step } = setup();
    const sent: number[] = [];
    for (let night = 1; night <= ENDLESS_TEST_NIGHTS; night++) {
      while (invasion.getInfo().waveNumber < night) step();
      // Let the staged entry finish, then clear the wave so it counts as repelled
      for (let i = 0; i < 20 / DT; i++) step();
      sent.push(beetles(world));
      for (const id of world.query(COMPONENT.BEETLE)) world.destroyEntity(id);
    }
    // No hive here: the drone share breaks in as beetles, so every wave keeps its size
    expect(sent).toEqual(sizes(1, ENDLESS_TEST_NIGHTS));
  });

  it('adds the mutation surcharge on top of the wave size', () => {
    const { world, step, dayNight } = setup();
    world.runModifiers.extraInvadersPerWave = 1;
    while (dayNight.getPhase() === 'day') step();
    for (let i = 0; i < 8 / DT; i++) step();
    expect(beetles(world)).toBe(waveComposition(1).total + 1);
  });

  it('folds the hive raid into the wave: drones from the hive, the rest into the nest', () => {
    const { world, invasion, step, dayNight } = setup();
    invasion['waveNumber'] = 4;
    const sent: EntityId[] = [];
    const raid: RaidSource = {
      launch: (count) => {
        for (let i = 0; i < count; i++) sent.push(world.createEntity());
        return [...sent];
      },
      origin: () => ({ x: 90, y: 40 }),
    };
    invasion.setRaidSource(raid);
    const wave = waveComposition(5);
    while (dayNight.getPhaseRemaining() > WAVE_WARNING_LEAD - 1) step();
    expect(invasion.getInfo().threats).toContainEqual({ x: 90, y: 40, layer: 'surface' });
    while (dayNight.getPhase() === 'day') step();
    for (let i = 0; i < 20 / DT; i++) step();
    expect(sent).toHaveLength(wave.drones);
    // The beetles cross the surface from the map edge to break into the nest
    const marching = world.query(COMPONENT.BEETLE, WAVE_MARCH_COMPONENT).filter((id) => world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer === Layer.Surface);
    expect(marching).toHaveLength(wave.youngBeetles + wave.beetles);
    expect(invasion.getInfo().remaining).toBe(wave.total);
  });
});

describe('night 1 wave', () => {
  it('its young beetles break in at the first nightfall', () => {
    const { world, invasion, step, dayNight, now } = setup();
    while (dayNight.getPhase() === 'day') step();
    expect(now()).toBeCloseTo(DAY_DURATION, 0);
    expect(invasion.getInfo().waveNumber).toBe(1);
    for (let i = 0; i < 10 / DT; i++) step();
    expect(beetles(world)).toBe(waveComposition(1).total);
  });
});

describe('wave countdown', () => {
  it('counts down to the moment the first invader spawns, armed or not', () => {
    const { world, invasion, step, now } = setup();
    const predictions: Array<{ at: number; strikesAt: number; armed: boolean }> = [];
    const sampleAt = [0, 30, DAY_DURATION - INVASION_ARM_LEAD + 5, DAY_DURATION - 1];
    while (beetles(world) === 0) {
      const info = invasion.getInfo();
      if (sampleAt.length > 0 && now() >= sampleAt[0]) {
        sampleAt.shift();
        predictions.push({ at: now(), strikesAt: now() + info.nextWaveIn, armed: info.armed });
      }
      step();
    }
    const spawnedAt = now();
    expect(predictions).toHaveLength(4);
    expect(predictions.some((p) => p.armed)).toBe(true);
    for (const p of predictions) expect(Math.abs(p.strikesAt - spawnedAt)).toBeLessThanOrEqual(DT);
  });

  it('after a wave is repelled mid-night, counts down to the next nightfall spawn', () => {
    const { world, invasion, step, now } = setup();
    while (beetles(world) < waveComposition(1).total) step();
    for (const id of world.query(COMPONENT.BEETLE)) world.destroyEntity(id);
    step();
    const info = invasion.getInfo();
    expect(info.active).toBe(false);
    const strikesAt = now() + info.nextWaveIn;
    while (beetles(world) === 0) step();
    expect(Math.abs(now() - strikesAt)).toBeLessThanOrEqual(DT);
  });

  it('arms the wave as a telegraph shortly before nightfall', () => {
    const { invasion, step, dayNight } = setup();
    while (dayNight.getPhaseRemaining() > INVASION_ARM_LEAD + 1) step();
    expect(invasion.getInfo().armed).toBe(false);
    while (dayNight.getPhaseRemaining() > INVASION_ARM_LEAD - 1) step();
    expect(invasion.getInfo().armed).toBe(true);
  });

  it('does not stack a new wave on one still inside the nest', () => {
    const { world, invasion, step, dayNight } = setup();
    while (beetles(world) === 0) step();
    // Night 1's wave is never killed: the next nightfall passes with it still inside
    while (dayNight.getDayNumber() < 2 || dayNight.getPhase() === 'day') step();
    for (let i = 0; i < 10 / DT; i++) step();
    expect(invasion.getInfo().waveNumber).toBe(1);
    expect(beetles(world)).toBe(waveComposition(1).total);
  });
});
