import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  AntRole,
  AntState,
  BeetleState,
  CricketState,
  FoodType,
  Layer,
  type PositionComponent,
  type AntComponent,
  type HungerComponent,
  type CarryingComponent,
  type HealthComponent,
  type PathComponent,
  type RenderComponent,
  type FoodSourceComponent,
  type MineralComponent,
  type NestComponent,
  type SelectableComponent,
  type RoleStatsComponent,
  type QueenComponent,
  type QueenEntityComponent,
  type EggQueueComponent,
  type EggComponent,
  type FacingComponent,
  type BeetleComponent,
  type BeetleDenComponent,
  type CombatComponent,
  type CricketComponent,
  type CricketDenComponent,
  type LayerComponent,
  type LayerValue,
  type OwnerComponent,
  type CrystalHiveComponent,
} from '../components/components';
import { FactionId } from '../factions/factions';
import { CRYSTAL_HIVE_STATS } from '../rival/crystalHive';
import { addHiveShield, createCrystalUnit } from '../rival/crystalFactories';
import {
  MINERAL_NODE_AMOUNT,
  ROLE_STATS,
  BEETLE_STATS,
  BEETLE_DEN_STATS,
  CRICKET_STATS,
  CRICKET_DEN_STATS,
  ANT_SPEED,
  QUEEN_MAX_HEALTH,
  QUEEN_MAX_HUNGER,
  QUEEN_HUNGER_DECAY,
  MAX_EGGS_PER_TYPE,
  EGG_FOOD_REQUIRED,
} from '../../shared/constants';
import { antSpawnStats } from '../run/antStats';

function stampOwner(world: World, entity: EntityId, faction: FactionId): void {
  world.addComponent<OwnerComponent>(entity, COMPONENT.OWNER, { faction });
}

export function createAnt(
  world: World,
  x: number,
  y: number,
  role: AntRole = AntRole.Worker,
  faction: FactionId = FactionId.PLAYER
): EntityId {
  const entity = world.createEntity();
  const stats = ROLE_STATS[role];

  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, {
    x, y, prevX: x, prevY: y,
  });

  world.addComponent<AntComponent>(entity, COMPONENT.ANT, {
    role,
    state: AntState.Idle,
    stateTimer: 0,
    commandTargetId: null,
  });

  // Queen upgrades and run mutations apply at birth (and retroactively, see GameManager)
  const spawn = antSpawnStats(world, role);

  world.addComponent<HungerComponent>(entity, COMPONENT.HUNGER, {
    current: spawn.maxHunger,
    max: spawn.maxHunger,
    decayRate: stats.hungerDecay,
  });

  world.addComponent<CarryingComponent>(entity, COMPONENT.CARRYING, {
    resourceType: null,
    amount: 0,
    maxCapacity: spawn.carryCapacity,
  });

  world.addComponent<HealthComponent>(entity, COMPONENT.HEALTH, {
    current: spawn.maxHealth,
    max: spawn.maxHealth,
    damage: spawn.damage,
  });

  world.addComponent<PathComponent>(entity, COMPONENT.PATH, {
    waypoints: [],
    currentIndex: 0,
  });

  // Colors and sizes stay role-based (visual only)
  const colors: Record<AntRole, string> = {
    [AntRole.Worker]: '#e8c170',
    [AntRole.Soldier]: '#d44',
    [AntRole.Scout]: '#4ad',
    [AntRole.Nurse]: '#a7e84d',
    [AntRole.Defender]: '#8a5fc8',
  };
  const sizes: Record<AntRole, number> = {
    [AntRole.Worker]: 0.35,
    [AntRole.Soldier]: 0.45,
    [AntRole.Scout]: 0.3,
    [AntRole.Nurse]: 0.32,
    [AntRole.Defender]: 0.48,
  };

  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, {
    color: colors[role],
    radius: sizes[role],
    shape: 'ant',
  });

  world.addComponent<FacingComponent>(entity, COMPONENT.FACING, {
    angle: Math.random() * Math.PI * 2,
    legPhase: 0,
  });

  world.addComponent<SelectableComponent>(entity, COMPONENT.SELECTABLE, {
    selected: false,
  });

  // ALL roles get RoleStatsComponent (not just scouts anymore)
  world.addComponent<RoleStatsComponent>(entity, COMPONENT.ROLE_STATS, {
    visionRange: stats.visionRange,
    speedMultiplier: stats.speedMultiplier,
    carrySpeedPenalty: stats.carrySpeedPenalty,
  });

  world.addComponent<LayerComponent>(entity, COMPONENT.LAYER, { layer: Layer.Surface });
  stampOwner(world, entity, faction);

  return entity;
}

