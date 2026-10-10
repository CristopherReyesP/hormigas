import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { createAnt, createQueen } from '../entities/factories';
import { AntRole } from '../components/components';
import { ROLE_STATS } from '../../shared/constants';
import { retrofitAntStats } from '../run/antStats';
import { buildColonyStats } from './colonyStats';

describe('Estadísticas data', () => {
  it('counts the population by caste with average stats, and the queen and brood rates', () => {
    const world = new World();
    createQueen(world, 10, 10);
    createAnt(world, 1, 1, AntRole.Worker);
    createAnt(world, 1, 1, AntRole.Worker);
    createAnt(world, 1, 1, AntRole.Soldier);
    world.upgradeLevels.damage = 1;
    world.upgradeLevels.queenLay = 1;
    world.upgradeLevels.incubation = 2;
    retrofitAntStats(world);
    world.minerals.deposit(42);

    const report = buildColonyStats(world, { food: 123.7, mushrooms: 4, day: 3, nightsSurvived: 2 });
    expect(report.population).toBe(3);
    expect(report.castes.find((r) => r.role === AntRole.Worker)).toMatchObject({
      count: 2, health: ROLE_STATS.worker.health, damage: ROLE_STATS.worker.damage, carry: ROLE_STATS.worker.carryCapacity, speed: 2,
    });
    expect(report.castes.find((r) => r.role === AntRole.Soldier)).toMatchObject({ count: 1, damage: 10 });
    expect(report.castes.find((r) => r.role === AntRole.Nurse)).toMatchObject({ count: 0, health: 0 });
    expect(report).toMatchObject({ food: 123, mushrooms: 4, minerals: 42 });
    expect(report.queen).toMatchObject({ layTime: 2.6, eggsPerMinute: 23.1, queuePerCaste: 5 });
    expect(report.brood).toMatchObject({ hatchTimeWorker: 13.33, eggsPerTile: 6 });
  });

  it('reports the run: nights, kills, losses, gathering and births per minute', () => {
    const world = new World();
    Object.assign(world.runTally, { enemiesDefeated: 7, antsLost: 3, foodGathered: 250.5, mineralsGathered: 40, seconds: 120 });
    world.metrics.antsHatched = 6;
    world.metrics.wavesRepelled = 2;
    const report = buildColonyStats(world, { food: 0, mushrooms: 0, day: 3, nightsSurvived: 2 });
    expect(report.queen).toBeNull();
    expect(report.brood).toMatchObject({ hatched: 6, hatchedPerMinute: 3 });
    expect(report.run).toEqual({
      day: 3, nightsSurvived: 2, wavesRepelled: 2, enemiesDefeated: 7, antsLost: 3, foodGathered: 250, mineralsGathered: 40, minutes: 2,
    });
  });
});
