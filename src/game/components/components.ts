import type { Vector2, EntityId } from '../../shared/types';
import type { FactionId } from '../factions/factions';

// Position in tile coordinates (can be fractional for smooth movement)
export interface PositionComponent {
  x: number;
  y: number;
  prevX: number; // for interpolation
  prevY: number;
}

export interface VelocityComponent {
  x: number;
  y: number;
}

export const AntRole = {
  Worker: 'worker',
  Soldier: 'soldier',
  Scout: 'scout',
  Nurse: 'nurse',
  Defender: 'defender',
} as const;

export type AntRole = typeof AntRole[keyof typeof AntRole];

export const AntState = {
  Idle: 'idle',
  Searching: 'searching',
  GoingToFood: 'going_to_food',
  Harvesting: 'harvesting',
  ReturningHome: 'returning_home',
  Fleeing: 'fleeing',
  ChasingEnemy: 'chasing_enemy',
  AttackingEnemy: 'attacking_enemy',
  PatrollingNest: 'patrolling_nest',
  Healing: 'healing', // went below to eat — eating is what heals (UndergroundHealingSystem)
  FeedingQueen: 'feeding_queen',
  TendingEgg: 'tending_egg',
  FetchingFood: 'fetching_food',
  GoingToDigSite: 'going_to_dig_site',
  Excavating: 'excavating',
  MovingEgg: 'moving_egg',
  Eating: 'eating',
  Hauling: 'hauling',
  Scavenging: 'scavenging',
  /** Following a player order (PlayerOrderComponent); the colony AI waits until it ends */
  Moving: 'moving',
  /** A warrior keeping the post a player order left it on (OrderKind.Guard) */
  Guarding: 'guarding',
  /** Standing still under Mantener posición (OrderKind.Hold) */
  Holding: 'holding',
} as const;

export type AntState = typeof AntState[keyof typeof AntState];

export const FoodType = {
  Leaf: 'leaf',
  Mushroom: 'mushroom',
  BeetleMeat: 'beetle_meat',
  CricketMeat: 'cricket_meat',
  GiantMushroom: 'giant_mushroom',
} as const;
export type FoodType = typeof FoodType[keyof typeof FoodType];

export interface AntComponent {
  role: AntRole;
  state: AntState;
  stateTimer: number; // time in current state
  commandTargetId: EntityId | null; // nurse: the egg it is feeding or carrying
  eggTargetTile?: { x: number; y: number } | null; // nurse: locked incubation tile while carrying an egg
  stuckTimer?: number;    // seconds elapsed with sub-threshold displacement (Bug 3)
  lastX?: number;         // last sampled world x for stall detection (Bug 3)
  lastY?: number;         // last sampled world y for stall detection (Bug 3)
}

export interface HungerComponent {
  current: number; // 0 = starving, max = full
  max: number;
  decayRate: number; // per second
}

export interface CarryingComponent {
  resourceType: string | null;
  amount: number;
  maxCapacity: number;
}

export interface HealthComponent {
  current: number;
  max: number;
  damage: number;
}

export interface FoodSourceComponent {
  resourceType: string;
  amount: number;
}

export interface NestComponent {
  foodStored: number;
  mushroomStored: number;
  meatStored: number;
  antCount: number;
}

export interface PathComponent {
  waypoints: Vector2[];
  currentIndex: number;
}

export interface RenderComponent {
  color: string;
  radius: number;
  shape: 'circle' | 'square' | 'ant' | 'food' | 'nest' | 'beetle' | 'beetle_den' | 'cricket' | 'cricket_den' | 'giant_mushroom' | 'queen' | 'crystal_drone' | 'crystal_hive';
}

export interface FacingComponent {
  angle: number; // radians, 0 = right, PI/2 = down
  legPhase: number; // animation phase for leg movement (0-2PI)
}

export interface QueenComponent {
  breedTimer: number;      // countdown to next ant (seconds)
  breedCooldown: number;   // total time to breed (seconds)
  isBreeding: boolean;
  breedRole: AntRole;      // what role to breed next
}

export interface SelectableComponent {
  selected: boolean;
}

export interface RoleStatsComponent {
  visionRange: number;
  speedMultiplier: number;
  carrySpeedPenalty: number;
}

// === Beetle (Enemy) Components ===

export const BeetleState = {
  Roaming: 'roaming',
  ChasingFood: 'chasing_food',
  Eating: 'eating',
  ChasingAnt: 'chasing_ant',
  Attacking: 'attacking',
  /** Wounded: breaks off, runs for its den and licks its wounds before hunting again */
  Retreating: 'retreating',
} as const;
export type BeetleState = typeof BeetleState[keyof typeof BeetleState];

export interface BeetleComponent {
  state: BeetleState;
  stateTimer: number;
  targetEntityId: EntityId | null;
  denEntityId: EntityId | null;
  /** Countdown to the next re-aim while chasing a moving ant */
  repathTimer?: number;
}

export interface BeetleDenComponent {
  health: number;
  maxHealth: number;
  spawnTimer: number;
  spawnCooldown: number;
  maxBeetles: number;
  activeBeetles: number;
}

export interface CombatComponent {
  attackDamage: number;
  attackRange: number;
  attackCooldown: number;
  attackTimer: number;
  targetEntityId: EntityId | null;
}

// === Cricket (Enemy) Components ===

export const CricketState = {
  GoingToNest: 'going_to_nest',
  StealingFood: 'stealing_food',
  Retreating: 'retreating',
  Attacking: 'attacking',
} as const;
export type CricketState = typeof CricketState[keyof typeof CricketState];

