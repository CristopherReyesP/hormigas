import type { Vector2, EntityId } from '../../shared/types';

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
  Depositing: 'depositing',
  Fleeing: 'fleeing',
  ChasingEnemy: 'chasing_enemy',
  AttackingEnemy: 'attacking_enemy',
  PatrollingNest: 'patrolling_nest',
  GoingToDen: 'going_to_den',
  AttackingDen: 'attacking_den',
  Healing: 'healing',
  FeedingQueen: 'feeding_queen',
  TendingEgg: 'tending_egg',
  FetchingFood: 'fetching_food',
  GoingToDigSite: 'going_to_dig_site',
  Excavating: 'excavating',
  MovingEgg: 'moving_egg',
  Eating: 'eating',
  Hauling: 'hauling',
  Scavenging: 'scavenging',
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
  commandTargetId: EntityId | null; // manual attack wave target (overrides auto-targeting)
  eggTargetTile?: { x: number; y: number } | null; // nurse: locked incubation tile while carrying an egg
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
  shape: 'circle' | 'square' | 'ant' | 'food' | 'nest' | 'beetle' | 'beetle_den' | 'cricket' | 'cricket_den' | 'giant_mushroom' | 'queen';
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
} as const;
export type BeetleState = typeof BeetleState[keyof typeof BeetleState];

export interface BeetleComponent {
  state: BeetleState;
  stateTimer: number;
  targetEntityId: EntityId | null;
  denEntityId: EntityId | null;
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
} as const;