export function createFood(
  world: World,
  x: number,
  y: number,
  amount: number = 100,
  resourceType: FoodType = FoodType.Leaf,
  layer: LayerValue = Layer.Surface
): EntityId {
  const entity = world.createEntity();

  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, {
    x, y, prevX: x, prevY: y,
  });

  world.addComponent<FoodSourceComponent>(entity, COMPONENT.FOOD_SOURCE, {
    resourceType,
    amount,
    maxAmount: amount,
  });

  const foodColors: Record<FoodType, string> = {
    [FoodType.Leaf]: '#4a2',
    [FoodType.Mushroom]: '#a06830',
    [FoodType.BeetleMeat]: '#7a5230',
    [FoodType.CricketMeat]: '#6e6a30',
    [FoodType.GiantMushroom]: '#8b4513',
  };
  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, {
    color: foodColors[resourceType],
    radius: resourceType === FoodType.GiantMushroom ? 0.8 : 0.35,
    shape: resourceType === FoodType.GiantMushroom ? 'giant_mushroom' : 'food',
  });

  world.addComponent<SelectableComponent>(entity, COMPONENT.SELECTABLE, {
    selected: false,
  });

  world.addComponent<LayerComponent>(entity, COMPONENT.LAYER, { layer });

  return entity;
}

/** A crystal mineral node on the surface: workers mine it, nothing eats it (P7.1). */
export function createMineral(world: World, x: number, y: number, amount: number = MINERAL_NODE_AMOUNT): EntityId {
  const entity = world.createEntity();
  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, { x, y, prevX: x, prevY: y });
  world.addComponent<MineralComponent>(entity, COMPONENT.MINERAL, { amount, maxAmount: amount });
  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, { color: '#2fa3b8', radius: 0.4, shape: 'mineral' });
  world.addComponent<LayerComponent>(entity, COMPONENT.LAYER, { layer: Layer.Surface });
  // Selectable: a click shows its card (ore left, workers mining it)
  world.addComponent<SelectableComponent>(entity, COMPONENT.SELECTABLE, { selected: false });
  return entity;
}

export function createNest(
  world: World,
  x: number,
  y: number,
  faction: FactionId = FactionId.PLAYER
): EntityId {
  const entity = world.createEntity();

  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, {
    x, y, prevX: x, prevY: y,
  });

  world.addComponent<NestComponent>(entity, COMPONENT.NEST, {
    foodStored: 50,
    mushroomStored: 0,
    meatStored: 0,
    antCount: 0,
  });

  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, {
    color: '#a65b28',
    radius: 1.2,
    shape: 'nest',
  });

  world.addComponent<SelectableComponent>(entity, COMPONENT.SELECTABLE, {
    selected: false,
  });

  world.addComponent<QueenComponent>(entity, COMPONENT.QUEEN, {
    breedTimer: 0,
    breedCooldown: 0,
    isBreeding: false,
    breedRole: AntRole.Worker,
  });

  world.addComponent<LayerComponent>(entity, COMPONENT.LAYER, { layer: Layer.Surface });
  stampOwner(world, entity, faction);

  return entity;
}

export function createBeetle(
  world: World,
  x: number,
  y: number,
  denEntityId: EntityId | null = null
): EntityId {
  const entity = world.createEntity();

  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, {
    x,
    y,
    prevX: x,
    prevY: y,
  });

  world.addComponent<BeetleComponent>(entity, COMPONENT.BEETLE, {
    state: BeetleState.Roaming,
    stateTimer: 0,
    targetEntityId: null,
    denEntityId,
  });

  world.addComponent<HealthComponent>(entity, COMPONENT.HEALTH, {
    current: BEETLE_STATS.health,
    max: BEETLE_STATS.health,
    damage: BEETLE_STATS.damage,
  });

  world.addComponent<CombatComponent>(entity, COMPONENT.COMBAT, {
    attackDamage: BEETLE_STATS.damage,
    attackRange: BEETLE_STATS.attackRange,
    attackCooldown: BEETLE_STATS.attackCooldown,
    attackTimer: 0,
    targetEntityId: null,
  });

  world.addComponent<PathComponent>(entity, COMPONENT.PATH, {
    waypoints: [],
    currentIndex: 0,
  });

  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, {
    color: '#2a1a0a',
    radius: BEETLE_STATS.size,
    shape: 'beetle',
  });

  world.addComponent<FacingComponent>(entity, COMPONENT.FACING, {
    angle: Math.random() * Math.PI * 2,
    legPhase: 0,
  });

  world.addComponent<RoleStatsComponent>(entity, COMPONENT.ROLE_STATS, {
    visionRange: BEETLE_STATS.visionRange,
    speedMultiplier: BEETLE_STATS.speed / ANT_SPEED,
    carrySpeedPenalty: 1.0,
  });

  world.addComponent<SelectableComponent>(entity, COMPONENT.SELECTABLE, {
    selected: false,
  });

  world.addComponent<LayerComponent>(entity, COMPONENT.LAYER, { layer: Layer.Surface });
  stampOwner(world, entity, FactionId.WILDLIFE);

  return entity;
}

