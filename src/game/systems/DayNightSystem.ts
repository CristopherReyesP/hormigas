import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { GlobalModifiers } from '../events/GlobalModifiers';
import {
  DAY_DURATION,
  NIGHT_DURATION,
  DUSK_WARNING,
  NIGHT_ENEMY_SPAWN_MULTIPLIER,
  NIGHT_FOOD_SPAWN_MULTIPLIER,
} from '../../shared/constants';

export type DayPhase = 'day' | 'night';

/**
 * Day/night rhythm: long forage days, short dangerous nights. At night
 * predators spawn faster and surface food barely regrows — the colony's
 * underground shelter becomes a strategic beat, not just storage.
 *
 * Runs AFTER EventSystem (priority 3), which resets GlobalModifiers and
 * applies event effects each tick — this system multiplies on top, so a
 * drought during the night stacks naturally.
 *
 * Time is tick-accumulated (never wall-clock) — keeps the simulation
 * deterministic for the future multiplayer-duel mode.
 */
export class DayNightSystem implements System {
  readonly name = 'DayNightSystem';
  readonly priority = 4; // after EventSystem (3), before AntAI (5)

  private world: World;
  private modifiers: GlobalModifiers;
  private phase: DayPhase = 'day';
  private phaseTimer = DAY_DURATION;
  private dayNumber = 1;
  private duskWarned = false;

  constructor(world: World, modifiers: GlobalModifiers) {
    this.world = world;
    this.modifiers = modifiers;
  }

  getPhase(): DayPhase {
    return this.phase;
  }

  getDayNumber(): number {
    return this.dayNumber;
  }

  /** Seconds left in the current phase */
  getPhaseRemaining(): number {
    return Math.max(0, this.phaseTimer);
  }

  /** 0 → phase just started, 1 → about to flip (drives the night tint ramp) */
  getPhaseProgress(): number {
    const total = this.phase === 'day' ? DAY_DURATION : NIGHT_DURATION;
    return Math.max(0, Math.min(1, 1 - this.phaseTimer / total));
  }

  update(dt: number): void {
    this.phaseTimer -= dt;

    if (this.phase === 'day' && !this.duskWarned && this.phaseTimer <= DUSK_WARNING) {
      this.duskWarned = true;
      this.world.pushNotification(
        'warning',
        `🌆 Anochece en ${DUSK_WARNING}s — los depredadores salen a cazar de noche`
      );
    }

    if (this.phaseTimer <= 0) {
      if (this.phase === 'day') {
        this.phase = 'night';
        this.phaseTimer = NIGHT_DURATION;
        this.world.pushNotification('danger', '🌙 Cayó la noche — la superficie es territorio de depredadores');
      } else {
        this.phase = 'day';
        this.phaseTimer = DAY_DURATION;
        this.dayNumber++;
        this.duskWarned = false;
        this.world.pushNotification('success', `🌅 Amanece el día ${this.dayNumber} — a forrajear`);
      }
    }

    // Night pressure — multiplied on top of whatever the events set this tick
    if (this.phase === 'night') {
      this.modifiers.enemySpawnMultiplier *= NIGHT_ENEMY_SPAWN_MULTIPLIER;
      this.modifiers.foodSpawnMultiplier *= NIGHT_FOOD_SPAWN_MULTIPLIER;
    }
  }
}
