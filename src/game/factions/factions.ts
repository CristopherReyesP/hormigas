// Factions: who owns an entity and how two owners treat each other.
// Nothing reads ownership yet; later P4 units route targeting, damage, fog,
// selection and economy through it. Faction state lives on each World,
// never in this module.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import type { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { COMPONENT, type OwnerComponent } from '../components/components';
import type { RaceId } from '../run/RunSetup';

/** Small int faction ids, stored in the OWNER component. */
export const FactionId = {
  WILDLIFE: 0,
  PLAYER: 1,
  RIVAL: 2,
} as const;
export type FactionId = typeof FactionId[keyof typeof FactionId];

export type Relation = 'ally' | 'neutral' | 'enemy';

/** A playable race, or the beetles and crickets. */
export type FactionRace = RaceId | 'wildlife';

export type FactionController = 'human' | 'ai' | 'none';

export interface FactionState {
  readonly id: FactionId;
  readonly race: FactionRace;
  readonly controller: FactionController;
  /** The faction's own fog (U4) */
  fog?: VisibilityGrid;
  /** Stock and spending over the faction's resources (U5 narrows the type) */
  economy?: unknown;
  /** The base core entity: the Swarm nest, a Crystal hive, a Human command post (U2) */
  coreId?: EntityId;
  /** Interior sites the faction owns (U6a narrows the type) */
  sites?: unknown;
}

/** Colony components that mean "the player's", for entities created without OWNER */
const PLAYER_MARKERS = [COMPONENT.ANT, COMPONENT.NEST, COMPONENT.QUEEN, COMPONENT.QUEEN_ENTITY, COMPONENT.EGG];
/** Wildlife components, for entities created without OWNER */
const WILDLIFE_MARKERS = [COMPONENT.BEETLE, COMPONENT.CRICKET, COMPONENT.BEETLE_DEN, COMPONENT.CRICKET_DEN];

/**
 * The faction that owns an entity: its OWNER component, else a fallback from
 * its components so entities built without OWNER (old tests, scripts) keep
 * their side. Food, props and missing entities are unowned (null).
 */
export function ownerOf(world: World, id: EntityId): FactionId | null {
  const owner = world.getComponent<OwnerComponent>(id, COMPONENT.OWNER);
  if (owner) return owner.faction;
  if (PLAYER_MARKERS.some((component) => world.getComponent(id, component) !== undefined)) return FactionId.PLAYER;
  if (WILDLIFE_MARKERS.some((component) => world.getComponent(id, component) !== undefined)) return FactionId.WILDLIFE;
  return null;
}

/**
 * Same faction → ally (wildlife included); exactly one side wildlife → neutral;
 * two different races' factions → enemy.
 */
export function relation(a: FactionId, b: FactionId): Relation {
  if (a === b) return 'ally';
  if (a === FactionId.WILDLIFE || b === FactionId.WILDLIFE) return 'neutral';
  return 'enemy';
}

/** Neutral wildlife still fights everyone, so only allies are safe. */
export function isHostile(rel: Relation): boolean {
  return rel !== 'ally';
}

/** Today's roster: the human-controlled Swarm and the wildlife. Fresh records on every call. */
export function defaultFactions(): FactionState[] {
  return [
    { id: FactionId.WILDLIFE, race: 'wildlife', controller: 'none' },
    { id: FactionId.PLAYER, race: 'swarm', controller: 'human' },
  ];
}

/** The factions in one match. One instance belongs to each World. */
export class FactionRegistry {
  private readonly factions = new Map<FactionId, FactionState>();

  constructor(factions: readonly FactionState[] = defaultFactions()) {
    for (const faction of factions) {
      if (this.factions.has(faction.id)) throw new Error(`FactionRegistry: faction ${faction.id} is listed twice`);
      this.factions.set(faction.id, faction);
    }
  }

  get(id: FactionId): FactionState | undefined {
    return this.factions.get(id);
  }

  has(id: FactionId): boolean {
    return this.factions.has(id);
  }

  /** Every faction, in roster order */
  list(): FactionState[] {
    return [...this.factions.values()];
  }
}
