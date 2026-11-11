// Veteran ants: an ant that survives its fights climbs ranks. Each rank makes
// it tougher and harder biting, a badge shows over it, and at the top rank it
// earns a name the colony remembers when it falls. Losing a veteran hurts, so
// the player has a reason to pull a wounded one back instead of throwing it away.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import { AntRole, COMPONENT, Layer, type AntComponent, type CombatComponent, type HealthComponent, type LayerComponent, type LayerValue, type PositionComponent } from '../components/components';
import { FLOAT_COLOR, pushFloat } from '../vfx/feedbackFx';

export const VETERAN_COMPONENT = 'veteran';

export interface VeteranComponent {
  kills: number;
  rank: number;
  /** Given at the top rank */
  name: string | null;
}

export const VETERAN = {
  /** Kills needed to reach rank 1, 2 and 3 */
  rankKills: [3, 8, 15],
  /** Extra damage and max health per rank */
  perRank: 0.12,
  /** With the retreat on, a ranked ant below this share of its health walks home to heal */
  retreatBelow: 0.35,
} as const;

export const MAX_RANK = VETERAN.rankKills.length;

const TITLES = ['', 'Cabo', 'Sargento', 'Capitana'] as const;

const NAMES = [
  'Mandíbula', 'Centella', 'Ámbar', 'Tenaza', 'Espina', 'Ceniza', 'Brasa', 'Quitina',
  'Aguijón', 'Raíz', 'Obsidiana', 'Trueno', 'Savia', 'Grava', 'Resina', 'Furia',
] as const;

export function veteranOf(world: World, id: EntityId): VeteranComponent | undefined {
  return world.getComponent<VeteranComponent>(id, VETERAN_COMPONENT);
}

/** The rank `kills` earn */
export function rankFor(kills: number): number {
  let rank = 0;
  for (const needed of VETERAN.rankKills) if (kills >= needed) rank++;
  return rank;
}

/** Damage and max health factor of an ant at `rank` */
export function veteranMultiplier(rank: number): number {
  return 1 + VETERAN.perRank * Math.max(0, Math.min(MAX_RANK, rank));
}

/** How the colony calls a veteran: "Sargento", or "Capitana Mandíbula" at the top */
export function veteranTitle(vet: VeteranComponent): string {
  const title = TITLES[Math.min(MAX_RANK, vet.rank)];
  return vet.name ? `${title} ${vet.name}` : title;
}

/** The name a top-rank ant takes: picked from its id, so it never needs saving apart */
export function veteranName(id: EntityId): string {
  return NAMES[(id * 7) % NAMES.length];
}

const ROLE_LABEL: Partial<Record<AntRole, string>> = {
  [AntRole.Soldier]: 'soldado',
  [AntRole.Defender]: 'defensora',
  [AntRole.Worker]: 'obrera',
};

/**
 * The colony ant `id` killed an enemy: count it, and promote it when it earns
 * a rank (its bonus arrives at once, the extra health as health).
 */
export function creditKill(world: World, id: EntityId): void {
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
  if (!ant) return;
  let vet = veteranOf(world, id);
  if (!vet) {
    vet = { kills: 0, rank: 0, name: null };
    world.addComponent<VeteranComponent>(id, VETERAN_COMPONENT, vet);
  }
  vet.kills++;
  const rank = rankFor(vet.kills);
  if (rank <= vet.rank) return;
  const before = veteranMultiplier(vet.rank);
  vet.rank = rank;
  const scale = veteranMultiplier(rank) / before;
  const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
  if (health) {
    const max = Math.round(health.max * scale);
    if (health.current > 0) health.current += max - health.max;
    health.max = max;
    health.damage = Math.round(health.damage * scale);
  }
  const combat = world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
  if (combat) combat.attackDamage = Math.round(combat.attackDamage * scale);

  const at = whereIs(world, id);
  if (at) pushFloat(world, at, '¡ASCENSO!', FLOAT_COLOR.promo, 13, 1.4);

  const role = ROLE_LABEL[ant.role] ?? 'hormiga';
  if (rank >= MAX_RANK) {
    vet.name = veteranName(id);
    world.pushNotification('success', `🎖️ Una ${role} con ${vet.kills} bajas asciende: ¡${veteranTitle(vet)}! Cuídala`, undefined, 0, at);
  } else {
    world.pushNotification('info', `🎖️ Una ${role} asciende a ${TITLES[rank]} (${vet.kills} bajas)`, `veteran-rank-${rank}`, 8000, at);
  }
}

function whereIs(world: World, id: EntityId): { x: number; y: number; layer: LayerValue } | undefined {
  const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
  if (!pos) return undefined;
  return { x: pos.x, y: pos.y, layer: world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface };
}

/** A veteran falls: the named ones are mourned by name */
export function mournVeteran(world: World, id: EntityId): void {
  const vet = veteranOf(world, id);
  if (!vet || vet.rank < 2) return;
  world.pushNotification('danger', `🪦 Cayó ${veteranTitle(vet)} tras ${vet.kills} bajas`, undefined, 0, whereIs(world, id));
}

/** A ranked ant's card line: its title and kills (undefined below rank 1) */
export function veteranInfo(world: World, id: EntityId): { title: string; kills: number; rank: number } | undefined {
  const vet = veteranOf(world, id);
  if (!vet || vet.rank < 1) return undefined;
  return { title: veteranTitle(vet), kills: vet.kills, rank: vet.rank };
}

/** A ranked ant hurt badly enough to pull out of the fight (when the colony's retreat is on) */
export function shouldRetreat(world: World, id: EntityId): boolean {
  if (!world.veteranRetreat) return false;
  const vet = veteranOf(world, id);
  if (!vet || vet.rank < 1) return false;
  const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
  return !!health && health.current > 0 && health.current < health.max * VETERAN.retreatBelow;
}
