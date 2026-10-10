import type { World } from '../../../engine/ecs/World';
import type { EntityId } from '../../../shared/types';
import { COMPONENT, type CombatComponent } from '../../components/components';
import { SOLDIER_ATTACK_RANGE, SOLDIER_ATTACK_COOLDOWN } from '../../../shared/constants';
import { HUMAN_COMPONENT } from '../../rival/humanComponents';
import { armoredDamage } from '../../rival/humanBase';

/** Everything that hunts the colony: wildlife predators, then rival units and turrets */
const PREDATOR_STORES = [
  COMPONENT.BEETLE,
  COMPONENT.CRICKET,
  COMPONENT.CRYSTAL_UNIT,
  HUMAN_COMPONENT.UNIT,
  HUMAN_COMPONENT.BUILDING,
] as const;

/** Flat damage reduction per hit (Human units and buildings); read through armorOf */
export const ARMOR_COMPONENT = 'armor';

export interface ArmorComponent {
  armor: number;
}

/** Armor lent by an aura (the Coronel en Tanque Pesado), on top of the unit's own; WaveBossSystem keeps it */
export const AURA_ARMOR_COMPONENT = 'aura_armor';

/** An entity's armor (its own plus any aura's), 0 when it has none */
export function armorOf(world: World, id: EntityId): number {
  return (world.getComponent<ArmorComponent>(id, ARMOR_COMPONENT)?.armor ?? 0)
    + (world.getComponent<ArmorComponent>(id, AURA_ARMOR_COMPONENT)?.armor ?? 0);
}

/** A hit of `damage` on `targetId` after its armor (floor of 1 damage on an armored target) */
export function damageAfterArmor(world: World, targetId: EntityId, damage: number): number {
  return armoredDamage(damage, armorOf(world, targetId));
}

/**
 * Build the victim → attacker map for this tick in ONE pass over the predators.
 * Callers that check "who is attacking me?" per ant MUST use this instead of
 * scanning all predators per ant — with hundreds of ants that was the single
 * hottest loop in the game (2 world.query calls per ant per frame).
 */
export function buildAttackerMap(world: World): Map<EntityId, EntityId> {
  const map = new Map<EntityId, EntityId>();
  for (const store of PREDATOR_STORES) {
    for (const pid of world.query(store, COMPONENT.COMBAT)) {
      const combat = world.getComponent<CombatComponent>(pid, COMPONENT.COMBAT);
      if (combat && combat.targetEntityId !== null && !map.has(combat.targetEntityId)) {
        map.set(combat.targetEntityId, pid);
      }
    }
  }
  return map;
}

/**
 * Find the predator (beetle or cricket) whose combat target is this entity —
 * i.e. who is actively attacking it. One-off variant for low-frequency callers
 * (PorterSystem's handful of porters); per-ant loops use buildAttackerMap.
 */
export function findAttacker(world: World, entityId: EntityId): EntityId | null {
  for (const store of PREDATOR_STORES) {
    for (const pid of world.query(store, COMPONENT.COMBAT)) {
      const combat = world.getComponent<CombatComponent>(pid, COMPONENT.COMBAT);
      if (combat && combat.targetEntityId === entityId) return pid;
    }
  }
  return null;
}

/** Lazily add a melee CombatComponent (damage from HealthComponent) or retarget the existing one */
export function ensureCombatComponent(world: World, entityId: EntityId, targetId: EntityId): void {
  const combat = world.getComponent<CombatComponent>(entityId, COMPONENT.COMBAT);
  if (!combat) {
    const health = world.getComponent<{ damage: number }>(entityId, COMPONENT.HEALTH);
    world.addComponent<CombatComponent>(entityId, COMPONENT.COMBAT, {
      attackDamage: health ? health.damage : 1,
      attackRange: SOLDIER_ATTACK_RANGE,
      attackCooldown: SOLDIER_ATTACK_COOLDOWN,
      attackTimer: 0,
      targetEntityId: targetId,
    });
  } else {
    combat.targetEntityId = targetId;
  }
}