export function createCricket(
  world: World,
  x: number,
  y: number,
  denEntityId: EntityId | null = null
): EntityId {
  const entity = world.createEntity();

  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, {
    x, y, prevX: x, prevY: y,
  });

  world.addComponent<CricketComponent>(entity, COMPONENT.CRICKET, {
    state: CricketState.GoingToNest,
    stateTimer: 0,
    targetEntityId: null,
    denEntityId,
    stolenFood: 0,
    previousState: CricketState.GoingToNest,
  });

  world.addComponent<HealthComponent>(entity, COMPONENT.HEALTH, {
    current: CRICKET_STATS.health,
    max: CRICKET_STATS.health,
    damage: CRICKET_STATS.damage,
  });

  world.addComponent<CombatComponent>(entity, COMPONENT.COMBAT, {
    attackDamage: CRICKET_STATS.damage,
    attackRange: CRICKET_STATS.attackRange,
    attackCooldown: CRICKET_STATS.attackCooldown,
    attackTimer: 0,
    targetEntityId: null,
  });

  world.addComponent<PathComponent>(entity, COMPONENT.PATH, {
    waypoints: [],
    currentIndex: 0,
  });

  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, {
    color: '#3a5a20',
    radius: CRICKET_STATS.size,
    shape: 'cricket',
  });

  world.addComponent<FacingComponent>(entity, COMPONENT.FACING, {
    angle: Math.random() * Math.PI * 2,
    legPhase: 0,
  });

  world.addComponent<RoleStatsComponent>(entity, COMPONENT.ROLE_STATS, {
    visionRange: CRICKET_STATS.visionRange,
    speedMultiplier: CRICKET_STATS.speed / ANT_SPEED,
    carrySpeedPenalty: 1.0,
  });

  world.addComponent<SelectableComponent>(entity, COMPONENT.SELECTABLE, {
    selected: false,
  });

  world.addComponent<LayerComponent>(entity, COMPONENT.LAYER, { layer: Layer.Surface });
  stampOwner(world, entity, FactionId.WILDLIFE);

  return entity;
}

export function createCricketDen(
  world: World,
  x: number,
  y: number
): EntityId {
  const entity = world.createEntity();

  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, {
    x, y, prevX: x, prevY: y,
  });

  world.addComponent<CricketDenComponent>(entity, COMPONENT.CRICKET_DEN, {
    health: CRICKET_DEN_STATS.health,
    maxHealth: CRICKET_DEN_STATS.health,
    spawnTimer: CRICKET_DEN_STATS.spawnCooldown * 0.5,
    spawnCooldown: CRICKET_DEN_STATS.spawnCooldown,
    maxCrickets: CRICKET_DEN_STATS.maxCrickets,
    activeCrickets: 0,
  });

  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, {
    color: '#2a4a10',
    radius: CRICKET_DEN_STATS.size,
    shape: 'cricket_den',
  });

  world.addComponent<SelectableComponent>(entity, COMPONENT.SELECTABLE, {
    selected: false,
  });

  world.addComponent<HealthComponent>(entity, COMPONENT.HEALTH, {
    current: CRICKET_DEN_STATS.health,
    max: CRICKET_DEN_STATS.health,
    damage: 0,
  });

  world.addComponent<LayerComponent>(entity, COMPONENT.LAYER, { layer: Layer.Surface });
  stampOwner(world, entity, FactionId.WILDLIFE);

  return entity;
}

export function createQueen(world: World, x: number, y: number, faction: FactionId = FactionId.PLAYER): EntityId {
  const entity = world.createEntity();
  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, { x, y, prevX: x, prevY: y });
  world.addComponent<LayerComponent>(entity, COMPONENT.LAYER, { layer: Layer.Underground });
  world.addComponent<HealthComponent>(entity, COMPONENT.HEALTH, { current: QUEEN_MAX_HEALTH, max: QUEEN_MAX_HEALTH, damage: 0 });
  world.addComponent<QueenEntityComponent>(entity, COMPONENT.QUEEN_ENTITY, {
    hunger: QUEEN_MAX_HUNGER,
    maxHunger: QUEEN_MAX_HUNGER,
    hungerDecay: QUEEN_HUNGER_DECAY,
  });
  world.addComponent<EggQueueComponent>(entity, COMPONENT.EGG_QUEUE, {
    queue: [],
    maxPerType: MAX_EGGS_PER_TYPE,
    currentlyLaying: false,
  });
  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, { color: '#ffd700', radius: 0.7, shape: 'queen' });
  world.addComponent<SelectableComponent>(entity, COMPONENT.SELECTABLE, { selected: false });
  // The queen can RELOCATE (player sends her to a designated throne area) —
  // she walks via the normal MovementSystem, slowly: she's heavy with eggs
  world.addComponent<PathComponent>(entity, COMPONENT.PATH, { waypoints: [], currentIndex: 0 });
  world.addComponent<FacingComponent>(entity, COMPONENT.FACING, { angle: 0, legPhase: 0 });
  world.addComponent<RoleStatsComponent>(entity, COMPONENT.ROLE_STATS, {
    visionRange: 4,
    speedMultiplier: 0.35,
    carrySpeedPenalty: 1,
  });
  stampOwner(world, entity, faction);
  return entity;
}

