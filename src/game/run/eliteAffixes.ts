// Elite wave units: a plain beetle, leaper, Crystal unit or Human troop with
// one affix that changes how it fights. makeElite() stamps the affix and its
// stat changes; EliteSystem runs the ones that act over time (Sanador's
// pulse, Furioso's rage, Explosivo's blast). Works on any unit with health.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import { COMPONENT, type CombatComponent, type HealthComponent } from '../components/components';
import type { ShieldComponent } from '../rival/crystalShield';
import { ARMOR_COMPONENT, type ArmorComponent } from '../systems/helpers/combatHelpers';
import { setSpeedFactor } from './waveRuntime';
import type { EliteAffix } from './waveComposition';

export type { EliteAffix };

export const ELITE_COMPONENT = 'elite';

export interface EliteComponent {
  affix: EliteAffix;
  /** Sanador: seconds since the last healing pulse */
  timer: number;
  /** Furioso: the rage already took hold (it happens once) */
  enraged: boolean;
}

/** What each affix does, in numbers. Starting points for playtests. */
export const ELITE_TUNING = {
  /** Every elite: health multiplier over its plain kind */
  healthMult: 1.3,
  /** Blindado: flat armor added (beetles, leapers, Human troops) */
  armoredArmor: 3,
  /** Blindado on a Crystal unit: shield points added instead */
  armoredShield: 120,
  /** Veloz */
  swiftSpeed: 1.5,
  /** Furioso: health share below which it enrages */
  furiousThreshold: 0.3,
  furiousDamage: 1.6,
  furiousCooldown: 0.7,
  furiousSpeed: 1.3,
  /** Sanador: a pulse every `healerInterval` s heals allies within `healerRadius` by `healerShare` of their max */
  healerInterval: 3,
  healerRadius: 3.5,
  healerShare: 0.15,
  /** Explosivo: the blast goes off `explosionDelay` s after death (the telegraph) */
  explosionDelay: 0.9,
  explosionRadius: 2.5,
  explosionDamage: 35,
} as const;

export interface EliteAffixInfo {
  /** Spanish name shown on the info card */
  name: string;
  /** Glyph drawn over the unit and on the card */
  icon: string;
  /** Outline and glow color */
  color: string;
  description: string;
}

export const ELITE_AFFIXES: Readonly<Record<EliteAffix, EliteAffixInfo>> = {
  explosive: { name: 'Explosivo', icon: '✸', color: '#ff7a2f', description: 'Al morir estalla tras un instante y daña a las hormigas cercanas.' },
  healer: { name: 'Sanador', icon: '✚', color: '#5cf07a', description: 'Cada pocos segundos cura a sus aliados cercanos.' },
  armored: { name: 'Blindado', icon: '⛨', color: '#9fb6d6', description: 'Armadura extra, o un escudo mayor si es de cristal.' },
  swift: { name: 'Veloz', icon: '»', color: '#f5e050', description: 'Se mueve mucho más rápido.' },
  furious: { name: 'Furioso', icon: '♨', color: '#ff3b5c', description: 'Bajo el 30% de vida se enfurece: golpea más fuerte y más rápido.' },
};

export function eliteOf(world: World, id: EntityId): EliteComponent | undefined {
  return world.getComponent<EliteComponent>(id, ELITE_COMPONENT);
}

/** Turn a freshly spawned wave unit into an elite with `affix` */
export function makeElite(world: World, id: EntityId, affix: EliteAffix): void {
  world.addComponent<EliteComponent>(id, ELITE_COMPONENT, { affix, timer: 0, enraged: false });
  const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
  if (health) {
    health.max = Math.max(1, Math.round(health.max * ELITE_TUNING.healthMult));
    health.current = health.max;
  }
  if (affix === 'swift') setSpeedFactor(world, id, 'swift', ELITE_TUNING.swiftSpeed);
  if (affix === 'armored') {
    const shield = world.getComponent<ShieldComponent>(id, COMPONENT.SHIELD);
    if (shield) {
      shield.max += ELITE_TUNING.armoredShield;
      shield.current = shield.max;
    } else {
      const armor = world.getComponent<ArmorComponent>(id, ARMOR_COMPONENT);
      if (armor) armor.armor += ELITE_TUNING.armoredArmor;
      else world.addComponent<ArmorComponent>(id, ARMOR_COMPONENT, { armor: ELITE_TUNING.armoredArmor });
    }
  }
}

/** Furioso's rage: harder, quicker blows and a faster stride, once */
export function enrage(world: World, id: EntityId, elite: EliteComponent): void {
  if (elite.enraged) return;
  elite.enraged = true;
  const combat = world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
  if (combat) {
    combat.attackDamage = Math.round(combat.attackDamage * ELITE_TUNING.furiousDamage);
    combat.attackCooldown *= ELITE_TUNING.furiousCooldown;
  }
  const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
  if (health) health.damage = Math.round(health.damage * ELITE_TUNING.furiousDamage);
  setSpeedFactor(world, id, 'furious', ELITE_TUNING.furiousSpeed);
}
