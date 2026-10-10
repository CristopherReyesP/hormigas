// What CombatSystem does differently for the Humans: gunfire VFX, tank splash
// and the way their units and buildings die. Kept out of CombatSystem so the
// Human rival plugs in with a few one-line calls.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  Layer,
  type HealthComponent,
  type LayerComponent,
  type LayerValue,
  type PositionComponent,
} from '../components/components';
import { FactionId, isHostileTo, ownerOf } from '../factions/factions';
import { HUMAN_UNIT_STATS, TANK_SPLASH_SHARE } from '../rival/humanBase';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent } from '../rival/humanComponents';
import { humanShotsFor, type HumanShotKind } from '../rival/humanShots';
import type { CombatVfx } from '../vfx/CombatVfx';
import { damageAfterArmor } from './helpers/combatHelpers';
import { BOSS_COMPONENT } from '../run/miniBoss';
import { STRUCTURE_COMPONENT } from '../run/defenses';

/** A Human unit or building */
export function isHumanEntity(world: World, id: EntityId): boolean {
  return world.getComponent(id, HUMAN_COMPONENT.UNIT) !== undefined
    || world.getComponent(id, HUMAN_COMPONENT.BUILDING) !== undefined;
}

function shotKind(world: World, attackerId: EntityId): HumanShotKind | null {
  const unit = world.getComponent<HumanUnitComponent>(attackerId, HUMAN_COMPONENT.UNIT);
  if (unit) return unit.type === 'tank' ? 'shell' : unit.type === 'marksman' ? 'sniper' : 'rifle';
  if (world.getComponent(attackerId, HUMAN_COMPONENT.BUILDING)) return 'turret';
  return null;
}

/** A Human attacker fires a tracer (visual only); false when the attacker is not Human */
export function fireHumanShot(
  world: World,
  attackerId: EntityId,
  from: { x: number; y: number },
  to: { x: number; y: number },
): boolean {
  const kind = shotKind(world, attackerId);
  if (!kind) return false;
  humanShotsFor(world).fire(kind, from.x, from.y, to.x, to.y);
  return true;
}

/** Stores a tank shell can catch besides its target */
const SPLASH_STORES = [COMPONENT.ANT, COMPONENT.BEETLE, COMPONENT.CRICKET, COMPONENT.CRYSTAL_UNIT, HUMAN_COMPONENT.UNIT, STRUCTURE_COMPONENT];

/**
 * A tank shell that hit `targetId` for `damage` also hits every enemy of the
 * tank's faction within its splash radius (TANK_SPLASH_SHARE of the damage,
 * after each one's armor). Allies are never hurt. Returns the splashed
 * entities it killed, for CombatSystem to bury.
 */
export function applyHumanSplash(world: World, attackerId: EntityId, targetId: EntityId, damage: number): EntityId[] {
  const unit = world.getComponent<HumanUnitComponent>(attackerId, HUMAN_COMPONENT.UNIT);
  if (!unit) return [];
  // The Coronel en Tanque Pesado's shells splash wider than a plain tank's
  const radius = world.getComponent<{ splashRadius?: number }>(attackerId, BOSS_COMPONENT)?.splashRadius ?? HUMAN_UNIT_STATS[unit.type].splashRadius;
  if (radius <= 0) return [];
  const at = world.getComponent<PositionComponent>(targetId, COMPONENT.POSITION);
  if (!at) return [];
  const faction = ownerOf(world, attackerId) ?? FactionId.RIVAL;
  const layerOf = (id: EntityId) => world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface;
  const targetLayer = layerOf(targetId);
  const killed: EntityId[] = [];
  for (const store of SPLASH_STORES) {
    for (const id of world.query(store, COMPONENT.POSITION, COMPONENT.HEALTH)) {
      if (id === targetId || layerOf(id) !== targetLayer) continue;
      if (!isHostileTo(world, faction, id)) continue;
      const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      if (Math.hypot(pos.x - at.x, pos.y - at.y) > radius) continue;
      const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
      if (health.current <= 0) continue;
      health.current -= damageAfterArmor(world, id, damage * TANK_SPLASH_SHARE);
      if (health.current <= 0) killed.push(id);
    }
  }
  return killed;
}

/**
 * The death of a Human unit or building: sparks and scrap for a unit, a
 * collapse and a blast for a building. Returns false for anything else.
 */
export function handleHumanDeath(world: World, vfx: CombatVfx, id: EntityId): boolean {
  if (!isHumanEntity(world, id)) return false;
  const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
  const layer: LayerValue = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface;
  const building = world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING);
  if (pos) {
    humanShotsFor(world).fire('shell', pos.x, pos.y, pos.x, pos.y);
    if (building) vfx.denCollapse(pos.x, pos.y, layer, 'beetleDen');
    else vfx.hit(pos.x, pos.y, pos.x, pos.y, layer, 'wildlife', 'beetle');
  }
  if (building) {
    world.metrics.densDestroyed++;
    world.pushNotification(
      'success',
      building.kind === 'command_center' ? '🏳️ ¡Cayó el Centro de Mando humano!' : `💥 ¡Destruiste ${BUILDING_ARTICLE[building.kind]}!`,
    );
  }
  return true;
}

const BUILDING_ARTICLE: Record<HumanBuildingComponent['kind'], string> = {
  command_center: 'el Centro de Mando',
  barracks: 'un cuartel humano',
  bunker: 'un búnker humano',
  supply_depot: 'un depósito humano',
  factory: 'una fábrica humana',
};
