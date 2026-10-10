import type { World } from '../../../engine/ecs/World';
import type { EntityId } from '../../../shared/types';
import { COMPONENT, type CombatComponent } from '../../components/components';
import { SOLDIER_ATTACK_RANGE, SOLDIER_ATTACK_COOLDOWN } from '../../../shared/constants';

/** Everything that hunts the colony: wildlife predators and rival Crystal units, in that order */
const PREDATOR_STORES = [COMPONENT.BEETLE, COMPONENT.CRICKET, COMPONENT.CRYSTAL_UNIT] as const;

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
