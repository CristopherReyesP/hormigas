import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { COMPONENT } from '../components/components';
import {
  DAY_DURATION,
  INVASION_ARM_LEAD,
  INVASION_BOSS_NIGHT,
  INVASION_WAVE_SIZE_BY_NIGHT,
  RUN_NIGHTS_TO_WIN,
} from '../../shared/constants';
import { DayNightSystem } from './DayNightSystem';
import { TransitSystem } from './TransitSystem';
import { UndergroundInvasionSystem, waveForNight } from './UndergroundInvasionSystem';

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

const beetles = (world: World) => world.query(COMPONENT.BEETLE).length;

describe('wave size per night', () => {
  it('opens with a lone scout on night 1, then rises 2, 3, 4, 5, 6, 8', () => {
    const sizes = [1, 2, 3, 4, 5, 6, 7].map((night) => waveForNight(night).invaders);
    expect(sizes).toEqual([1, 2, 3, 4, 5, 6, 8]);
  });

  it('keeps the boss slot on the last night of the run only', () => {
    expect(INVASION_WAVE_SIZE_BY_NIGHT).toHaveLength(RUN_NIGHTS_TO_WIN);
    expect(INVASION_BOSS_NIGHT).toBe(RUN_NIGHTS_TO_WIN);
    const bossNights = [1, 2, 3, 4, 5, 6, 7].filter((night) => waveForNight(night).boss);
    expect(bossNights).toEqual([7]);
  });

  it('holds the last size after the curve ends', () => {
    expect(waveForNight(9).invaders).toBe(8);
    expect(waveForNight(9).boss).toBe(false);
  });

  it('sends exactly the curve, one wave per night, over a whole run', () => {
    const { world, invasion, step } = setup();
    const sent: number[] = [];
    for (let night = 1; night <= RUN_NIGHTS_TO_WIN; night++) {
      while (invasion.getInfo().waveNumber < night) step();
      // Let the staged entry finish, then clear the wave so it counts as repelled
      for (let i = 0; i < 12 / DT; i++) step();
      sent.push(beetles(world));
      for (const id of world.query(COMPONENT.BEETLE)) world.destroyEntity(id);
    }
    expect(sent).toEqual([1, 2, 3, 4, 5, 6, 8]);
  });

  it('adds the mutation surcharge on top of the night size', () => {
    const { world, step, dayNight } = setup();
    world.runModifiers.extraInvadersPerWave = 1;
    while (dayNight.getPhase() === 'day') step();
    for (let i = 0; i < 5 / DT; i++) step();
    expect(beetles(world)).toBe(2);
  });
});

describe('night 1 scout wave', () => {
  it('a single invader breaks in at the first nightfall', () => {
    const { world, invasion, step, dayNight, now } = setup();
    while (dayNight.getPhase() === 'day') step();
    expect(now()).toBeCloseTo(DAY_DURATION, 0);
    expect(invasion.getInfo().waveNumber).toBe(1);
    for (let i = 0; i < 10 / DT; i++) step();
    expect(beetles(world)).toBe(1);
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
    while (beetles(world) === 0) step();
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
    // Night 1's scout is never killed: the next nightfall passes with it still inside
    while (dayNight.getDayNumber() < 2 || dayNight.getPhase() === 'day') step();
    for (let i = 0; i < 10 / DT; i++) step();
    expect(invasion.getInfo().waveNumber).toBe(1);
    expect(beetles(world)).toBe(1);
  });
});
