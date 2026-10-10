// Invaders inside the nest: the alert the player gets while looking elsewhere.
// Pure state machine fed once per tick by the GameManager (simulation time,
// so a pause holds it); the HUD reads its state through GameStats.

/** Seconds a nest alert banner stays up */
export const NEST_ALERT_SECONDS = 8;
/** Re-alerts (queen, eggs) come at most this often, counted from the last alert */
export const NEST_REALERT_SECONDS = 10;
/** The nest must stay empty this long to count as clear (the next invader may still be in the tunnel) */
export const NEST_CLEAR_GRACE = 2;
/** Seconds the "Nido despejado" toast stays up */
export const NEST_CLEARED_SECONDS = 4;
/** Below this share of her health the queen warning turns critical */
export const QUEEN_CRITICAL_SHARE = 0.5;

export type NestAlertKind = 'breach' | 'queen' | 'eggs';
export type NestAlertEvent = NestAlertKind | 'cleared';

export interface NestAlert {
  /** Changes with every new alert, so the HUD can replay its entrance (and buzz once) */
  id: number;
  kind: NestAlertKind;
  /** Hostile units inside the nest right now */
  invaders: number;
  /** The queen's health, while she is under attack */
  queen: { health: number; max: number } | null;
  /** The queen is under half health */
  critical: boolean;
}

export interface NestAlertState {
  /** Hostile units inside the nest (the NIDO tab badge) */
  nestInvaders: number;
  /** Wave units attacking on the surface (the SUPERFICIE tab badge, seen from the nest) */
  surfaceInvaders: number;
  alert: NestAlert | null;
  /** Set for a few seconds once the nest is clear again */
  cleared: { id: number } | null;
  /** Where the fight in the nest is (underground tiles) */
  fight: { x: number; y: number } | null;
}

/** What the GameManager sees in the nest this tick */
export interface NestSample {
  invaders: number;
  surfaceInvaders: number;
  fight: { x: number; y: number } | null;
  queen: { health: number; max: number; attacked: boolean } | null;
  eggsAttacked: boolean;
}

export class NestAlertTracker {
  private time = 0;
  private nextId = 1;
  /** A breach is on: invaders got in and the nest has not been clear since */
  private breached = false;
  private lastAlertAt = -Infinity;
  private alertUntil = 0;
  private emptySince: number | null = null;
  private clearedUntil = 0;
  private state: NestAlertState = { nestInvaders: 0, surfaceInvaders: 0, alert: null, cleared: null, fight: null };

  /** Advance by `dt` seconds of game time; returns the alert raised this tick, if any */
  update(dt: number, sample: NestSample): NestAlertEvent | null {
    this.time += dt;
    const s = this.state;
    s.nestInvaders = sample.invaders;
    s.surfaceInvaders = sample.surfaceInvaders;
    s.fight = sample.invaders > 0 ? sample.fight : null;
    let event: NestAlertEvent | null = null;

    if (sample.invaders > 0) {
      this.emptySince = null;
      if (!this.breached) {
        this.breached = true;
        s.cleared = null;
        event = this.raise('breach', sample);
      } else if (this.time - this.lastAlertAt >= NEST_REALERT_SECONDS) {
        if (sample.queen?.attacked) event = this.raise('queen', sample);
        else if (sample.eggsAttacked) event = this.raise('eggs', sample);
      }
    } else if (this.breached) {
      this.emptySince ??= this.time;
      if (this.time - this.emptySince >= NEST_CLEAR_GRACE) {
        this.breached = false;
        this.emptySince = null;
        s.alert = null;
        s.cleared = { id: this.nextId++ };
        this.clearedUntil = this.time + NEST_CLEARED_SECONDS;
        event = 'cleared';
      }
    }

    if (s.alert) {
      if (this.time >= this.alertUntil) s.alert = null;
      else if (!event) this.refresh(s.alert, sample);
    }
    if (s.cleared && this.time >= this.clearedUntil) s.cleared = null;
    return event;
  }

  getState(): NestAlertState {
    const s = this.state;
    return { ...s, alert: s.alert ? { ...s.alert, queen: s.alert.queen ? { ...s.alert.queen } : null } : null };
  }

  private raise(kind: NestAlertKind, sample: NestSample): NestAlertKind {
    const alert: NestAlert = { id: this.nextId++, kind, invaders: 0, queen: null, critical: false };
    this.refresh(alert, sample);
    this.state.alert = alert;
    this.lastAlertAt = this.time;
    this.alertUntil = this.time + NEST_ALERT_SECONDS;
    return kind;
  }

  /** Live numbers on the banner: the count, and the queen's health on her alert */
  private refresh(alert: NestAlert, sample: NestSample): void {
    alert.invaders = sample.invaders;
    if (alert.kind === 'queen' && sample.queen) {
      const health = Math.max(0, Math.ceil(sample.queen.health));
      alert.queen = { health, max: sample.queen.max };
      alert.critical = health < sample.queen.max * QUEEN_CRITICAL_SHARE;
    }
  }
}

/** The banner's headline */
export function nestAlertTitle(alert: NestAlert): string {
  switch (alert.kind) {
    case 'breach':
      return `¡Invasores en el nido! (${alert.invaders})`;
    case 'queen':
      return alert.critical ? '¡La reina está en peligro!' : '¡Atacan a la reina!';
    case 'eggs':
      return '¡Atacan los huevos!';
  }
}

export interface TabAlert {
  count: number;
  /** Pulse red: the fight is on the layer the player is NOT looking at */
  pulse: boolean;
}

/**
 * The view tabs' badges: NIDO carries the count of invaders inside (pulsing
 * while the player is on the surface); SUPERFICIE carries the surface attack
 * only while the player is down in the nest.
 */
export function tabAlerts(
  activeLayer: 'surface' | 'underground',
  nestInvaders: number,
  surfaceInvaders: number,
): { surface: TabAlert | null; underground: TabAlert | null } {
  return {
    underground: nestInvaders > 0 ? { count: nestInvaders, pulse: activeLayer === 'surface' } : null,
    surface: surfaceInvaders > 0 && activeLayer === 'underground' ? { count: surfaceInvaders, pulse: true } : null,
  };
}
