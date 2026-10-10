// Human gunfire VFX state: tracers, sniper streaks and tank shells. Visual
// only: CombatSystem lands the damage the moment the shot is fired; these
// just show it. A fixed pool per World, aged in game time (frozen while
// paused), drawn by HumanRenderer. Pure: no canvas, no randomness.

export type HumanShotKind = 'rifle' | 'sniper' | 'shell' | 'turret';

/** Seconds a shot stays on screen. A shell flies for its whole life, then bursts. */
export const HUMAN_SHOT_LIFE: Readonly<Record<HumanShotKind, number>> = {
  rifle: 0.12,
  sniper: 0.22,
  turret: 0.14,
  shell: 0.4,
};

/** Shots alive at once; past it the oldest is recycled */
export const HUMAN_SHOT_CAP = 96;

export interface HumanShot {
  alive: boolean;
  kind: HumanShotKind;
  /** Tile units (PositionComponent space) */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  age: number;
  life: number;
}

export class HumanShots {
  private readonly pool: HumanShot[];
  private cursor = 0;

  constructor() {
    this.pool = Array.from({ length: HUMAN_SHOT_CAP }, () => ({
      alive: false, kind: 'rifle' as HumanShotKind, fromX: 0, fromY: 0, toX: 0, toY: 0, age: 0, life: 0,
    }));
  }

  fire(kind: HumanShotKind, fromX: number, fromY: number, toX: number, toY: number): void {
    let slot = this.pool.find((s) => !s.alive);
    if (!slot) {
      slot = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.pool.length;
    }
    slot.alive = true;
    slot.kind = kind;
    slot.fromX = fromX;
    slot.fromY = fromY;
    slot.toX = toX;
    slot.toY = toY;
    slot.age = 0;
    slot.life = HUMAN_SHOT_LIFE[kind];
  }

  /** Age every shot by `dt` game seconds */
  advance(dt: number): void {
    if (dt <= 0) return;
    for (const s of this.pool) {
      if (!s.alive) continue;
      s.age += dt;
      if (s.age >= s.life) s.alive = false;
    }
  }

  live(): readonly HumanShot[] {
    return this.pool.filter((s) => s.alive);
  }
}

const SHOTS = new WeakMap<object, HumanShots>();

/** The shot pool of one World (created on first use), shared by CombatSystem and the renderer. */
export function humanShotsFor(world: object): HumanShots {
  let shots = SHOTS.get(world);
  if (!shots) {
    shots = new HumanShots();
    SHOTS.set(world, shots);
  }
  return shots;
}
