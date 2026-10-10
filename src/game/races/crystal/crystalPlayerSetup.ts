// The player's Crystal Hive at the start of a run: the Hive core at the map
// center, two drones and a mineral stock. No nest, no queen, no cave.

import type { World } from '../../../engine/ecs/World';
import type { EntityId } from '../../../shared/types';
import { COMPONENT, type CombatComponent } from '../../components/components';
import { createCrystalHive } from '../../entities/factories';
import { FactionId } from '../../factions/factions';
import { createCrystalUnit } from '../../rival/crystalFactories';
import { CRYSTAL_HIVE_DEFENSE, CRYSTAL_PLAYER_START } from './crystalPlayerRules';

export interface CrystalPlayerBase {
  hiveId: EntityId;
  drones: EntityId[];
}

/** Raise the player's Hive at (x, y) with its starting drones and minerals; registers it as the player's core. */
export function spawnCrystalPlayerBase(world: World, x: number, y: number): CrystalPlayerBase {
  const hiveId = createCrystalHive(world, x, y, FactionId.PLAYER);
  // The Hive shoots back: CombatSystem fires its bolt, CrystalPlayerSystem aims it
  world.addComponent<CombatComponent>(hiveId, COMPONENT.COMBAT, {
    attackDamage: CRYSTAL_HIVE_DEFENSE.damage,
    attackRange: CRYSTAL_HIVE_DEFENSE.range,
    attackCooldown: CRYSTAL_HIVE_DEFENSE.cooldown,
    attackTimer: 0,
    targetEntityId: null,
  });
  const drones: EntityId[] = [];
  for (let i = 0; i < CRYSTAL_PLAYER_START.drones; i++) {
    drones.push(createCrystalUnit(world, 'drone', x - 1 + i * 2, y + 2.5, hiveId, FactionId.PLAYER));
  }
  world.minerals.deposit(CRYSTAL_PLAYER_START.minerals);
  const player = world.factions.get(FactionId.PLAYER);
  if (player) player.coreId = hiveId;
  return { hiveId, drones };
}
