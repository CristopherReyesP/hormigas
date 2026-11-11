// Day events: from day DAY_EVENT.firstDay, each dawn may bring a special day
// that lasts until the next dawn, so no two runs play the same. Unlike the
// short random events (EventSystem), each one is a whole day's theme:
// - Día tranquilo: fewer predators and more food, a breather to build up.
// - Día de caza: predators prowl harder, but every carcass gives double meat.
// - Migración: a herd of leapers crosses the territory, meat on legs.
// - Luna roja: tonight's wave is bigger, and clearing it pays double.

import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { GlobalModifiers } from '../events/GlobalModifiers';
import { randomEdgeTile } from '../../simulation/world/frontier';
import { createCricket } from '../entities/factories';
import { NIGHT_DURATION } from '../../shared/constants';

export const DAY_EVENT_IDS = ['calm', 'hunt', 'migration', 'redMoon'] as const;
export type DayEventId = (typeof DAY_EVENT_IDS)[number];

export interface DayEventDef {
  name: string;
  icon: string;
  announcement: string;
  severity: 'info' | 'warning' | 'danger' | 'success';
}

export const DAY_EVENTS: Readonly<Record<DayEventId, DayEventDef>> = {
  calm: {
    name: 'Día tranquilo', icon: '☀️', severity: 'success',
    announcement: '☀️ Día tranquilo: menos depredadores y más comida. Aprovecha para crecer',
  },
  hunt: {
    name: 'Día de caza', icon: '🍖', severity: 'warning',
    announcement: '🍖 Día de caza: los depredadores rondan con más hambre, pero cada presa deja el doble de carne',
  },
  migration: {
    name: 'Migración', icon: '🦗', severity: 'info',
    announcement: '🦗 ¡Migración! Una manada de saltamontes cruza el territorio: carne para quien la cace',
  },
  redMoon: {
    name: 'Luna roja', icon: '🌕', severity: 'danger',
    announcement: '🌕 Luna roja: esta noche la oleada será más grande… y superarla pagará el doble',
  },
};

export const DAY_EVENT = {
  firstDay: 3,
  /** Chance that a dawn brings a special day */
  chance: 0.6,
  calm: { enemySpawn: 0.4, foodSpawn: 1.5 },
  hunt: { aggression: 1.25, meat: 2 },
  migration: { herd: 6 },
  /** Luna roja: this share of the wave comes on top, and the clear reward is multiplied */
  redMoon: { extraShare: 0.4, rewardMult: 2 },
} as const;

/** What today brings; lives on the World so the combat and wave systems can read it, and saves with it */
export interface DayEventState {
  id: DayEventId | null;
  /** The day it was rolled for */
  day: number;
  /** Luna roja's double pay, held until the wave it doubled is cleared */
  redMoonReward: boolean;
}

export function emptyDayEventState(): DayEventState {
  return { id: null, day: 0, redMoonReward: false };
}

/** Today's event, or null */
export function todaysEvent(world: World): DayEventId | null {
  return world.dayEvent.id;
}

/** Meat a carcass drops is multiplied by this (Día de caza) */
export function dayEventMeatMult(world: World): number {
  return world.dayEvent.id === 'hunt' ? DAY_EVENT.hunt.meat : 1;
}

/** Extra invaders tonight's wave brings on top of `base` (Luna roja) */
export function dayEventExtraInvaders(world: World, base: number): number {
  return world.dayEvent.id === 'redMoon' ? Math.ceil(base * DAY_EVENT.redMoon.extraShare) : 0;
}

/** A wave was cleared: its reward multiplier (Luna roja pays double once) */
export function consumeWaveRewardMult(world: World): number {
  if (!world.dayEvent.redMoonReward) return 1;
  world.dayEvent.redMoonReward = false;
  return DAY_EVENT.redMoon.rewardMult;
}

export interface DayClock {
  getDayNumber(): number;
  getPhase(): 'day' | 'night';
  getPhaseRemaining(): number;
}

export class DayEventSystem implements System {
  readonly name = 'DayEventSystem';
  readonly priority = 4; // after EventSystem (3) resets the modifiers

  private world: World;
  private grid: TileGrid;
  private clock: DayClock;
  private modifiers: GlobalModifiers;
  private held = false;
  /** Injectable for tests */
  random: () => number = Math.random;

  constructor(world: World, grid: TileGrid, clock: DayClock, modifiers: GlobalModifiers) {
    this.world = world;
    this.grid = grid;
    this.clock = clock;
    this.modifiers = modifiers;
  }

  /** Held (the tutorial): no special day is rolled */
  setHeld(held: boolean): void {
    this.held = held;
  }

  /** Seconds left of today's event: until the next dawn */
  remaining(): number {
    const left = this.clock.getPhaseRemaining();
    return this.clock.getPhase() === 'day' ? left + NIGHT_DURATION : left;
  }

  update(): void {
    const state = this.world.dayEvent;
    const day = this.clock.getDayNumber();
    if (day !== state.day) {
      state.day = day;
      const previous = state.id;
      state.id = null;
      if (!this.held && day >= DAY_EVENT.firstDay && this.random() < DAY_EVENT.chance) this.start(previous);
    }
    this.applyModifiers();
  }

  /** Begin a special day, never the same as yesterday's */
  start(previous: DayEventId | null = null, pick?: DayEventId): void {
    const pool = DAY_EVENT_IDS.filter((id) => id !== previous);
    const id = pick ?? pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))];
    const state = this.world.dayEvent;
    state.id = id;
    const def = DAY_EVENTS[id];
    this.world.pushNotification(def.severity, def.announcement);
    if (id === 'redMoon') state.redMoonReward = true;
    if (id === 'migration') this.spawnHerd();
  }

  private applyModifiers(): void {
    const id = this.world.dayEvent.id;
    if (id === 'calm') {
      this.modifiers.enemySpawnMultiplier *= DAY_EVENT.calm.enemySpawn;
      this.modifiers.foodSpawnMultiplier *= DAY_EVENT.calm.foodSpawn;
    } else if (id === 'hunt') {
      this.modifiers.enemyAggressionMultiplier *= DAY_EVENT.hunt.aggression;
    }
  }

  /** The herd comes in along one edge of the territory */
  private spawnHerd(): void {
    const side = Math.floor(this.random() * 4);
    let placed = 0;
    for (let attempt = 0; attempt < 60 && placed < DAY_EVENT.migration.herd; attempt++) {
      const at = randomEdgeTile(this.grid.bounds, side, this.random, 3);
      if (!this.grid.isWalkable(at.x, at.y)) continue;
      createCricket(this.world, at.x, at.y, null);
      placed++;
    }
  }
}
