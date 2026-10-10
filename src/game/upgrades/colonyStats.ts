import type { World } from '../../engine/ecs/World';
import {
  AntRole,
  COMPONENT,
  type AntComponent,
  type CarryingComponent,
  type HealthComponent,
  type RoleStatsComponent,
} from '../components/components';
import { ANT_SPEED } from '../../shared/constants';
import { eggQueuePerCaste, eggsPerIncubationTile, hatchTime, queenLayTime } from './upgradeEffects';

/** Breed order, the order the stats tab lists the castes */
export const STATS_ROLES: readonly AntRole[] = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender];

export interface CasteStatsRow {
  role: AntRole;
  count: number;
  /** Averages over the living ants of the caste (0 with none) */
  health: number;
  damage: number;
  /** Tiles per second, unloaded */
  speed: number;
  carry: number;
}

/** Everything the Estadísticas tab shows; plain numbers, built on demand */
export interface ColonyStatsReport {
  population: number;
  castes: CasteStatsRow[];
  food: number;
  mushrooms: number;
  minerals: number;
  queen: {
    layTime: number;
    /** Eggs a minute when the queen lays nonstop */
    eggsPerMinute: number;
    queuePerCaste: number;
    health: number;
    maxHealth: number;
  } | null;
  brood: {
    /** A worker egg's time on an incubation tile, no nurse */
    hatchTimeWorker: number;
    eggsPerTile: number;
    /** Ants born so far and per minute of play */
    hatched: number;
    hatchedPerMinute: number;
  };
  run: {
    day: number;
    nightsSurvived: number;
    wavesRepelled: number;
    enemiesDefeated: number;
    antsLost: number;
    foodGathered: number;
    mineralsGathered: number;
    minutes: number;
  };
}

export interface ColonyStatsInput {
  food: number;
  mushrooms: number;
  day: number;
  nightsSurvived: number;
}

const one = (n: number) => Math.round(n * 10) / 10;

export function buildColonyStats(world: World, input: ColonyStatsInput): ColonyStatsReport {
  const sums = new Map<AntRole, { count: number; health: number; damage: number; speed: number; carry: number }>(
    STATS_ROLES.map((role) => [role, { count: 0, health: 0, damage: 0, speed: 0, carry: 0 }]),
  );
  for (const id of world.query(COMPONENT.ANT)) {
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    const row = sums.get(ant.role);
    if (!row) continue;
    const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    const stats = world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
    const carrying = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
    row.count++;
    row.health += health?.max ?? 0;
    row.damage += health?.damage ?? 0;
    row.speed += ANT_SPEED * (stats?.speedMultiplier ?? 1);
    row.carry += carrying?.maxCapacity ?? 0;
  }
  const castes = STATS_ROLES.map((role) => {
    const s = sums.get(role)!;
    const avg = (v: number) => (s.count > 0 ? one(v / s.count) : 0);
    return { role, count: s.count, health: avg(s.health), damage: avg(s.damage), speed: avg(s.speed), carry: avg(s.carry) };
  });

  const levels = world.upgradeLevels;
  const queenId = world.query(COMPONENT.QUEEN_ENTITY)[0];
  const queenHealth = queenId !== undefined ? world.getComponent<HealthComponent>(queenId, COMPONENT.HEALTH) : undefined;
  const layTime = queenLayTime(levels);
  const tally = world.runTally;
  const minutes = tally.seconds / 60;

  return {
    population: castes.reduce((n, row) => n + row.count, 0),
    castes,
    food: Math.floor(input.food),
    mushrooms: Math.floor(input.mushrooms),
    minerals: Math.floor(world.minerals.stored),
    queen: queenId === undefined ? null : {
      layTime,
      eggsPerMinute: one(60 / layTime),
      queuePerCaste: eggQueuePerCaste(levels),
      health: Math.round(queenHealth?.current ?? 0),
      maxHealth: Math.round(queenHealth?.max ?? 0),
    },
    brood: {
      hatchTimeWorker: hatchTime(levels, AntRole.Worker),
      eggsPerTile: eggsPerIncubationTile(levels),
      hatched: world.metrics.antsHatched,
      hatchedPerMinute: minutes > 0 ? one(world.metrics.antsHatched / minutes) : 0,
    },
    run: {
      day: input.day,
      nightsSurvived: input.nightsSurvived,
      wavesRepelled: world.metrics.wavesRepelled,
      enemiesDefeated: tally.enemiesDefeated,
      antsLost: tally.antsLost,
      foodGathered: Math.floor(tally.foodGathered),
      mineralsGathered: Math.floor(tally.mineralsGathered),
      minutes: Math.floor(minutes),
    },
  };
}