export interface CricketComponent {
  state: CricketState;
  stateTimer: number;
  targetEntityId: EntityId | null;
  denEntityId: EntityId | null;
  stolenFood: number;
  previousState: CricketState;
}

export interface CricketDenComponent {
  health: number;
  maxHealth: number;
  spawnTimer: number;
  spawnCooldown: number;
  maxCrickets: number;
  activeCrickets: number;
}

// Queen as a standalone entity (underground)
export interface QueenEntityComponent {
  hunger: number;
  maxHunger: number;
  hungerDecay: number;
}

// Egg queue attached to the queen entity
export interface EggQueueComponent {
  queue: Array<{ role: AntRole; layTimer: number; layTimerTotal: number }>;
  maxPerType: number;
  currentlyLaying: boolean;
}

// Individual egg entity
export interface EggComponent {
  role: AntRole;
  hatchTimer: number;
  hatchTime: number;
  fedAmount: number;
  requiredFood: number;
}

export const ColonyPriority = {
  Gather: 'gather',
  Explore: 'explore',
  Defend: 'defend',
} as const;

export type ColonyPriority = typeof ColonyPriority[keyof typeof ColonyPriority];

export const Layer = {
  Surface: 'surface',
  Underground: 'underground',
} as const;
export type LayerValue = typeof Layer[keyof typeof Layer];

export interface LayerComponent {
  layer: LayerValue;
}

/** Order kinds the player can give, StarCraft style. */
export const OrderKind = {
  /** Walk to a formation slot, ignoring enemies */
  Move: 'move',
  /** Chase one enemy (a beetle, a cricket or a den) and fight it until it dies */
  Attack: 'attack',
  /** Walk to a formation slot, fighting every enemy that comes into view on the way */
  AttackMove: 'attack_move',
  /** Stand still and fight only what comes into attack range (Mantener posición) */
  Hold: 'hold',
  /** A warrior's post once a move or attack order is done: fight what comes near, then return */
  Guard: 'guard',
} as const;
export type OrderKind = typeof OrderKind[keyof typeof OrderKind];

/**
 * A direct player command. While an ant carries one, AntAISystem drives it and
 * the colony systems (porters, digging, garrison, invasion draft) leave it alone.
 * Workers drop the order on arrival and go back to their job; warriors swap it
 * for a Guard order and keep the spot until the player, the horn or hunger
 * releases them.
 */
export interface PlayerOrderComponent {
  kind: OrderKind;
  /**
   * Move and attack-move: this ant's formation slot (tile). Hold and guard:
   * the post it keeps. Attack: where the enemy was last seen.
   */
  target: Vector2;
  /** Attack: the ordered enemy. Attack-move, hold and guard: the enemy it is fighting now, if any */
  targetId: EntityId | null;
  /** Seconds until a chase route is refreshed (the quarry keeps moving) */
  repath: number;
  /** Layer the order was given on; orders only run on the surface for now */
  layer: LayerValue;
  /** Seconds spent on the way toward the goal (fights do not count); drives the timeout */
  elapsed: number;
  /** A* routes requested so far (0 = still waiting for its first route) */
  routes: number;
}

/** Which faction an entity belongs to. Read it through `ownerOf`, which falls back when it is missing. */
export interface OwnerComponent {
  faction: FactionId;
}

// === Crystal Hive (rival faction) ===

export const CrystalUnitState = {
  /** At home: keeps near the hive and fights what comes close */
  Guarding: 'guarding',
  /** Sent with a night wave: attack-moves to `goal`, fighting every enemy it meets */
  Assaulting: 'assaulting',
} as const;
export type CrystalUnitState = typeof CrystalUnitState[keyof typeof CrystalUnitState];

export type CrystalUnitKind = 'drone';

/** A Crystal Hive unit. Crystal units are not ants: CrystalUnitAISystem drives them. */
export interface CrystalUnitComponent {
  kind: CrystalUnitKind;
  state: CrystalUnitState;
  /** The hive that crystallized it (null once that hive is gone) */
  hiveId: EntityId | null;
  /** Assaulting: the tile it marches on (the enemy nest) */
  goal: Vector2 | null;
  /** Seconds until the route may be recomputed */
  repathTimer: number;
}

/** The Crystal Hive's base structure: it crystallizes drones and sends the night waves. */
export interface CrystalHiveComponent {
  /** Seconds until the next drone crystallizes */
  productionTimer: number;
  /** The last night number a wave left on (0 = none yet) */
  lastWaveNight: number;
}

// Component name constants to avoid magic strings
export const COMPONENT = {
  POSITION: 'position',
  VELOCITY: 'velocity',
  ANT: 'ant',
  HUNGER: 'hunger',
  CARRYING: 'carrying',
  HEALTH: 'health',
  FOOD_SOURCE: 'food_source',
  NEST: 'nest',
  PATH: 'path',
  RENDER: 'render',
  QUEEN: 'queen',
  SELECTABLE: 'selectable',
  ROLE_STATS: 'role_stats',
  FACING: 'facing',
  BEETLE: 'beetle',
  BEETLE_DEN: 'beetle_den',
  COMBAT: 'combat',
  CRICKET: 'cricket',
  CRICKET_DEN: 'cricket_den',
  LAYER: 'layer',
  QUEEN_ENTITY: 'queen_entity',
  EGG_QUEUE: 'egg_queue',
  EGG: 'egg',
  PLAYER_ORDER: 'player_order',
  OWNER: 'owner',
  CRYSTAL_UNIT: 'crystal_unit',
  CRYSTAL_HIVE: 'crystal_hive',
} as const;
