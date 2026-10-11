// The enemies evolve too. The threat level rises with the days, and with the
// colony's strength: its numbers, its upgrades and its evolutions. Every
// enemy that appears is born at the threat level of that moment, with more
// health and a harder bite, so a big, mutated swarm keeps meeting its match.
// The level never drops: a colony that shrinks still faces what it provoked.

import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, type CombatComponent, type HealthComponent } from '../components/components';
import { FactionId, ownerOf } from '../factions/factions';

export const THREAT = {
  /** Levels each source adds: a level a day from day `firstDay`, one per `antsPerLevel` ants past `freeAnts`,
   * one per `evolutionsPerLevel` evolutions and one per `upgradesPerLevel` upgrade levels */
  firstDay: 3,
  freeAnts: 15,
  antsPerLevel: 20,
  evolutionsPerLevel: 2,
  upgradesPerLevel: 3,
  /** Each level: this much more health and damage for the enemies born from then on */
  healthPerLevel: 0.05,
  damagePerLevel: 0.03,
  maxHealthMult: 3,
  maxDamageMult: 2.5,
  /** Seconds between two measurements */
  measureEvery: 1,
  /** A notice every this many levels gained */
  announceEvery: 5,
} as const;

export interface ThreatInputs {
  day: number;
  ants: number;
  evolutions: number;
  upgrades: number;
}

/** The threat level for these inputs (0 on the first days with a starting colony) */
export function threatLevel({ day, ants, evolutions, upgrades }: ThreatInputs): number {
  return Math.max(0,
    Math.max(0, day - THREAT.firstDay + 1)
    + Math.floor(Math.max(0, ants - THREAT.freeAnts) / THREAT.antsPerLevel)
    + Math.floor(evolutions / THREAT.evolutionsPerLevel)
    + Math.floor(upgrades / THREAT.upgradesPerLevel));
}

/** Health and damage multipliers of an enemy born at `level` */
export function threatMultipliers(level: number): { health: number; damage: number } {
  return {
    health: Math.min(THREAT.maxHealthMult, 1 + THREAT.healthPerLevel * level),
    damage: Math.min(THREAT.maxDamageMult, 1 + THREAT.damagePerLevel * level),
  };
}

export const THREAT_SCALED_COMPONENT = 'threat_scaled';

export interface ThreatScaledComponent {
  level: number;
}

export interface ThreatClock {
  getDayNumber(): number;
}

export class ThreatSystem implements System {
  readonly name = 'ThreatSystem';
  readonly priority = 54; // after the spawners (beetles 50, frontier 51-53)

  private world: World;
  private clock: ThreatClock;
  /** The highest level reached: it never drops */
  level = 0;
  private timer = 0;
  private announced = 0;

  constructor(world: World, clock: ThreatClock) {
    this.world = world;
    this.clock = clock;
  }

  /** Measure the colony now */
  measure(): number {
    const upgrades = Object.values(this.world.upgradeLevels).reduce((sum, n) => sum + n, 0);
    const now = threatLevel({
      day: this.clock.getDayNumber(),
      ants: this.world.query(COMPONENT.ANT).length,
      evolutions: this.world.runModifiers.getAppliedMutations().length,
      upgrades,
    });
    this.level = Math.max(this.level, now);
    return this.level;
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = THREAT.measureEvery;
      this.measure();
      if (this.level >= this.announced + THREAT.announceEvery) {
        this.announced = this.level - (this.level % THREAT.announceEvery);
        const m = threatMultipliers(this.level);
        this.world.pushNotification('danger', `👽 Los enemigos evolucionan: amenaza ${this.level} (+${Math.round((m.health - 1) * 100)}% vida, +${Math.round((m.damage - 1) * 100)}% daño)`);
      }
    }
    // Every enemy that appeared since: born at today's threat (marked even at level 0, so it never grows later)
    const { health, damage } = threatMultipliers(this.level);
    for (const id of this.world.query(COMPONENT.COMBAT, COMPONENT.HEALTH)) {
      if (this.world.getComponent(id, THREAT_SCALED_COMPONENT) !== undefined) continue;
      const owner = ownerOf(this.world, id);
      if (owner === null || owner === FactionId.PLAYER) continue;
      this.world.addComponent<ThreatScaledComponent>(id, THREAT_SCALED_COMPONENT, { level: this.level });
      const hp = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
      const ratio = hp.max > 0 ? hp.current / hp.max : 1;
      hp.max = Math.max(1, Math.round(hp.max * health));
      hp.current = Math.max(1, Math.round(hp.max * ratio));
      hp.damage = Math.max(0, Math.round(hp.damage * damage));
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!;
      combat.attackDamage = Math.max(1, Math.round(combat.attackDamage * damage));
    }
  }
}
