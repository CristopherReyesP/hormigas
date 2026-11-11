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
  /** One line for the dawn's choice card */
  blurb: string;
  announcement: string;
  severity: 'info' | 'warning' | 'danger' | 'success';
}

export const DAY_EVENTS: Readonly<Record<DayEventId, DayEventDef>> = {
  calm: {
    name: 'Día tranquilo', icon: '☀️', severity: 'success',
    blurb: 'Menos depredadores y +50% de comida',
    announcement: '☀️ Día tranquilo: menos depredadores y más comida. Aprovecha para crecer',
  },
  hunt: {
    name: 'Día de caza', icon: '🍖', severity: 'warning',
    blurb: 'Depredadores más fieros, doble de carne',
    announcement: '🍖 Día de caza: los depredadores rondan con más hambre, pero cada presa deja el doble de carne',
  },
  migration: {
    name: 'Migración', icon: '🦗', severity: 'info',
    blurb: 'Una manada de saltamontes para cazar',
    announcement: '🦗 ¡Migración! Una manada de saltamontes cruza el territorio: carne para quien la cace',
  },
  redMoon: {
    name: 'Luna roja', icon: '🌕', severity: 'danger',
    blurb: 'Oleada +40% esta noche, paga el doble',
    announcement: '🌕 Luna roja: esta noche la oleada será más grande… y superarla pagará el doble',
  },
};

export const DAY_EVENT = {
  firstDay: 3,
  /** Chance that a dawn brings a special day */
  chance: 0.6,
  /** Seconds the player has to pick between the two days offered; then the first one comes */
  chooseSeconds: 20,
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
  /** Luna roja waves cleared this run (an achievement counts them) */
  redMoonsCleared: number;
  /** The two days this dawn offers while the player picks, and the seconds left to do it */
  offer: DayEventId[] | null;
  offerTimer: number;
}

export function emptyDayEventState(): DayEventState {
  return { id: null, day: 0, redMoonReward: false, redMoonsCleared: 0, offer: null, offerTimer: 0 };
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
  world.dayEvent.redMoonsCleared = (world.dayEvent.redMoonsCleared ?? 0) + 1;
  return DAY_EVENT.redMoon.rewardMult;
}

/** The screen tint of today's event: an rgb triplet and its alpha, or null on an ordinary day */
export function dayAmbience(id: DayEventId | null, phase: 'day' | 'night'): { color: string; alpha: number } | null {
  switch (id) {
    case 'redMoon': return { color: '190,20,30', alpha: phase === 'night' ? 0.2 : 0.07 };
    case 'calm': return phase === 'day' ? { color: '255,215,120', alpha: 0.07 } : null;
    case 'hunt': return { color: '210,90,20', alpha: 0.07 };
    case 'migration': return phase === 'day' ? { color: '130,210,120', alpha: 0.05 } : null;
    default: return null;
  }
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

  update(dt = 0): void {
    const state = this.world.dayEvent;
    const day = this.clock.getDayNumber();
    if (day !== state.day) {
      state.day = day;
      const previous = state.id;
      state.id = null;
      state.offer = null;
      if (!this.held && day >= DAY_EVENT.firstDay && this.random() < DAY_EVENT.chance) this.offer(previous);
    }
    // The player did not pick in time: the first of the two comes
    if (state.offer) {
      state.offerTimer -= dt;
      if (state.offerTimer <= 0) this.start(null, state.offer[0]);
    }
    this.applyModifiers();
  }

  /** A special dawn: two days to pick from, never yesterday's */
  offer(previous: DayEventId | null = null): void {
    const pool = DAY_EVENT_IDS.filter((id) => id !== previous);
    const first = pool.splice(Math.min(pool.length - 1, Math.floor(this.random() * pool.length)), 1)[0];
    const second = pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))];
    const state = this.world.dayEvent;
    state.offer = [first, second];
    state.offerTimer = DAY_EVENT.chooseSeconds;
    this.world.pushNotification('info', `🌅 Amanecer especial: elige entre ${DAY_EVENTS[first].name} y ${DAY_EVENTS[second].name}`);
  }

  /** The player picks one of the two days offered; false when it is not on offer */
  choose(id: DayEventId): boolean {
    if (!this.world.dayEvent.offer?.includes(id)) return false;
    this.start(null, id);
    return true;
  }

  /** Begin a special day, never the same as yesterday's */
  start(previous: DayEventId | null = null, pick?: DayEventId): void {
    const pool = DAY_EVENT_IDS.filter((id) => id !== previous);
    const id = pick ?? pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))];
    const state = this.world.dayEvent;
    state.offer = null;
    state.id = id;
    const def = DAY_EVENTS[id];
    if (id === 'redMoon') state.redMoonReward = true;
    // The herd's toast takes the camera to where it came in
    const herd = id === 'migration' ? this.spawnHerd() : null;
    this.world.pushNotification(def.severity, def.announcement, undefined, 0, herd ?? undefined);
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
  private spawnHerd(): { x: number; y: number } | null {
    const side = Math.floor(this.random() * 4);
    let placed = 0;
    let first: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < 60 && placed < DAY_EVENT.migration.herd; attempt++) {
      const at = randomEdgeTile(this.grid.bounds, side, this.random, 3);
      if (!this.grid.isWalkable(at.x, at.y)) continue;
      createCricket(this.world, at.x, at.y, null);
      first ??= at;
      placed++;
    }
    return first;
  }
}