export function createEgg(
  world: World,
  x: number,
  y: number,
  role: AntRole,
  hatchTime: number,
  faction: FactionId = FactionId.PLAYER
): EntityId {
  const entity = world.createEntity();
  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, { x, y, prevX: x, prevY: y });
  world.addComponent<LayerComponent>(entity, COMPONENT.LAYER, { layer: Layer.Underground });
  world.addComponent<EggComponent>(entity, COMPONENT.EGG, {
    role,
    hatchTimer: hatchTime,
    hatchTime,
    fedAmount: 0, // nurses must feed the larva (from the pantry) before it can hatch
    requiredFood: EGG_FOOD_REQUIRED,
  });
  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, { color: '#fffff0', radius: 0.25, shape: 'circle' });
  stampOwner(world, entity, faction);
  return entity;
}

export function createBeetleDen(
  world: World,
  x: number,
  y: number
): EntityId {
  const entity = world.createEntity();

  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, {
    x,
    y,
    prevX: x,
    prevY: y,
  });

  world.addComponent<BeetleDenComponent>(entity, COMPONENT.BEETLE_DEN, {
    health: BEETLE_DEN_STATS.health,
    maxHealth: BEETLE_DEN_STATS.health,
    spawnTimer: BEETLE_DEN_STATS.spawnCooldown * 0.5,
    spawnCooldown: BEETLE_DEN_STATS.spawnCooldown,
    maxBeetles: BEETLE_DEN_STATS.maxBeetles,
    activeBeetles: 0,
  });

  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, {
    color: '#1a0a00',
    radius: BEETLE_DEN_STATS.size,
    shape: 'beetle_den',
  });

  world.addComponent<SelectableComponent>(entity, COMPONENT.SELECTABLE, {
    selected: false,
  });

  world.addComponent<HealthComponent>(entity, COMPONENT.HEALTH, {
    current: BEETLE_DEN_STATS.health,
    max: BEETLE_DEN_STATS.health,
    damage: 0,
  });

  world.addComponent<LayerComponent>(entity, COMPONENT.LAYER, { layer: Layer.Surface });
  stampOwner(world, entity, FactionId.WILDLIFE);

  return entity;
}

/**
 * The Crystal Hive's base: a cluster of crystal spires at the crater. It has
 * health, so the player can attack and destroy it (that wins the run).
 */
export function createCrystalHive(
  world: World,
  x: number,
  y: number,
  faction: FactionId = FactionId.RIVAL
): EntityId {
  const entity = world.createEntity();
  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, { x, y, prevX: x, prevY: y });
  world.addComponent<CrystalHiveComponent>(entity, COMPONENT.CRYSTAL_HIVE, {
    productionTimer: CRYSTAL_HIVE_STATS.productionInterval,
    lastWaveNight: 0,
  });
  world.addComponent<HealthComponent>(entity, COMPONENT.HEALTH, {
    current: CRYSTAL_HIVE_STATS.health,
    max: CRYSTAL_HIVE_STATS.health,
    damage: 0,
  });
  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, {
    color: '#5ff3ff',
    radius: CRYSTAL_HIVE_STATS.size,
    shape: 'crystal_hive',
  });
  world.addComponent<SelectableComponent>(entity, COMPONENT.SELECTABLE, { selected: false });
  world.addComponent<LayerComponent>(entity, COMPONENT.LAYER, { layer: Layer.Surface });
  stampOwner(world, entity, faction);
  addHiveShield(world, entity);
  return entity;
}

/** A Crystal drone: the tier-1 Crystal unit, a slow, heavy, shielded melee hitter. */
export function createCrystalDrone(
  world: World,
  x: number,
  y: number,
  hiveId: EntityId | null = null,
  faction: FactionId = FactionId.RIVAL
): EntityId {
  return createCrystalUnit(world, 'drone', x, y, hiveId, faction);
}
