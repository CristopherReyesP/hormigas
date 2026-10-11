import { RunModifiers } from './run/RunModifiers';
import type { MutationId } from './run/MutationDefinitions';
import { retrofitAntStats } from './run/antStats';
import { UpgradeSystem } from './upgrades/UpgradeSystem';
import { applyQueenUpgrades, retimeQueuedEggs, syncWorldUpgrades } from './upgrades/applyUpgrades';
import { affordableCount, purchase, type UpgradeFunds, type UpgradePayer } from './upgrades/purchase';
import { breedCost, eggsPerIncubationTile, pantryTileBonus, queenLayTime, queenTier } from './upgrades/upgradeEffects';
import { normalizeUpgradeLevels, type UpgradeLevels } from './upgrades/upgradeLevels';
import { UPGRADE_GROUP_LABEL, upgradeDef, type UpgradeId } from './upgrades/upgradeTable';
import { antStatLines, upgradeInfos, type AntStatLine, type UpgradeInfo } from './upgrades/upgradeView';
import { buildColonyStats, type ColonyStatsReport } from './upgrades/colonyStats';
import { emitUpgradeAudio } from './upgrades/upgradeAudio';
import { buildMutationOffer, shouldOfferMutation, summarizeMutationBuild, type MutationBuildEntry, type MutationOffer } from './run/DawnPick';
import { createSeededRng, offerMutations } from './run/MutationOffers';
import { createStatefulLcg, SimRandom } from './save/rng';
import { pickCraterSite, type TilePos } from './run/craterSite';
import { pickMineralFields } from './run/mineralFields';
import { CRYSTAL_BOWL_RADIUS, CRYSTAL_SHARD_RADIUS } from '../engine/renderer/alienDecor';
import type { EntityId } from '../shared/types';
import { World } from '../engine/ecs/World';
import { GameLoop } from '../engine/loop/GameLoop';
import { CanvasRenderer } from '../engine/renderer/CanvasRenderer';
import { InputManager, type InputModifiers, type KeyPress, type PaintPhase, type ScreenBox, type TouchDragMode } from '../engine/input/InputManager';
import { Camera, type ViewportRect } from '../engine/camera/Camera';
import { isTileVisible, type VisibilityReader } from '../engine/renderer/fogVisibility';
import { TileGrid } from '../simulation/world/TileGrid';
import { VisibilityGrid } from '../simulation/world/VisibilityGrid';
import { UndergroundGrid, type PantryFoodType } from '../simulation/world/UndergroundGrid';
import { TerrainType, ChamberType, UndergroundTerrainType } from '../simulation/world/types';
import { RenderSystem, type OrderPing } from './systems/RenderSystem';
import { MovementSystem } from './systems/MovementSystem';
import { PheromoneSystem } from './systems/PheromoneSystem';
import { AntAISystem } from './systems/AntAISystem';
import { BeetleAISystem } from './systems/BeetleAISystem';
import { CricketAISystem } from './systems/CricketAISystem';
import { CombatSystem } from './systems/CombatSystem';
import { BeetleSpawnSystem } from './systems/BeetleSpawnSystem';
import { CricketSpawnSystem } from './systems/CricketSpawnSystem';
import { HungerSystem } from './systems/HungerSystem';
import { RegenerationSystem } from './systems/RegenerationSystem';
import { CreepSystem } from './systems/CreepSystem';
import { CreepGrid } from '../simulation/world/CreepGrid';
import { BreedingSystem } from './systems/BreedingSystem';
import { SelectionSystem, type SelectionBox } from './systems/SelectionSystem';
import { ControlGroups } from './systems/ControlGroups';
import {
  dispatchDenAttack,
  findEnemyAt,
  findStructureAt,
  hasActiveOrder,
  isFreeSoldier,
  isPlayerUnit,
  issueAttackOrders,
  issueHoldOrders,
  issueMoveOrders,
  soundRetreatHorn,
  stopAnts,
} from './systems/helpers/playerOrders';
import {
  findResourceAt,
  foodOrderNoun,
  issueGatherOrders,
  issueMineOrders,
  isFoodSource,
  isMineralNode,
  minersOn,
  workersNoun,
  workersOrderedTo,
} from './systems/helpers/resourceOrders';
import type { MinerStatus } from './economy/minerAllocation';
import {
  HUMAN_QUICK_SELECT_KINDS,
  CRYSTAL_QUICK_SELECT_KINDS,
  QUICK_SELECT_KINDS,
  quickSelectIds,
  quickSelectInfo,
  sameMembers,
  type QuickSelectInfo,
  type QuickSelectKind,
} from './systems/helpers/quickSelect';
import { touchPickRadiusTiles } from './systems/helpers/touchPick';
import { countCrystalKinds, countHumanTypes, countRoles, feedbackTargetOf, type CommandFeedback, type OrderFeedbackKind } from './commandFeedback';
import { FoodRespawnSystem } from './systems/FoodRespawnSystem';
import { FogOfWarSystem } from './systems/FogOfWarSystem';
import { EggIncubationSystem } from './systems/EggIncubationSystem';
import { NurseAISystem } from './systems/NurseAISystem';
import { TransitSystem } from './systems/TransitSystem';
import { ExcavationSystem } from './systems/ExcavationSystem';
import { PorterSystem } from './systems/PorterSystem';
import { ObjectiveSystem, type ObjectiveState } from './systems/ObjectiveSystem';
import { UndergroundInvasionSystem, type InvasionInfo, type WaveThreat } from './systems/UndergroundInvasionSystem';
import { SpoilageSystem } from './systems/SpoilageSystem';
import { FungusFarmSystem } from './systems/FungusFarmSystem';
import { farmGrowthProgress, farmTileStatusLabel, isFarmTileReady } from './render/fungusGrowth';
import { UndergroundHealingSystem } from './systems/UndergroundHealingSystem';
import { resolveRunOutcome, type RunOutcome } from './run/RunOutcome';
import { CoreDamageLedger, coreKindOf, type DeathCause } from './run/deathCause';
import { nightMilestone } from './run/nightMilestones';
import { loadBestNight, recordNight } from './run/nightRecord';
import { DayNightSystem } from './systems/DayNightSystem';
import { DefenderAISystem } from './systems/DefenderAISystem';
import { IntroDirector } from './render/IntroDirector';
import { IntroClock, introRivalLine, introVariantFor, isPlayerArrival } from './render/introTimeline';
import { playerLaunchTile, type IntroArrival } from './render/introArrival';
import { audioIntroFrame, audioRunEnded, audioRunStarted, emitAudio } from '../audio';
import { selectionAudio } from '../audio/gameHooks';
import { createAnt, createFood, createMineral, createNest, createBeetleDen, createQueen, createCrystalHive } from './entities/factories';
import { CrystalHiveSystem } from './systems/CrystalHiveSystem';
import { CrystalUnitAISystem } from './systems/CrystalUnitAISystem';
import { CrystalRivalSystem, type CrystalRivalSnapshot } from './systems/CrystalRivalSystem';
import type { ShieldComponent } from './rival/crystalShield';
import { CrystalShieldSystem } from './systems/CrystalShieldSystem';
import { DefenseSystem } from './systems/DefenseSystem';
import { EliteSystem } from './systems/EliteSystem';
import { WaveBossSystem } from './systems/WaveBossSystem';
import { DEFENSE_STATS, type DefenseKind, type DefenseLayer } from './run/defenses';
import type { WaveOverlay } from './render/waveFunArt';
import type { DigOverlay } from './render/digOverlayArt';
import { buildDigClassMap, digJobCap, digLimitMessage, digStatus, previewDigTile, type DigStatus, type DigTileClass } from './dig/digStatus';
import { DEFAULT_RUN_SETUP, type RaceId, type RivalId, type RunSetup } from './run/RunSetup';
import { CrystalPlayerController, type CrystalPlayerSnapshot } from './races/crystal/CrystalPlayerController';
import { HumanBaseSystem } from './systems/HumanBaseSystem';
import { HumanUnitAISystem } from './systems/HumanUnitAISystem';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent } from './rival/humanComponents';
import { createHumanBase } from './rival/humanFactories';
import type { HumanUnitType } from './rival/humanBase';
import { humanSelection, type HumanSelection } from './rival/humanInfo';
import { pickHumanBaseSite } from './rival/humanSite';
import { FactionId, FactionRegistry, defaultFactions, isHostileTo, ownerOf } from './factions/factions';
import type { TutorialStage } from './tutorial/stage';
import { NestAlertTracker, type NestAlertState, type NestSample } from './run/nestAlert';
import { HUMAN_GROUP_ROLE, HumanPlayerRun, type HumanPlayerStats } from './races/human/HumanPlayerRun';
import { drawHumanPlayerOverlay } from './races/human/humanOverlay';
import type { WaveDirector } from './races/human/HumanWaveSystem';
import { createDefaultModifiers } from './events/GlobalModifiers';
import { EventSystem } from './events/EventSystem';
import {
  AntRole,
  AntState,
  ColonyPriority,
  FoodType,
  Layer,
  OrderKind,
  COMPONENT,
  isOreLoad,
  type NestComponent,
  type QueenComponent,
  type QueenEntityComponent,
  type EggComponent,
  type AntComponent,
  type PositionComponent,
  type LayerComponent,
  type HungerComponent,
  type CarryingComponent,
  type FoodSourceComponent,
  type MineralComponent,
  type HealthComponent,
  type BeetleComponent,
  type BeetleDenComponent,
  type CricketComponent,
  type CricketDenComponent,
  type EggQueueComponent,
  type PathComponent,
  type CrystalUnitComponent,
  type CrystalSpireComponent,
  type CrystalUnitKind,
  type CrystalUnitState,
  type CrystalStructureKind,
  type LayerValue,
} from './components/components';
import {
  INITIAL_ANTS,
  QUEEN_STARVATION_DAMAGE,
  INITIAL_FOOD_CLUSTERS,
  FOOD_PER_CLUSTER_MIN,
  FOOD_PER_CLUSTER_MAX,
  FOOD_AMOUNT_MIN,
  FOOD_AMOUNT_MAX,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TILE_SIZE,
  BREED_TIME_WORKER,
  BREED_TIME_SOLDIER,
  BREED_TIME_SCOUT,
  MUSHROOM_SPAWN_CHANCE,
  MUSHROOM_CLUSTER_MIN,
  MUSHROOM_CLUSTER_MAX,
  MUSHROOM_AMOUNT_MIN,
  MUSHROOM_AMOUNT_MAX,
  MUSHROOM_MIN_NEST_DISTANCE,
  INITIAL_BEETLE_DENS,
  BEETLE_DEN_MIN_NEST_DISTANCE,
  GIANT_MUSHROOM_AMOUNT_MIN,
  GIANT_MUSHROOM_AMOUNT_MAX,
  GIANT_MUSHROOM_SPAWN_DISTANCE_MIN,
  GIANT_MUSHROOM_SPAWN_DISTANCE_MAX,
  UNDERGROUND_WIDTH,
  UNDERGROUND_HEIGHT,
  QUEEN_MIN_HUNGER_TO_LAY,
  CRATER_CLEAR_RADIUS,
  CRATER_EDGE_MARGIN,
  CRATER_FAR_FRACTION,
  MINERAL_EXTRA_FIELDS,
  MINERAL_NODES_PER_FIELD,
  MINERAL_FIELD_RADIUS,
  MINERAL_MIN_NEST_DISTANCE,
  MINERAL_HOME_FIELD_MAX_DISTANCE,
  MINERAL_FIELD_SPACING,
  MINERAL_EDGE_MARGIN,
  CONTROL_GROUP_SLOTS,
  GAME_SPEED_MAX,
} from '../shared/constants';

/** Mixed into the run seed so the crater does not share the dawn offers' draws. */
const CRATER_SEED_SALT = 0x9e3779b9;
/** Tiles of known ground around the home mineral field, past its nodes */
const HOME_FIELD_REVEAL_MARGIN = 2;
/** Mixed into the run seed so the simulation's Math.random draws from its own stream. */
const SIM_RANDOM_SALT = 0x27d4eb2f;
/** Mixed into the run seed so the mineral fields draw from their own stream. */
const MINERAL_SEED_SALT = 0x85ebca6b;
/** Mixed into the run seed so the Human base site draws from its own stream. */
const HUMAN_SITE_SALT = 0xc2b2ae35;
/** The Human base keeps this far from the crater (tiles) */
const HUMAN_SITE_CRATER_DISTANCE = 30;
/** Tiles around the Human command center that must be walkable */
const HUMAN_SITE_CLEAR_RADIUS = 4;

/** A command card order that waits for a click: Mover (Q), Atacar (A), Recolectar or Minar. */
export type CommandTarget = 'move' | 'attack' | 'gather' | 'mine';

export interface SelectedEntityInfo {
  entityId: EntityId;
  type: 'ant' | 'food' | 'mineral' | 'nest' | 'beetle' | 'beetle_den' | 'cricket' | 'cricket_den' | 'crystal_hive' | 'crystal_unit' | 'crystal_spire'
    | 'human_unit' | 'human_building';
  position: { x: number; y: number };
  // Ant-specific
  role?: AntRole;
  state?: AntState;
  health?: { current: number; max: number };
  hunger?: { current: number; max: number };
  carrying?: { type: string | null; amount: number };
  /** Stats with their bonus over the caste base, from Mejoras and mutations ("Daño 10 (+2)") */
  antStats?: AntStatLine[];
  // Food-specific
  foodAmount?: number;
  foodType?: string;
  /** What the source held when it appeared */
  foodMax?: number;
  // Mineral node: ore left of its total
  mineralAmount?: number;
  mineralMax?: number;
  /** Food source or mineral node: workers gathering or mining it now */
  workers?: number;
  // Nest-specific: foodStored is the entrance pile, pantry* the underground stock
  foodStored?: number;
  pantryStored?: number;
  pantryCapacity?: number;
  mushroomStored?: number;
  meatStored?: number;
  totalAnts?: number;
  // Beetle-specific
  beetleState?: string;
  beetleHealth?: { current: number; max: number };
  // Beetle den-specific
  denHealth?: { current: number; max: number };
  denActiveBeetles?: number;
  denMaxBeetles?: number;
  // Cricket-specific
  cricketState?: string;
  cricketHealth?: { current: number; max: number };
  // Cricket den-specific
  cricketDenHealth?: { current: number; max: number };
  cricketDenActiveCrickets?: number;
  // Crystal Hive-specific
  hiveHealth?: { current: number; max: number };
  /** Crystal units, spires and the hive: the regenerating shield over the health */
  shield?: { current: number; max: number };
  crystalKind?: CrystalUnitKind;
  crystalState?: CrystalUnitState;
  spireKind?: CrystalStructureKind;
  spireFloors?: number;
  /** The hive: minerals banked, spires standing, units at home */
  rival?: CrystalRivalSnapshot;
  // Human unit or building: its whole card
  human?: HumanSelection;
  /** The player owns it (a Crystal player's Hive, spires and units) */
  owned?: boolean;
}

/** Several own ants selected: what the StarCraft-style group panel shows. */
export interface SelectedGroupInfo {
  count: number;
  /** Selected ants per caste */
  byRole: Partial<Record<AntRole, number>>;
  /** Ants with a player order still running */
  ordered: number;
  /** The first GROUP_GRID_MAX ants, castes in breed order: the wireframe grid */
  units: Array<{ id: EntityId; role: AntRole; health: number; ordered: boolean }>;
}

/** A bound control group, for the chips above the info panel. */
export interface ControlGroupInfo {
  /** Digit it is bound to (1-9) */
  slot: number;
  /** Ants in it still alive */
  count: number;
  /** The caste most of it belongs to (fighters win ties): the chip's icon */
  role: AntRole;
  /** It is exactly the current selection */
  selected: boolean;
}

/** Wireframe cells the group panel shows (StarCraft shows 24 too). */
const GROUP_GRID_MAX = 24;
/** Pantry share that counts as "plenty" for the idle-queen hint */
const IDLE_QUEEN_PANTRY_RATIO = 0.75;
/** Seconds of plenty with no egg ordered before the idle-queen hint */
const IDLE_QUEEN_HINT_SECONDS = 25;
/** Extra seconds before the idle-queen hint repeats */
const IDLE_QUEEN_REPEAT_SECONDS = 60;

/** A build tool a finger stroke paints with */
type PaintTool = 'dig' | 'incubation' | 'farm' | 'storage' | 'throne' | 'defense';
/** The zone each tool marks; dig marks earth for digging, not a zone */
const ZONE_OF_TOOL: Record<PaintTool, ChamberType | null> = {
  dig: null,
  incubation: ChamberType.Incubation,
  farm: ChamberType.FungusFarm,
  storage: ChamberType.FoodStorage,
  throne: ChamberType.Queen,
  defense: ChamberType.Defense,
};
/** How long a dig stroke's green/red preview stays after the finger lifts */
const DIG_PREVIEW_MS = 1200;
const NO_MODIFIERS: InputModifiers = { shift: false, ctrl: false };
const GROUP_ROLE_ORDER: readonly AntRole[] = [AntRole.Soldier, AntRole.Defender, AntRole.Worker, AntRole.Scout, AntRole.Nurse];

export interface GameNotification {
  id: number;
  severity: 'info' | 'success' | 'warning' | 'danger';
  message: string;
  createdAt: number;
}

export type { UpgradeId } from './upgrades/upgradeTable';
export type { UpgradeInfo } from './upgrades/upgradeView';

export interface GameOverStats {
  outcome: RunOutcome;
  survivedTicks: number;
  antsHatched: number;
  densDestroyed: number;
  tilesExcavated: number;
  wavesRepelled: number;
  build: MutationBuildEntry[];
  /** Set when the run was won by destroying the Crystal Hive */
  hiveDestroyed?: true;
  /** Set when the run was won by destroying the rival's core: whose it was */
  rivalCoreDestroyed?: 'crystal' | 'human';
  /** The race the player played, when it is not the Swarm (the end screen speaks for it) */
  playerRace?: RaceId;
  /** A defeat: what took the core (the queen, the command center, the Hive) down */
  cause?: DeathCause;
  /** A defeat: the day and the phase it happened in ("Noche 4") */
  diedOn?: { day: number; phase: 'day' | 'night' };
  /** A Crystal player's run: units crystallized and structures raised */
  crystal?: { unitsMade: number; structuresBuilt: number };
  /** Nights the colony lived through (the night on now does not count) */
  nightsSurvived: number;
  /** The local record, this run included */
  bestNight: number;
  /** This run beat the record the browser had when it started */
  newRecord: boolean;
}

/** A night milestone of the endless run, while its banner is up */
export interface MilestoneInfo {
  night: number;
  title: string;
  /** What it paid */
  minerals: number;
  food: number;
  /** What the food share is called: the Swarm's pantry food, or a Human expedition's rations */
  foodUnit: 'comida' | 'raciones';
}

/** Game seconds the milestone banner stays up */
const MILESTONE_BANNER_SECONDS = 8;

/** One dot on the underground minimap */
export interface MinimapEntity {
  /** Tile coordinates (fractional — ants move between tiles) */
  x: number;
  y: number;
  kind: AntRole | 'queen' | 'invader';
}

/** One marker on the surface minimap (tile coordinates) */
export interface SurfaceMinimapDot {
  x: number;
  y: number;
  kind: 'ant' | 'enemy' | 'den' | 'food' | 'nest';
}

/** The defense build tool's preview under the pointer (or the last tapped tile) */
export interface PlacementGhost {
  kind: DefenseKind;
  layer: DefenseLayer;
  x: number;
  y: number;
  valid: boolean;
  /** Why it cannot go there (Spanish), when invalid */
  reason?: string;
  cost: number;
  /** Espina: its reach, for the range circle */
  range: number;
}

export interface GameStats {
  /** The defense being placed (Espina, Trampa, Muro), or null */
  defenseBuild?: DefenseKind | null;
  antCount: number;
  workerCount: number;
  soldierCount: number;
  scoutCount: number;
  nurseCount: number;
  defenderCount: number;
  /**
   * Food in the pantry (pantry and farm piles): what pays for eggs. The type
   * totals split it; leaves are the remainder. Food at the entrance or in the
   * ants' jaws is not counted here, it is `foodInTransit`.
   */
  foodStored: number;
  mushroomStored: number;
  meatStored: number;
  pantryStored: number;
  pantryCapacity: number;
  /** Food on the pile at the nest entrance, still waiting for porters to carry it to the pantry */
  entranceFoodStored: number;
  /** Food on its way to the pantry: the entrance pile plus what workers, soldiers and scouts carry */
  foodInTransit: number;
  /** No pantry tile can take the food on its way (or any food at all): more Almacén tiles are needed */
  pantryFull: boolean;
  /** Workers below ground holding a load the full pantry cannot take yet ("N obreras esperando") */
  antsWaitingForPantry: number;
  /** The minerals bank: what miners delivered, the currency for structures */
  mineralsStored: number;
  /** Workers on the mineral fields and the colony's miner target (Mineras: N) */
  miners?: { count: number; target: number; auto: boolean; ordered: number };
  /** Mejoras lines the colony can pay now: the glowing badge on the Mejoras button */
  upgradesAffordable?: number;
  beetleCount: number;
  beetleDenCount: number;
  cricketCount: number;
  cricketDenCount: number;
  tickCount: number;
  paused: boolean;
  speed: number;
  zoom: number;
  colonyPriority: ColonyPriority;
  availableSoldiers: number;
  activeLayer: 'surface' | 'underground';
  breeding: {
    isBreeding: boolean;
    progress: number; // 0-1
    role: AntRole | null;
  };
  selectedEntity: SelectedEntityInfo | null;
  /** Two or more own ants selected (selectedEntity is null then) */
  selectedGroup?: SelectedGroupInfo | null;
  /** A command card order waiting for its target click: Mover or Atacar was pressed */
  commandTarget?: CommandTarget | null;
  /** Seleccionar área (touch) is on: the next finger drag draws a selection box */
  areaSelect?: boolean;
  /** The dig queue below (counter, crew, estimate); null on the surface */
  dig?: DigStatus | null;
  /** Bound control groups, by digit */
  controlGroups?: ControlGroupInfo[];
  /** The phone quick-select bar: ants per caste on the layer in view, and the chip that is the selection */
  quickSelect?: QuickSelectInfo[];
  notifications: GameNotification[];
  objective: ObjectiveState | null;
  invasion: InvasionInfo;
  /** Invaders inside the nest: the view tabs' badges, the alert banner and the "Nido despejado" toast */
  nestAlert?: NestAlertState;
  gameOver: GameOverStats | null;
  /** The night milestone just reached (endless run), while its banner is up */
  milestone?: MilestoneInfo | null;
  activeEvents: Array<{ icon: string; name: string; remaining: number }>;
  dayPhase: 'day' | 'night';
  dayNumber: number;
  phaseRemaining: number; // seconds left in the current phase
  /** Pending dawn pick; the simulation stays paused while it is set. */
  mutationOffer: MutationOffer | null;
  /** The card the player has selected in the pending offer; only confirming it applies it. */
  mutationSelection: MutationId | null;
  lastMutationPick: MutationId | null;
  /** True while the opening cinematic plays: the HUD stays hidden and the world takes the whole window. */
  introPlaying: boolean;
  /** The Crystal Hive's side of the HUD when the player plays it; absent for the Swarm */
  crystal?: CrystalPlayerSnapshot | null;
  /** A Human player's base: resources, supply, placement, the selected building's queue (null for the Swarm) */
  human?: HumanPlayerStats | null;
}

/**
 * Everything the brood readout needs to explain the breeding pipeline:
 * pantry (pays the egg) → the queen lays → nurses carry it to incubation → it hatches.
 */
export interface BroodSnapshot {
  /** Underground food on pantry and farm piles: the only stock that pays for eggs. `tiles` counts pantry tiles. */
  pantry: { stored: number; capacity: number; tiles: number };
  /** Food piled at the surface entrance, waiting for porters to carry it down (it spoils up there) */
  surfaceStock: number;
  hasQueen: boolean;
  /** False while the queen is too hungry to lay */
  queenCanLay: boolean;
  /** Ordered eggs the queen has not laid yet, in laying order; `progress` is the laying progress */
  queue: Array<{ role: AntRole; progress: number }>;
  maxQueuedPerRole: number;
  /** Laid eggs. `remaining` is incubation time left (it only runs on an incubation tile). */
  eggs: Array<{ role: AntRole; progress: number; fedProgress: number; remaining: number; incubating: boolean }>;
  /** Walkable incubation tiles and how many more eggs they can take */
  incubation: { tiles: number; freeSlots: number };
  /** Nurses below ground: only they carry eggs to incubation and feed larvae and the queen */
  nurses: number;
  /** Workers alive. With none, a worker egg may be paid with the entrance pile (see queueBreed). */
  workers?: number;
  costs: Record<AntRole, number>;
}

/** An invader this close (tiles) to the queen or an egg is biting it */
const NEST_BITE_RADIUS = 2;
/** Seconds of game time between two looks at the nest */
const NEST_SAMPLE_SECONDS = 0.2;

export class GameManager {
  private readonly runModifiers = new RunModifiers();
  /** Chosen once per run; every dawn offer of the run is drawn from it. */
  private readonly runSeed = Math.floor(Math.random() * 0x100000000);
  private readonly offerRng = createStatefulLcg(this.runSeed);
  /** The simulation's seeded Math.random while the World ticks (saved, so a loaded run continues identically) */
  private readonly simRandom = new SimRandom(this.runSeed ^ SIM_RANDOM_SALT);
  /** Called after every simulation tick with its dt (the autosave listens here) */
  private readonly tickListeners = new Set<(dt: number) => void>();
  private mutationOffer: MutationOffer | null = null;
  private mutationSelection: MutationId | null = null;
  private lastMutationPick: MutationId | null = null;
  /**
   * Where the opening meteorite struck: a reachable clearing on the far side
   * of the map, fixed for the whole run. The crater decal sits here, the
   * minimap marks it, and the Crystal Hive rises from it (P5).
   */
  private readonly craterSite: TilePos;
  /** The rival's core (the Crystal Hive, or the Human command center); destroying it is a victory (the run may go on) */
  private rivalCoreId: EntityId | null = null;
  /** The player's race and the rival picked before the run */
  private readonly runSetup: RunSetup;
  /** Who fights the player besides the wildlife: no base for 'wildlife' */
  private readonly rivalRace: RivalId;
  /** The full Crystal Hive rival (only when the rival is the Colmena de Cristal) */
  private crystalRival: CrystalRivalSystem | null = null;
  /** The player's own Crystal Hive (only when the player plays the Colmena de Cristal) */
  private crystal: CrystalPlayerController | null = null;
  /** Canvas the intro-skip pointer listener is attached to */
  private readonly canvas: HTMLCanvasElement;
  /**
   * The opening cinematic's one clock. It is advanced here once per rendered
   * frame; the IntroDirector (camera) and the MeteorIntro (art) only read it.
   */
  private readonly introClock = new IntroClock();
  /** Camera work for the opening cinematic; it owns the surface camera until the intro ends */
  private readonly introDirector: IntroDirector;
  private world: World;
  private grid: TileGrid;
  private visibilityGrid: VisibilityGrid;
  private gameLoop: GameLoop;
  private renderer: CanvasRenderer;
  private input: InputManager;
  private camera: Camera;
  private renderSystem: RenderSystem;
  private antAISystem: AntAISystem;
  private selectionSystem: SelectionSystem;
  private eventSystem: EventSystem;
  private statsCallback: ((stats: GameStats) => void) | null = null;
  private statsTicks = 0; // throttle stats updates
  private undergroundGrid: UndergroundGrid;
  private undergroundCamera: Camera;
  private activeLayer: 'surface' | 'underground' = 'surface';
  private excavationSystem: ExcavationSystem;
  private objectiveSystem!: ObjectiveSystem;
  private invasionSystem!: UndergroundInvasionSystem;
  /** Watches the nest for invaders and raises the alerts the player must not miss on the surface */
  private readonly nestAlert = new NestAlertTracker();
  /** What is taking the core's health away (hunger, which enemies), for the end screen */
  private coreLedger: CoreDamageLedger | null = null;
  private nestAlertClock = 0;
  /** Seconds the pantry has been plentiful with no egg ordered */
  private idleQueenSeconds = 0;
  /** The tutorial holds the calm: no wave, no defenses firing, no nest alarm */
  private tutorialCalm = false;
  /** A Humans run (setup.playerRace 'human'): the player's base, its systems and its clicks; null for the Swarm */
  private humanPlayer: HumanPlayerRun | null = null;
  private gameOver: GameOverStats | null = null;
  /** The milestone banner up now and the game seconds it has left */
  private milestone: { info: MilestoneInfo; remaining: number } | null = null;
  /** The local record when this run started, to tell a new record */
  private runStartBest = loadBestNight();
  private fungusFarmSystem!: FungusFarmSystem;
  private dayNightSystem!: DayNightSystem;
  private farmMode = false;
  private throneMode = false;
  private defenseMode = false;
  private digMode = false;
  private incubationMode = false;
  private storageMode = false;
  private viewportConfigured = false;
  private transitSystem: TransitSystem;
  /** Seleccionar área is on: the next finger drag draws a selection box instead of panning */
  private areaSelect = false;
  /** The finger stroke a build tool is painting, if any */
  private paintStroke: { tool: PaintTool; erase: boolean; visited: Set<number>; last: { x: number; y: number } } | null = null;
  /** Dig overlay class map, rebuilt only when the nest layout changes */
  private digClassCache: { version: number; map: Uint8Array } | null = null;
  /** Tiles the last dig stroke or click tried to mark: green taken, red over the limit */
  private digPreview: Array<{ x: number; y: number; state: 'ok' | 'over'; at: number }> = [];
  /** The tile under the mouse while the dig tool is on (desktop) */
  private digHover: { x: number; y: number } | null = null;
  /** When the limit refusal was last announced (one message per burst, not per tile) */
  private digLimitNotifiedAt = Number.NEGATIVE_INFINITY;
  /** Mover or Atacar was pressed: the next left click on the surface is that order's target */
  private armedCommand: CommandTarget | null = null;
  /** Order pings for the renderer (tile coords), drained every frame */
  private orderPings: OrderPing[] = [];
  /** Ctrl+digit groups of own ants */
  private readonly controlGroups = new ControlGroups();
  /** A finger tap is being handled: its orders get the big phone marker and count as touch feedback */
  private touchInput = false;
  /** HUD listeners for order and long-press feedback (toast, haptics, burst) */
  private readonly feedbackListeners = new Set<(event: CommandFeedback) => void>();
  /** Nest defenses: placement and the turrets, traps and walls themselves */
  private defenseSystem!: DefenseSystem;
  /** The defense the build tool places, or null */
  private defenseBuild: DefenseKind | null = null;
  /** Where the build tool's ghost sits (canvas px of the pointer, or a tapped tile) */
  private ghostTile: { layer: DefenseLayer; x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement, setup: RunSetup = DEFAULT_RUN_SETUP) {
    this.canvas = canvas;
    this.runSetup = setup;
    // One setup path: the picked rival decides which base (if any) the run gets.
    // Fauna salvaje: wildlife only, no rival faction and no base.
    this.rivalRace = setup.rivalRace;
    const rivalBase = this.rivalRace === 'crystal' || this.rivalRace === 'human' ? this.rivalRace : null;
    this.world = new World(this.runModifiers, new FactionRegistry([
      ...defaultFactions().map((f) => (f.id === FactionId.PLAYER ? { ...f, race: setup.playerRace } : f)),
      ...(rivalBase ? [{ id: FactionId.RIVAL, race: rivalBase, controller: 'ai' as const }] : []),
    ]));
    this.grid = new TileGrid();
    this.visibilityGrid = new VisibilityGrid(WORLD_WIDTH, WORLD_HEIGHT);
    this.renderer = new CanvasRenderer(canvas);
    this.camera = new Camera();
    this.input = new InputManager(canvas, {
      onSelectBox: (box, mods) => this.selectInScreenBox(box, mods),
      onCommand: (screenX, screenY) => this.commandAt(screenX, screenY),
      onTap: (screenX, screenY) => this.handleTap(screenX, screenY),
      onLongPress: (screenX, screenY) => this.handleLongPress(screenX, screenY),
      onPaint: (screenX, screenY, phase) => this.paintAt(screenX, screenY, phase),
      touchDragMode: () => this.touchDragMode(),
      onHover: (screenX, screenY) => {
        this.crystal?.setHover(this.screenToTile(screenX, screenY));
        this.humanPlayer?.hover(this.screenToEntity(screenX, screenY));
        this.digHover = this.digMode && this.activeLayer === 'underground' ? this.undergroundCamera.screenToTile(screenX, screenY) : null;
      },
    });
    this.input.setCamera(this.camera);

    // Underground layer
    this.undergroundGrid = new UndergroundGrid();
    this.undergroundCamera = new Camera(UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT);

    // Create global modifiers (shared by reference across all systems)
    const modifiers = createDefaultModifiers();

    // Create systems
    this.renderSystem = new RenderSystem(this.world, this.renderer, this.grid, this.visibilityGrid, {
      getDragBox: () => this.getDragBox(),
      drainOrderPings: () => this.drainOrderPings(),
      crystalOverlay: () => this.crystal?.overlay(this.selectionSystem.getSelectedEntityId()) ?? null,
    });
    this.renderSystem.setCamera(this.camera);
    this.renderSystem.setUndergroundContext(
      this.undergroundGrid,
      this.undergroundCamera,
      () => this.activeLayer
    );
    this.eventSystem = new EventSystem(this.world, this.grid, modifiers);
    const movementSystem = new MovementSystem(this.world, this.grid, modifiers, this.undergroundGrid);
    const pheromoneSystem = new PheromoneSystem(this.grid, modifiers);
    this.antAISystem = new AntAISystem(this.world, this.grid, this.visibilityGrid, modifiers);
    const beetleAISystem = new BeetleAISystem(this.world, this.grid, modifiers);
    const cricketAISystem = new CricketAISystem(this.world, this.grid, this.undergroundGrid, modifiers);
    const combatSystem = new CombatSystem(this.world, this.grid);
    const beetleSpawnSystem = new BeetleSpawnSystem(this.world, this.grid, modifiers);
    const cricketSpawnSystem = new CricketSpawnSystem(this.world, this.grid, this.undergroundGrid, modifiers);
    this.dayNightSystem = new DayNightSystem(this.world, modifiers);
    const hungerSystem = new HungerSystem(this.world, modifiers);
    const regenerationSystem = new RegenerationSystem(this.world);
    const upgradeSystem = new UpgradeSystem(this.world);
    const breedingSystem = new BreedingSystem(this.world);
    this.selectionSystem = new SelectionSystem(this.world);
    if (setup.playerRace === 'human') {
      this.humanPlayer = new HumanPlayerRun(this.world, this.grid, this.dayNightSystem, this.selectionSystem);
      const human = this.humanPlayer;
      this.renderSystem.setWorldOverlay?.((ctx, interpolation, time) => drawHumanPlayerOverlay(ctx, this.world, human, interpolation, time));
    }
    const foodRespawnSystem = new FoodRespawnSystem(this.world, this.grid, modifiers);

    // Register systems (render system is called manually during render, not during update)
    this.world.addSystem(this.eventSystem);
    this.world.addSystem(this.dayNightSystem);
    this.renderSystem.setDayPhaseProvider(() => ({
      phase: this.dayNightSystem.getPhase(),
      progress: this.dayNightSystem.getPhaseProgress(),
    }));
    this.world.addSystem(this.antAISystem);
    this.world.addSystem(beetleAISystem);
    this.world.addSystem(cricketAISystem);
    this.world.addSystem(combatSystem);
    this.world.addSystem(beetleSpawnSystem);
    this.world.addSystem(cricketSpawnSystem);
    this.world.addSystem(movementSystem);
    this.world.addSystem(pheromoneSystem);
    this.world.addSystem(hungerSystem);
    this.world.addSystem(regenerationSystem);
    if (setup.playerRace !== 'human' && setup.playerRace !== 'crystal') {
      // The Swarm's mycelium creep: spreads from the nest, speeds and heals the colony on it
      const creep = new CreepGrid(this.grid.width, this.grid.height);
      this.world.addSystem(new CreepSystem(this.world, this.grid, creep));
      movementSystem.setCreep(creep);
      this.renderSystem.setCreep(creep);
    }
    this.world.addSystem(upgradeSystem);
    this.world.addSystem(breedingSystem);
    const transitSystem = new TransitSystem(this.world, this.undergroundGrid);
    this.transitSystem = transitSystem;
    this.world.addSystem(transitSystem);
    // Healing ants descend to the pantry when the surface stockpile is dry
    this.antAISystem.setUndergroundAccess(this.undergroundGrid, transitSystem);
    this.world.addSystem(new UndergroundHealingSystem(this.world, this.undergroundGrid, transitSystem));
    this.world.addSystem(new DefenderAISystem(this.world, this.undergroundGrid));
    const eggIncubationSystem = new EggIncubationSystem(this.world, transitSystem, this.undergroundGrid);
    this.world.addSystem(eggIncubationSystem);
    const nurseAISystem = new NurseAISystem(this.world, this.undergroundGrid);
    this.world.addSystem(nurseAISystem);
    this.excavationSystem = new ExcavationSystem(this.world, this.undergroundGrid, transitSystem);
    this.excavationSystem.setJobCap(() => this.getDigCap());
    this.world.addSystem(this.excavationSystem);
    this.world.addSystem(this.selectionSystem);
    this.world.addSystem(foodRespawnSystem);
    const fogOfWarSystem = new FogOfWarSystem(this.world, this.visibilityGrid);
    this.world.addSystem(fogOfWarSystem);
    const porterSystem = new PorterSystem(this.world, this.undergroundGrid, this.grid, transitSystem);
    // Waiting haulers convert into diggers when there's excavation pending
    porterSystem.setDigJobsProvider(() => this.excavationSystem.getPendingJobCount());
    this.world.addSystem(porterSystem);
    this.objectiveSystem = new ObjectiveSystem(this.world, this.undergroundGrid);
    this.world.addSystem(this.objectiveSystem);
    // The night waves cross this surface from the map edge before they break into the nest
    this.invasionSystem = new UndergroundInvasionSystem(
      this.world,
      this.undergroundGrid,
      transitSystem,
      this.dayNightSystem,
      this.grid
    );
    if (setup.playerRace === 'crystal') {
      // The Crystal Hive has no cave: its night waves cross the surface to the Hive (the controller adds them)
      this.crystal = new CrystalPlayerController(this.world, this.grid, this.dayNightSystem, (x, y) => this.visibilityGrid.isExplored(x, y));
      if (this.rivalRace !== 'crystal') this.world.addSystem(new CrystalShieldSystem(this.world));
    } else {
      // A Human player has no nest to break into: their waves come over the surface
      this.world.addSystem(this.waves());
    }
    // Night-wave extras: elite affixes, the mini-bosses' abilities, the nest defenses
    this.world.addSystem(new EliteSystem(this.world));
    this.world.addSystem(new WaveBossSystem(this.world, { onSpawn: (id) => this.waves().addInvader(id) }));
    this.defenseSystem = new DefenseSystem(this.world, this.grid, this.undergroundGrid);
    this.world.addSystem(this.defenseSystem);
    // The rival base's night raids are part of each invasion wave, not waves of their own
    if (this.rivalRace === 'human') {
      const humanBaseSystem = new HumanBaseSystem(this.world, this.grid, this.dayNightSystem, { autoRaids: false, faction: FactionId.RIVAL });
      this.world.addSystem(humanBaseSystem);
      this.waves().setRaidSource({
        rival: 'human',
        unitLabel: (count) => (count === 1 ? 'tropa humana' : 'tropas humanas'),
        launch: (count) => humanBaseSystem.launchRaid(count),
        origin: () => humanBaseSystem.raidOrigin(),
      });
      this.world.addSystem(new HumanUnitAISystem(this.world, this.grid));
    } else if (this.rivalRace === 'crystal') {
      this.addCrystalRival();
    }
    // Waves land at nightfall, so the dusk warning doubles as the last call
    this.dayNightSystem.setWaveArmedProvider(() => this.waves().getInfo().armed);
    this.world.addSystem(new SpoilageSystem(this.world));
    this.fungusFarmSystem = new FungusFarmSystem(this.world, this.undergroundGrid);
    this.world.addSystem(this.fungusFarmSystem);
    // Farm tiles pulse while producing — render needs to know the farm state
    this.renderSystem.setFarmStatusProvider(() => this.fungusFarmSystem.getStatus().status);
    // A Humans run swaps the colony systems for the Human base's
    this.humanPlayer?.install();
    // Anything that takes mushrooms off a farm tile plays the pluck; a tapped farm shows its growth bars
    this.undergroundGrid.setFarmTakeListener((x, y) => this.renderSystem.queueFarmHarvest(x, y));
    this.renderSystem.setFarmFocusProvider(() => this.farmFocus);
    // The defense build ghost and the scouted breach, drawn in the world
    this.renderSystem.setWaveOverlayProvider(() => this.waveOverlay());
    // The diggable area, queue order and stroke preview while Excavar is on
    this.renderSystem.setDigOverlayProvider(() => this.getDigOverlay());

    // Create game loop
    this.gameLoop = new GameLoop(
      (dt) => this.update(dt),
      (interpolation, dt) => this.render(interpolation, dt)
    );

    // Setup input
    this.input.onKeyAction('Space', () => this.togglePause());
    // Digits are control groups (the dawn pick borrows 1-3); + and - set game speed
    for (let slot = 1; slot <= CONTROL_GROUP_SLOTS; slot++) {
      this.input.onKeyAction(`Digit${slot}`, (press) => this.handleDigitKey(slot, press));
    }
    // '=' is the unshifted + key on US layouts; the numpad and other layouts print '+' and '-'
    for (const [key, step] of [['+', 1], ['=', 1], ['-', -1]] as const) {
      this.input.onKeyAction(key, (press) => {
        if (!press.repeat) this.stepSpeed(step);
      });
    }
    if (import.meta.env.DEV) {
      // Dev-only preview of the evolution chamber; stripped from production builds.
      // KeyE (evolution) because KeyM already toggles the underground minimap.
      this.input.onKeyAction('KeyE', () => {
        if (!this.gameOver && !this.mutationOffer) this.openMutationOffer();
      });
    }
    this.input.onKeyAction('Home', () => this.camera.reset());
    this.input.onKeyAction('KeyR', () => this.camera.reset());

    // Setup canvas click handler for selection (screen coords → tile coords via camera)
    this.input.onCanvasClick((screenX, screenY, mods) => this.handleClick(screenX, screenY, mods));

    // Initialize game world
    this.spawnInitialEntities();

    // Pre-reveal nest area as explored
    const nestX = Math.floor(WORLD_WIDTH / 2);
    const nestY = Math.floor(WORLD_HEIGHT / 2);
    this.visibilityGrid.revealArea(nestX, nestY, 10); // slightly larger than nestClearRadius (8)

    // Re-render terrain after nest area + corridors were cleared
    this.renderSystem.invalidateTerrain();

    // Center camera on nest
    const nestPixelX = Math.floor(WORLD_WIDTH / 2) * TILE_SIZE;
    const nestPixelY = Math.floor(WORLD_HEIGHT / 2) * TILE_SIZE;
    this.camera.centerOn(nestPixelX, nestPixelY);

    // The run opens with the meteorite: purely visual, the simulation runs on
    this.craterSite = pickCraterSite({
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      nest: { x: nestX, y: nestY },
      isWalkable: (x, y) => this.grid.isWalkable(x, y),
      rng: createSeededRng(this.runSeed ^ CRATER_SEED_SALT),
      clearRadius: CRATER_CLEAR_RADIUS,
      edgeMargin: CRATER_EDGE_MARGIN,
      farFraction: CRATER_FAR_FRACTION,
    });
    // The Swarm's opening brings in the rival picked before the run; a Crystal
    // or Human player's brings in their own base at home (see introArrival.ts)
    const introVariant = introVariantFor(this.rivalRace, setup.playerRace);
    let rivalSite: TilePos | null = null;
    let arrival: IntroArrival = { variant: introVariant, target: { ...this.craterSite }, rivalLine: introRivalLine(this.rivalRace) };
    if (this.rivalRace === 'human') {
      // The Humans camp on another far clearing, away from the crater: the
      // crater's shard field stays between the two bases
      const site = pickHumanBaseSite({
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
        nest: { x: nestX, y: nestY },
        isWalkable: (x, y) => this.grid.isWalkable(x, y),
        rng: createSeededRng(this.runSeed ^ HUMAN_SITE_SALT),
        clearRadius: HUMAN_SITE_CLEAR_RADIUS,
        edgeMargin: CRATER_EDGE_MARGIN,
        farFraction: CRATER_FAR_FRACTION,
        avoid: this.craterSite,
        avoidDistance: HUMAN_SITE_CRATER_DISTANCE,
      });
      const base = createHumanBase(this.world, this.grid, site, { x: nestX, y: nestY });
      this.rivalCoreId = base.coreId;
      rivalSite = { x: site.x, y: site.y };
      // Their dropship lands on the command center and the real base unfolds there
      arrival = { ...arrival, target: { x: site.x, y: site.y }, base: this.introHumanBase(base.buildings, [...base.garrison, base.builderId]) };
    } else if (this.rivalRace === 'crystal') {
      // The Crystal Hive rises from the crater: the rival's base, and its core.
      // Against Fauna salvaje the crater stays bare.
      this.rivalCoreId = createCrystalHive(this.world, this.craterSite.x, this.craterSite.y);
      rivalSite = { ...this.craterSite };
    }
    const rival = this.world.factions.get(FactionId.RIVAL);
    if (rival && this.rivalCoreId !== null) rival.coreId = this.rivalCoreId;
    const home = { x: nestX, y: nestY };
    if (isPlayerArrival(introVariant)) {
      // A Crystal or Human player's own base arrives at home, coming in from the
      // far side of the map from the rival; the shot ends glancing at the rival
      arrival = {
        variant: introVariant,
        target: home,
        rivalLine: arrival.rivalLine,
        from: playerLaunchTile(home, rivalSite, { width: WORLD_WIDTH, height: WORLD_HEIGHT }),
        rival: this.rivalRace,
        rivalBase: rivalSite,
        ...(this.crystal ? { drones: this.playerCrystalDrones() } : { base: this.playerHumanBase() }),
      };
    }
    // The crater art goes where the meteor strikes: the crater, or (a Crystal player) home under the Hive
    this.renderSystem.startMeteorIntro(isPlayerArrival(introVariant) ? home : this.craterSite, home, this.introClock, arrival);
    this.spawnMineralFields({ x: nestX, y: nestY });
    const tileCenter = (tile: TilePos) => ({ x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 });
    // The fireball (or the dropship) lights the ground it flies over and its
    // target, so the chase crosses lit terrain; what it lit stays explored, a
    // scorched trail to the crater or the Human base
    this.introDirector = new IntroDirector(
      this.camera,
      this.introClock,
      tileCenter({ x: nestX, y: nestY }),
      tileCenter(arrival.target),
      (x, y, r) => this.visibilityGrid.revealCircle(x, y, r),
      introVariant,
      arrival.from ? { from: tileCenter(arrival.from), rival: rivalSite ? tileCenter(rivalSite) : null } : null,
    );
    window.addEventListener('keydown', this.skipIntro);
    canvas.addEventListener('pointerdown', this.skipIntro);
    audioRunStarted(() => ({ layer: this.activeLayerValue(), view: this.activeCamera().getViewRectTiles() }), introVariant);
  }

  /** A Crystal player's starting drones, where they stand (tiles): their opening flies them out there. */
  private playerCrystalDrones(): Array<{ x: number; y: number }> {
    return this.world.query(COMPONENT.CRYSTAL_UNIT, COMPONENT.POSITION)
      .filter((id) => ownerOf(this.world, id) === FactionId.PLAYER)
      .map((id) => {
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        return { x: pos.x, y: pos.y };
      });
  }

  /** A Human player's starting base as their opening raises it: the Command Center first, then the Cuartel; builders and soldiers. */
  private playerHumanBase(): NonNullable<IntroArrival['base']> {
    const mine = (id: EntityId) => ownerOf(this.world, id) === FactionId.PLAYER;
    const kindOf = (id: EntityId) => this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind;
    const buildings = this.world.query(HUMAN_COMPONENT.BUILDING, COMPONENT.POSITION).filter(mine)
      .sort((a, b) => Number(kindOf(b) === 'command_center') - Number(kindOf(a) === 'command_center') || a - b);
    return this.introHumanBase(buildings, this.world.query(HUMAN_COMPONENT.UNIT, COMPONENT.POSITION).filter(mine));
  }

  /** The Human base as the opening raises it: building kinds and tiles (command center first), troop posts. */
  private introHumanBase(buildings: readonly EntityId[], troops: readonly EntityId[]): NonNullable<IntroArrival['base']> {
    const tileOf = (id: EntityId) => {
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      return { x: Math.round(pos.x), y: Math.round(pos.y) };
    };
    return {
      buildings: buildings.map((id) => ({ kind: this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind, ...tileOf(id) })),
      troops: troops.map((id) => ({ ...tileOf(id), builder: this.world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)?.type === 'builder' })),
    };
  }

  /**
   * The Crystal Hive rival's systems: the core's drones and night waves, the
   * full rival (economy, build order, spires, raids, the Crystal Queen), unit
   * AI and shields. The hive's drones and the Queen join the invasion waves.
   */
  private addCrystalRival(): void {
    const crystalHiveSystem = new CrystalHiveSystem(this.world, this.grid, this.dayNightSystem, { autoRaids: false });
    this.world.addSystem(crystalHiveSystem);
    this.crystalRival = new CrystalRivalSystem(this.world, this.grid, this.dayNightSystem);
    this.world.addSystem(this.crystalRival);
    const rival = this.crystalRival;
    this.waves().setRaidSource({
      rival: 'crystal',
      launch: (count) => crystalHiveSystem.launchRaid(count),
      origin: () => crystalHiveSystem.raidOrigin(),
      launchBoss: () => rival.launchQueen(),
    });
    this.world.addSystem(new CrystalUnitAISystem(this.world, this.grid));
    this.world.addSystem(new CrystalShieldSystem(this.world));
  }

  /** The night waves of this run: under the nest for the Swarm, over the surface for the Humans and the Crystal Hive */
  private waves(): WaveDirector {
    return this.crystal?.waves ?? this.humanPlayer?.waves ?? this.invasionSystem;
  }

  /** The skirmish this run was started with */
  getRunSetup(): RunSetup {
    return this.runSetup;
  }

  /** The player's Crystal Hive, when the player plays it (null for the Swarm) */
  getCrystal(): CrystalPlayerController | null {
    return this.crystal;
  }

  /** Canvas px to a surface tile */
  private screenToTile(screenX: number, screenY: number): { x: number; y: number } {
    const at = this.screenToEntity(screenX, screenY);
    return { x: Math.round(at.x), y: Math.round(at.y) };
  }

  /** Crystal build mode: place the armed structure where the pointer is */
  private placeCrystalAt(tile: { x: number; y: number }): void {
    const result = this.crystal?.tryPlace(tile);
    if (!result) return;
    if (!result.ok) this.world.pushNotification('warning', result.reason, 'crystal-place', 1500);
    else this.orderPings.push({ x: tile.x, y: tile.y, kind: 'move' });
    this.publishStats();
  }

  /** The selected own spire rallies its new units to `tile`; false when no spire is selected */
  private setRallyAt(tile: { x: number; y: number }): boolean {
    const selected = this.selectionSystem.getSelectedEntityId();
    if (!this.crystal || selected === null || !this.crystal.isOwnProducer(selected)) return false;
    this.crystal.setRally(selected, tile);
    this.orderPings.push({ x: tile.x, y: tile.y, kind: 'move' });
    emitAudio({ type: 'order', kind: 'move' });
    this.publishStats();
    return true;
  }

  /**
   * Left click (or a finger tap that is not an order): build tools below,
   * the armed card order's target above, else select (a second click on the
   * selected nest goes down into it).
   */
  private handleClick(screenX: number, screenY: number, mods: InputModifiers): void {
    if (this.defenseBuild) {
      this.placeDefenseAtScreen(screenX, screenY);
      return;
    }
    if (this.activeLayer === 'underground') {
      const tile = this.undergroundCamera.screenToTile(screenX, screenY);
      if (this.digMode) {
        this.toggleDigAt(tile.x, tile.y);
      } else if (this.incubationMode) {
        this.designateIncubation(tile.x, tile.y);
      } else if (this.farmMode) {
        this.designateFarm(tile.x, tile.y);
      } else if (this.storageMode) {
        this.designateStorage(tile.x, tile.y);
      } else if (this.throneMode) {
        this.designateThrone(tile.x, tile.y);
      } else if (this.defenseMode) {
        this.designateDefense(tile.x, tile.y);
      } else {
        // Direct command: clicking a throne area (outside build modes) sends
        // the queen to THAT throne — with several thrones, the player picks.
        // Clicking the throne she already occupies falls through to selection.
        if (!this.sendQueenToThroneAt(tile.x, tile.y)) {
          this.clickSelect(screenX, screenY, mods);
          // A tap on bare farm ground (no ant there) shows that tile's growth
          if (this.selectionSystem.getSelectedEntityId() === null && this.selectionSystem.getSelectedAnts().length === 0) {
            this.focusFarmTile(tile.x, tile.y);
          } else {
            this.farmFocus = null;
          }
        }
      }
      return;
    }
    if (this.crystal?.getBuildMode()) {
      this.placeCrystalAt(this.screenToTile(screenX, screenY));
      return;
    }
    // A Human player placing a building: this click puts it down
    if (this.humanPlayer?.clickAt(this.screenToEntity(screenX, screenY), false)) {
      this.publishStats();
      return;
    }
    if (this.armedCommand) {
      // Mover, Atacar, Recolectar or Minar was pressed: this click is the order's target
      if (this.armedCommand === 'attack') this.attackAt(screenX, screenY);
      else if (this.armedCommand === 'gather' || this.armedCommand === 'mine') this.resourceOrderAt(screenX, screenY, this.armedCommand);
      else this.commandAt(screenX, screenY);
      return;
    }
    // A click on the already-selected nest goes down into it
    const tile = this.camera.screenToTile(screenX, screenY);
    if (!mods.shift && !mods.ctrl && this.tapsSelectedNest(tile)) {
      this.enterUnderground();
      return;
    }
    this.clickSelect(screenX, screenY, mods);
  }

  /**
   * A finger tap. With own ants selected on the surface it is the right-click
   * order: an enemy or a base under the finger is attacked, another own ant
   * is picked instead, anything else is a move. Otherwise it is a left click
   * (select, an armed order's target, or a build tool below).
   */
  private handleTap(screenX: number, screenY: number): void {
    this.touchInput = true;
    try {
      this.tapAt(screenX, screenY);
    } finally {
      this.touchInput = false;
    }
  }

  private tapAt(screenX: number, screenY: number): void {
    if (this.crystal?.getBuildMode()) {
      this.placeCrystalAt(this.screenToTile(screenX, screenY));
      return;
    }
    if (this.crystal && this.selectionSystem.getSelectedAnts().length === 0 && this.tapsOpenGround(screenX, screenY)) {
      // A spire selected: a tap on open ground is its rally point
      if (this.setRallyAt(this.screenToTile(screenX, screenY))) return;
    }
    if (this.defenseBuild) {
      // Touch: the first tap shows the ghost there, a second tap on the same tile builds
      const tile = this.screenToBuildTile(screenX, screenY);
      const ghost = this.ghostTile;
      if (ghost && ghost.layer === tile.layer && ghost.x === tile.x && ghost.y === tile.y) this.placeDefenseAtScreen(screenX, screenY);
      else this.ghostTile = tile;
      return;
    }
    if (this.humanPlayer && !this.gameOver && !this.armedCommand) {
      // Placing a building (first tap shows it, a second one places it), or a rally point
      const at = this.screenToEntity(screenX, screenY);
      const hits = this.selectionSystem.antAt(at.x, at.y, Layer.Surface) !== null || this.enemyAt(at) !== null;
      if (this.humanPlayer.tapAt(at, hits)) {
        this.publishStats();
        return;
      }
    }
    if (this.activeLayer === 'surface' && !this.armedCommand && !this.gameOver && this.selectionSystem.getSelectedAnts().length > 0) {
      const at = this.screenToEntity(screenX, screenY);
      // A tap on another own unit, or on an own structure (a Crystal player's spire), picks it instead of ordering
      const ownBase = this.crystal ? findStructureAt(this.world, at) : null;
      const ownStructure = ownBase !== null && ownerOf(this.world, ownBase) === FactionId.PLAYER;
      if (this.enemyAt(at) === null && (ownStructure || this.selectionSystem.antAt(at.x, at.y, Layer.Surface) !== null)) {
        this.clickSelect(screenX, screenY, NO_MODIFIERS);
      } else {
        this.commandAt(screenX, screenY);
      }
      return;
    }
    if (this.fingerPick(screenX, screenY)) return;
    this.handleClick(screenX, screenY, NO_MODIFIERS);
  }

  /** Nothing selectable or hostile is drawn under the finger: a tap there is on bare ground */
  private tapsOpenGround(screenX: number, screenY: number): boolean {
    const at = this.screenToEntity(screenX, screenY);
    if (this.enemyAt(at) !== null) return false;
    for (const id of this.world.query(COMPONENT.SELECTABLE, COMPONENT.POSITION)) {
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      if (Math.hypot(pos.x - at.x, pos.y - at.y) <= 1.2) return false;
    }
    return true;
  }

  /**
   * A tap on the surface with no order to give: the own ant nearest the
   * finger, within a reach that is a fixed size on screen (so a small ant
   * on a zoomed-out map is still easy to hit). An enemy or a base under
   * the finger, food or the nest right under it, and a second tap on the
   * selected nest keep the click behavior. Returns true when it picked.
   */
  private fingerPick(screenX: number, screenY: number): boolean {
    if (this.activeLayer !== 'surface' || this.armedCommand || this.gameOver) return false;
    const at = this.screenToEntity(screenX, screenY);
    if (this.enemyAt(at) !== null || findStructureAt(this.world, at) !== null || this.tapsSelectedNest(at)) return false;
    const reach = touchPickRadiusTiles(this.camera.getZoom(), this.camera.getPixelRatio());
    const ant = this.selectionSystem.nearestOwnAnt(at.x, at.y, Layer.Surface, reach);
    if (ant === null) return false;
    const under = this.selectionSystem.directHitAt(at.x, at.y, Layer.Surface);
    if (under !== null && under !== ant && !this.world.getComponent(under, COMPONENT.ANT)) return false;
    this.selectionSystem.selectOnly(ant);
    this.armedCommand = null;
    emitAudio(selectionAudio(this.world, [ant]));
    this.publishStats();
    return true;
  }

  /** The nest is the selection and `at` (tile or entity space) is on it: the click or tap that goes down. */
  private tapsSelectedNest(at: { x: number; y: number }): boolean {
    const id = this.selectionSystem.getSelectedEntityId();
    if (id === null || !this.world.getComponent<NestComponent>(id, COMPONENT.NEST)) return false;
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
    if (!pos) return false;
    return Math.abs(Math.round(at.x) - Math.round(pos.x)) <= 2 && Math.abs(Math.round(at.y) - Math.round(pos.y)) <= 2;
  }

  /** A finger held on an own ant: it and every ant of its caste on screen (Ctrl+click); the HUD shows what it took. */
  private handleLongPress(screenX: number, screenY: number): void {
    if (this.gameOver) return;
    this.armedCommand = null;
    this.clickSelect(screenX, screenY, { shift: false, ctrl: true });
    const ants = this.selectionSystem.getSelectedAnts();
    if (ants.length === 0) return;
    const pixelRatio = this.activeCamera().getPixelRatio();
    const humanType = this.world.getComponent<HumanUnitComponent>(ants[0], HUMAN_COMPONENT.UNIT)?.type;
    const crystalKind = this.world.getComponent<CrystalUnitComponent>(ants[0], COMPONENT.CRYSTAL_UNIT)?.kind;
    const role = humanType ? HUMAN_GROUP_ROLE[humanType] : crystalKind ? AntRole.Soldier : this.world.getComponent<AntComponent>(ants[0], COMPONENT.ANT)?.role;
    if (role === undefined) return;
    this.emitFeedback({
      type: 'caste-select', x: screenX, y: screenY, pixelRatio, count: ants.length, role,
      ...(humanType ? { humanType } : {}),
      ...(crystalKind ? { crystalKind } : {}),
    });
  }

  /** Listen for order and long-press feedback; returns the unsubscribe. */
  onCommandFeedback(listener: (event: CommandFeedback) => void): () => void {
    this.feedbackListeners.add(listener);
    return () => {
      this.feedbackListeners.delete(listener);
    };
  }

  private emitFeedback(event: CommandFeedback): void {
    for (const listener of this.feedbackListeners) listener(event);
  }

  private emitOrderFeedback(order: OrderFeedbackKind, ids: readonly EntityId[], targetId: EntityId | null = null): void {
    this.emitFeedback({
      type: 'order',
      order,
      count: ids.length,
      byRole: countRoles(this.world, ids),
      byHuman: countHumanTypes(this.world, ids),
      byCrystal: countCrystalKinds(this.world, ids),
      target: targetId === null ? null : feedbackTargetOf(this.world, targetId),
      touch: this.touchInput,
    });
  }

  /** Where Volver al nido sends units: the nest, or a Human player's command center */
  private homePosition(): { x: number; y: number } | null {
    if (this.humanPlayer) return this.humanPlayer.corePosition();
    if (this.crystal) {
      const hive = this.crystal.system.hive();
      return hive === null ? null : this.world.getComponent<PositionComponent>(hive, COMPONENT.POSITION) ?? null;
    }
    const nest = this.world.query(COMPONENT.NEST, COMPONENT.POSITION)[0];
    return nest === undefined ? null : this.world.getComponent<PositionComponent>(nest, COMPONENT.POSITION) ?? null;
  }

  /** The order ping's phone extras: a finger order gets the big marker and lines from its units. */
  private pingExtras(ids: readonly EntityId[], big = this.touchInput): Pick<OrderPing, 'big' | 'units'> {
    return big ? { big: true, units: [...ids] } : {};
  }

  /**
   * The quick-select bar: every own ant of `kind` on the layer in view,
   * across the map. When they already are the selection (a second tap on
   * the chip) the camera centers on them instead. An empty caste changes
   * nothing.
   */
  quickSelect(kind: QuickSelectKind): { selected: number; centered: boolean; notice?: string } {
    if (this.gameOver) return { selected: 0, centered: false };
    const layer = this.activeLayerValue();
    const ids = quickSelectIds(this.world, kind, layer);
    if (ids.length === 0) {
      // A Human player's empty chip points at the building that trains that unit
      const notice = this.humanPlayer && kind.startsWith('human-') ? this.humanPlayer.emptyChip(kind.slice(6) as HumanUnitType) : null;
      if (!notice) return { selected: 0, centered: false };
      this.armedCommand = null;
      this.areaSelect = false;
      this.publishStats();
      return { selected: 0, centered: false, notice };
    }
    const again = sameMembers(ids, this.selectionSystem.getSelectedAnts());
    this.selectionSystem.selectAnts(ids, layer);
    this.armedCommand = null;
    this.areaSelect = false;
    if (again) this.centerOnAnts(ids);
    else emitAudio(selectionAudio(this.world, ids));
    this.publishStats();
    return { selected: ids.length, centered: again };
  }

  /**
   * Volver al nido (Volver a la base for a Human player): the selected surface
   * units walk back to the nest entrance, or the command center (a move order there).
   */
  returnSelectedToNest(): number {
    const ants = this.selectedAntsForOrder();
    const pos = this.homePosition();
    if (ants.length === 0 || pos === null) return 0;
    const result = issueMoveOrders(this.world, this.grid, ants, { x: Math.round(pos.x), y: Math.round(pos.y) }, this.transitSystem);
    if (!result) return 0;
    this.orderPings.push({ ...result.target, kind: 'move', ...this.pingExtras(result.ordered, true) });
    emitAudio({ type: 'order', kind: 'move' });
    this.emitOrderFeedback('rally', result.ordered);
    this.publishStats();
    return result.ordered.length;
  }

  /** What a one-finger drag does now: paint with a build tool on, a box while Seleccionar área is on, else pan. */
  private touchDragMode(): TouchDragMode {
    if (this.crystal?.getBuildMode()) return 'paint'; // drag the ghost, lift to place
    if (this.defenseBuild) return 'pan';
    if (this.activeLayer === 'underground' && this.activeBuildMode() !== null) return 'paint';
    if (this.areaSelect) return 'box';
    return 'pan';
  }

  private activeBuildMode(): PaintTool | null {
    if (this.digMode) return 'dig';
    if (this.incubationMode) return 'incubation';
    if (this.farmMode) return 'farm';
    if (this.storageMode) return 'storage';
    if (this.throneMode) return 'throne';
    if (this.defenseMode) return 'defense';
    return null;
  }

  /**
   * A finger stroke with a build tool on. Dig marks every earth tile the
   * finger crosses. A zone tool paints what the stroke starts on: from a
   * plain tile it adds the zone, from a zone tile it erases it, so going back
   * over a tile never flips it twice. Tiles between two reports are filled in.
   */
  private paintAt(screenX: number, screenY: number, phase: PaintPhase): void {
    if (this.crystal?.getBuildMode()) {
      const tile = this.screenToTile(screenX, screenY);
      if (phase === 'end') this.placeCrystalAt(tile);
      else this.crystal.setHover(tile);
      return;
    }
    const tool = this.activeBuildMode();
    if (this.activeLayer !== 'underground' || tool === null) {
      this.paintStroke = null;
      return;
    }
    const tile = this.undergroundCamera.screenToTile(screenX, screenY);
    if (phase === 'start' || !this.paintStroke || this.paintStroke.tool !== tool) {
      const zone = ZONE_OF_TOOL[tool];
      const startTile = this.undergroundGrid.getTile(tile.x, tile.y);
      if (tool === 'dig') this.digPreview = [];
      this.paintStroke = {
        tool,
        // A dig stroke that starts on a mark takes marks off, like a zone stroke
        erase: zone !== null ? startTile?.chamberType === zone : Boolean(startTile?.designated),
        visited: new Set(),
        last: tile,
      };
      this.paintTile(tile.x, tile.y);
    } else {
      // Walk from the last tile to this one so a quick finger leaves no gaps
      const { last } = this.paintStroke;
      const steps = Math.max(Math.abs(tile.x - last.x), Math.abs(tile.y - last.y));
      for (let i = 1; i <= steps; i++) {
        this.paintTile(Math.round(last.x + ((tile.x - last.x) * i) / steps), Math.round(last.y + ((tile.y - last.y) * i) / steps));
      }
      this.paintStroke.last = tile;
    }
    if (phase === 'end') this.paintStroke = null;
  }

  private paintTile(x: number, y: number): void {
    const stroke = this.paintStroke;
    if (!stroke) return;
    const key = y * UNDERGROUND_WIDTH + x;
    if (stroke.visited.has(key)) return;
    stroke.visited.add(key);
    if (stroke.tool === 'dig') {
      if (stroke.erase) this.cancelDig(x, y);
      else this.designateDig(x, y);
      return;
    }
    const tile = this.undergroundGrid.getTile(x, y);
    if (!tile) return;
    const isZone = tile.chamberType === ZONE_OF_TOOL[stroke.tool];
    if (isZone !== stroke.erase) return; // already what the stroke paints
    if (stroke.tool === 'incubation') this.designateIncubation(x, y);
    else if (stroke.tool === 'farm') this.designateFarm(x, y);
    else if (stroke.tool === 'storage') this.designateStorage(x, y);
    else if (stroke.tool === 'throne') this.designateThrone(x, y);
    else this.designateDefense(x, y);
  }

  /** The tile under a canvas point on the layer in view */
  private screenToBuildTile(screenX: number, screenY: number): { layer: DefenseLayer; x: number; y: number } {
    const tile = this.activeCamera().screenToTile(screenX, screenY);
    return { layer: this.activeLayer, x: tile.x, y: tile.y };
  }

  /** Arm (or with null, put away) the defense build tool: Espina, Trampa de resina or Muro de quitina */
  setDefenseBuild(kind: DefenseKind | null): void {
    if (kind === this.defenseBuild) return;
    this.defenseBuild = kind;
    this.ghostTile = null;
    if (kind) {
      this.armedCommand = null;
      this.areaSelect = false;
    }
    this.publishStats();
  }

  getDefenseBuild(): DefenseKind | null {
    return this.defenseBuild;
  }

  /** Move the ghost to the tile under a canvas point (the mouse hover) */
  private updateGhostAt(screenX: number, screenY: number): void {
    if (!this.defenseBuild) return;
    this.ghostTile = this.screenToBuildTile(screenX, screenY);
  }

  /** The build tool's preview: where, whether it may go there, its cost and range */
  getPlacementGhost(): PlacementGhost | null {
    const kind = this.defenseBuild;
    const at = this.ghostTile;
    if (!kind || !at || at.layer !== this.activeLayer) return null;
    const verdict = this.defenseSystem.check(kind, at.layer, at.x, at.y);
    const stats = DEFENSE_STATS[kind];
    return {
      kind,
      layer: at.layer,
      x: at.x,
      y: at.y,
      valid: verdict.ok,
      ...(verdict.ok ? {} : { reason: verdict.message }),
      cost: stats.cost,
      range: kind === 'spine' ? stats.range : kind === 'trap' ? stats.range : 0,
    };
  }

  /** Build the armed defense on a tile of a layer; a refusal is explained in the feed */
  placeDefense(kind: DefenseKind, layer: DefenseLayer, x: number, y: number): boolean {
    const result = this.defenseSystem.place(kind, layer, x, y);
    if (result.ok) {
      emitAudio({ type: 'ui', sound: 'command' });
      this.world.pushNotification('success', `🛡️ ${result.message}`);
    } else {
      emitAudio({ type: 'ui', sound: 'error' });
      this.world.pushNotification('warning', `${DEFENSE_STATS[kind].name}: ${result.message}`, 'defense-refused', 1200);
    }
    this.publishStats();
    return result.ok;
  }

  private placeDefenseAtScreen(screenX: number, screenY: number): void {
    const kind = this.defenseBuild;
    if (!kind || this.gameOver) return;
    const tile = this.screenToBuildTile(screenX, screenY);
    this.ghostTile = tile;
    this.placeDefense(kind, tile.layer, tile.x, tile.y);
  }

  /** What the renderer draws for the wave extras on the layer in view */
  private waveOverlay(): WaveOverlay {
    const info = this.invasionSystem.getInfo();
    const next = info.next ?? null;
    const nest = this.world.query(COMPONENT.NEST, COMPONENT.POSITION)[0];
    const nestPos = nest !== undefined ? this.world.getComponent<PositionComponent>(nest, COMPONENT.POSITION) : undefined;
    return {
      ghost: this.getPlacementGhost(),
      anchors: this.defenseBuild ? this.defenseSystem.buildAnchors(this.activeLayer) : [],
      nestAttack: this.activeLayer === 'surface' ? this.nestAlert.getState().nestInvaders : 0,
      scout: next && this.dayNightSystem.getPhase() === 'day'
        ? {
          breach: next.entrance ? { x: next.entrance.x, y: next.entrance.y } : null,
          origin: next.surface ? { x: next.surface.x, y: next.surface.y } : null,
          wildlife: next.wildlife ? { x: next.wildlife.x, y: next.wildlife.y } : null,
          hole: next.hole ? { x: next.hole.x, y: next.hole.y } : null,
          nest: nestPos ? { x: nestPos.x, y: nestPos.y } : { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) },
        }
        : null,
    };
  }

  /** Scouted marks for the minimap: the coming wave's breach (underground), or where it comes from and the hole it marches on (surface) */
  getScoutMarks(layer: 'surface' | 'underground'): Array<{ x: number; y: number }> {
    const next = this.invasionSystem.getInfo().next ?? null;
    if (!next) return [];
    if (layer === 'underground') return next.entrance ? [{ x: next.entrance.x + 0.5, y: next.entrance.y + 0.5 }] : [];
    const marks: Array<{ x: number; y: number }> = [];
    if (next.wildlife) marks.push({ x: next.wildlife.x, y: next.wildlife.y });
    if (next.surface) marks.push({ x: next.surface.x, y: next.surface.y });
    if (next.hole) marks.push({ x: next.hole.x, y: next.hole.y });
    return marks;
  }

  /** The tiles defenses may be built around on a layer: the nest, or the entrances (the breach) */
  getDefenseAnchors(layer: DefenseLayer): Array<{ x: number; y: number }> {
    return this.defenseSystem.buildAnchors(layer);
  }

  /** Seleccionar área (touch): the next finger drag on the ground draws a selection box. */
  setAreaSelect(enabled: boolean): void {
    this.areaSelect = enabled;
    this.publishStats();
  }

  isAreaSelect(): boolean {
    return this.areaSelect;
  }

  /** Back to the default zoom, centered on the nest of the layer in view (the on-screen R). */
  recenterCamera(): void {
    const camera = this.activeCamera();
    if (camera.isDirected()) return;
    camera.setZoom(camera.getDefaultZoom());
    if (this.activeLayer === 'underground') {
      camera.centerOn(Math.floor(UNDERGROUND_WIDTH / 2) * TILE_SIZE, Math.floor(UNDERGROUND_HEIGHT / 2) * TILE_SIZE);
    } else {
      camera.centerOn(Math.floor(WORLD_WIDTH / 2) * TILE_SIZE, Math.floor(WORLD_HEIGHT / 2) * TILE_SIZE);
    }
  }

  /** First key or click after the impact skips to the intro's end state (one-shot). */
  private readonly skipIntro = (): void => {
    if (!this.introClock.skip()) return; // refused until the meteor has landed
    this.renderSystem.skipIntro();
    this.introDirector.finish();
    this.detachIntroSkip();
    this.publishStats(); // the HUD fades in now, not at the next stats tick
  };

  private detachIntroSkip(): void {
    window.removeEventListener('keydown', this.skipIntro);
    this.canvas.removeEventListener('pointerdown', this.skipIntro);
  }

  /**
   * Mineral nodes for the run: the crater's crystal shards are the natural
   * field, plus a few seeded fields (one near home). Same seed, same fields.
   */
  private spawnMineralFields(nest: TilePos): void {
    const fields = pickMineralFields({
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      nest,
      isWalkable: (x, y) => this.grid.isWalkable(x, y),
      rng: createSeededRng(this.runSeed ^ MINERAL_SEED_SALT),
      crater: this.craterSite,
      craterRing: { inner: CRYSTAL_BOWL_RADIUS, outer: CRYSTAL_SHARD_RADIUS },
      extraFields: MINERAL_EXTRA_FIELDS,
      nodesPerField: MINERAL_NODES_PER_FIELD,
      fieldRadius: MINERAL_FIELD_RADIUS,
      minNestDistance: MINERAL_MIN_NEST_DISTANCE,
      homeFieldMaxDistance: MINERAL_HOME_FIELD_MAX_DISTANCE,
      minFieldSpacing: MINERAL_FIELD_SPACING,
      edgeMargin: MINERAL_EDGE_MARGIN,
    });
    for (const field of fields) {
      for (const node of field.nodes) createMineral(this.world, node.x, node.y);
    }
    // The colony knows its home field from the start: the seeded field nearest
    // the nest is on the map (explored), so the miners have somewhere to go
    // and the player sees where the crystal is. Fields farther out still have
    // to be found by scouts and foragers.
    const home = fields
      .filter((field) => !field.natural)
      .sort((a, b) => Math.hypot(a.center.x - nest.x, a.center.y - nest.y) - Math.hypot(b.center.x - nest.x, b.center.y - nest.y))[0];
    if (home) this.visibilityGrid.revealCircle(home.center.x, home.center.y, MINERAL_FIELD_RADIUS + HOME_FIELD_REVEAL_MARGIN);
  }

  /** The tutorial's handle on this run (src/game/tutorial): the world to stage its lessons on and the day clock to hold. */
  getTutorialStage(): TutorialStage {
    return {
      world: this.world,
      grid: this.grid,
      nest: { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) },
      reveal: (x, y, radius) => this.visibilityGrid.revealArea(x, y, radius),
      holdCalm: (held) => {
        this.tutorialCalm = held;
        this.dayNightSystem.setHeld(held);
        this.eventSystem.setHeld(held);
        this.invasionSystem.setHeld(held);
        this.defenseSystem.setHeld(held);
      },
    };
  }

  /** Tile where the meteorite struck (crater center); fixed for the whole run. */
  getCraterSite(): TilePos {
    return { x: this.craterSite.x, y: this.craterSite.y };
  }

  /** Food is only stored underground: the starting stock begins in the pantry, not on the entrance pile. */
  private stockStartingPantry(nestId: EntityId): void {
    const nest = this.world.getComponent<NestComponent>(nestId, COMPONENT.NEST);
    if (!nest) return;
    while (nest.foodStored > 0) {
      const tile = this.undergroundGrid.findDepositTile('leaf');
      if (!tile) break;
      const accepted = this.undergroundGrid.depositFood(tile.x, tile.y, 'leaf', nest.foodStored);
      if (accepted <= 0) break;
      nest.foodStored -= accepted;
    }
  }

  private spawnInitialEntities(): void {
    // Spawn nest at center
    const nestX = Math.floor(WORLD_WIDTH / 2);
    const nestY = Math.floor(WORLD_HEIGHT / 2);

    // Clear a large walkable circle around the nest (radius 8)
    const nestClearRadius = 8;
    for (let dy = -nestClearRadius; dy <= nestClearRadius; dy++) {
      for (let dx = -nestClearRadius; dx <= nestClearRadius; dx++) {
        if (dx * dx + dy * dy <= nestClearRadius * nestClearRadius) {
          const tx = nestX + dx;
          const ty = nestY + dy;
          const tile = this.grid.getTile(tx, ty);
          if (tile && !tile.walkable) {
            this.grid.setTile(tx, ty, { terrain: TerrainType.Dirt, walkable: true });
          }
        }
      }
    }

    // Clear walkable corridors from nest toward edges (ensures connectivity)
    this.clearCorridor(nestX, nestY, 1, 0);   // east
    this.clearCorridor(nestX, nestY, -1, 0);  // west
    this.clearCorridor(nestX, nestY, 0, 1);   // south
    this.clearCorridor(nestX, nestY, 0, -1);  // north

    if (this.crystal) {
      // The Crystal Hive: its core, two drones and minerals; no nest, queen or cave
      this.crystal.spawnBase(nestX, nestY);
    } else if (this.humanPlayer) {
      // The Human expedition: a command center, builders and soldiers; no nest, no queen
      this.humanPlayer.spawnStart({ x: nestX, y: nestY });
    } else {
      this.spawnColony(nestX, nestY);
    }

    this.spawnWildlifeAndFood(nestX, nestY);
  }

  /** Food, the giant mushroom and the beetle dens, away from the player's base at the center */
  private spawnWildlifeAndFood(nestX: number, nestY: number): void {
    // Spawn food clusters (force 2 mushroom clusters for early discoverability)
    for (let i = 0; i < INITIAL_FOOD_CLUSTERS; i++) {
      const forceMushroom = i < 2; // first 2 clusters are guaranteed mushrooms
      this.spawnFoodCluster(forceMushroom);
    }

    // Spawn 1 guaranteed giant mushroom near nest
    const gmAngle = Math.random() * Math.PI * 2;
    const gmDist = GIANT_MUSHROOM_SPAWN_DISTANCE_MIN + Math.random() * (GIANT_MUSHROOM_SPAWN_DISTANCE_MAX - GIANT_MUSHROOM_SPAWN_DISTANCE_MIN);
    const gmX = nestX + Math.round(Math.cos(gmAngle) * gmDist);
    const gmY = nestY + Math.round(Math.sin(gmAngle) * gmDist);
    if (this.grid.isWalkable(gmX, gmY)) {
      const gmAmount = GIANT_MUSHROOM_AMOUNT_MIN + Math.floor(Math.random() * (GIANT_MUSHROOM_AMOUNT_MAX - GIANT_MUSHROOM_AMOUNT_MIN + 1));
      createFood(this.world, gmX, gmY, gmAmount, FoodType.GiantMushroom);
    }

    // Spawn beetle dens
    for (let i = 0; i < INITIAL_BEETLE_DENS; i++) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const x = Math.floor(Math.random() * this.grid.width);
        const y = Math.floor(Math.random() * this.grid.height);

        if (!this.grid.isWalkable(x, y)) continue;

        // Must be far from the player's base at the center
        const dx = x - nestX;
        const dy = y - nestY;
        const distToNest = Math.sqrt(dx * dx + dy * dy);
        if (distToNest < BEETLE_DEN_MIN_NEST_DISTANCE) continue;

        createBeetleDen(this.world, x, y);
        break;
      }
    }
  }

  /** The Swarm's start: the nest, the queen and her nurses below, the first workers above */
  private spawnColony(nestX: number, nestY: number): void {
    const nestId = createNest(this.world, nestX, nestY);
    this.stockStartingPantry(nestId);

    // Spawn queen in underground (center of underground grid)
    // Underground tiles are corner-anchored: centers sit at +0.5
    const ugCenterX = Math.floor(UNDERGROUND_WIDTH / 2) + 0.5;
    const ugCenterY = Math.floor(UNDERGROUND_HEIGHT / 2) + 0.5;
    createQueen(this.world, ugCenterX, ugCenterY);

    // Spawn 3 initial nurses underground near the queen
    for (let i = 0; i < 3; i++) {
      const nurseX = ugCenterX + (i - 1) * 1.5; // spread around queen
      const nurseY = ugCenterY + 1;
      const nurseId = createAnt(this.world, nurseX, nurseY, AntRole.Nurse);
      const nurseLayer = this.world.getComponent<LayerComponent>(nurseId, COMPONENT.LAYER);
      if (nurseLayer) nurseLayer.layer = Layer.Underground;
    }

    // Spawn initial ants near nest
    for (let i = 0; i < INITIAL_ANTS; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 1 + Math.random() * 2;
      const x = nestX + Math.cos(angle) * dist;
      const y = nestY + Math.sin(angle) * dist;
      createAnt(this.world, x, y, AntRole.Worker);
    }
  }

  private clearCorridor(startX: number, startY: number, dirX: number, dirY: number): void {
    let x = startX;
    let y = startY;
    while (x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT) {
      // Clear a 3-tile-wide corridor
      for (let w = -1; w <= 1; w++) {
        const wx = dirY !== 0 ? x + w : x;
        const wy = dirX !== 0 ? y + w : y;
        const tile = this.grid.getTile(wx, wy);
        if (tile && !tile.walkable) {
          this.grid.setTile(wx, wy, { terrain: TerrainType.Dirt, walkable: true });
        }
      }
      x += dirX;
      y += dirY;
    }
  }

  private spawnFoodCluster(forceMushroom: boolean = false): void {
    const nestX = Math.floor(WORLD_WIDTH / 2);
    const nestY = Math.floor(WORLD_HEIGHT / 2);

    // Decide if this cluster is mushroom or leaf
    const isMushroom = forceMushroom || Math.random() < MUSHROOM_SPAWN_CHANCE;
    const minNestDist = isMushroom ? MUSHROOM_MIN_NEST_DISTANCE : 10;

    // Random position, at least minNestDist tiles from nest
    let cx: number, cy: number;
    do {
      cx = 5 + Math.floor(Math.random() * (WORLD_WIDTH - 10));
      cy = 5 + Math.floor(Math.random() * (WORLD_HEIGHT - 10));
    } while (
      Math.abs(cx - nestX) < minNestDist && Math.abs(cy - nestY) < minNestDist
    );

    if (isMushroom) {
      const count = MUSHROOM_CLUSTER_MIN + Math.floor(Math.random() * (MUSHROOM_CLUSTER_MAX - MUSHROOM_CLUSTER_MIN + 1));
      for (let j = 0; j < count; j++) {
        const fx = cx + Math.floor(Math.random() * 4 - 2);
        const fy = cy + Math.floor(Math.random() * 4 - 2);
        if (this.grid.isWalkable(fx, fy)) {
          const amount = MUSHROOM_AMOUNT_MIN + Math.floor(Math.random() * (MUSHROOM_AMOUNT_MAX - MUSHROOM_AMOUNT_MIN + 1));
          createFood(this.world, fx, fy, amount, FoodType.Mushroom);
        }
      }
    } else {
      const count = FOOD_PER_CLUSTER_MIN + Math.floor(Math.random() * (FOOD_PER_CLUSTER_MAX - FOOD_PER_CLUSTER_MIN));
      for (let j = 0; j < count; j++) {
        const fx = cx + Math.floor(Math.random() * 4 - 2);
        const fy = cy + Math.floor(Math.random() * 4 - 2);
        if (this.grid.isWalkable(fx, fy)) {
          const amount = FOOD_AMOUNT_MIN + Math.floor(Math.random() * (FOOD_AMOUNT_MAX - FOOD_AMOUNT_MIN));
          createFood(this.world, fx, fy, amount, FoodType.Leaf);
        }
      }
    }
  }

  private update(dt: number): void {
    // A frame can contain more fixed updates after the loop has been paused.
    if (this.gameOver || this.mutationOffer) return;
    // The world waits for the opening cinematic: ticking under it let every
    // starting worker forage and ride the shaft down before the player saw
    // them, so the surface came back empty
    if (this.introClock.isPlaying()) return;
    const previousPhase = this.dayNightSystem.getPhase();
    const ledger = this.coreLedgerNow();
    ledger?.begin(this.world, this.coreEntity(), this.queenStarving());
    try {
      // Managers stubbed without the stream (tests) tick on the plain Math.random
      if (this.simRandom) this.simRandom.run(() => this.world.update(dt));
      else this.world.update(dt);
    } catch (e) {
      console.error('[GameManager] System update error:', e);
    }

    ledger?.end(this.world, dt, this.queenStarving(), QUEEN_STARVATION_DAMAGE);
    this.updateNestAlert(dt);
    this.updateIdleQueenHint(dt);
    this.checkGameOver();
    const dayPhase = this.dayNightSystem.getPhase();
    if (this.milestone && (this.milestone.remaining -= dt) <= 0) this.milestone = null;
    if (!this.gameOver && previousPhase === 'night' && dayPhase === 'day') this.celebrateDawn();
    // The dawn mutation pick is the Swarm's: a Human expedition and the Crystal Hive do not mutate
    if (!this.humanPlayer && !this.crystal && shouldOfferMutation(previousPhase, dayPhase, this.dayNightSystem.getDayNumber(), this.gameOver !== null)) {
      this.openMutationOffer();
    }

    this.tickListeners?.forEach((listener) => listener(dt));

    // Send stats to UI (throttled every 10 ticks)
    this.statsTicks++;
    if (this.statsCallback && this.statsTicks >= 10) {
      try {
        this.statsCallback(this.getStats());
      } catch (e) {
        console.error('[GameManager] Stats error:', e);
      }
      this.statsTicks = 0;
    }
  }

  /** Nights the colony has lived through: the night on now does not count yet */
  private nightsSurvived(): number {
    return Math.max(0, this.dayNightSystem.getDayNumber() - 1);
  }

  /**
   * A night survived. The run is endless: the record moves on and some dawns
   * are milestones (night 7, then every 5) that pay a reward and celebrate.
   */
  private celebrateDawn(): void {
    const nights = this.nightsSurvived();
    recordNight(nights);
    const milestone = nightMilestone(nights);
    if (!milestone) return;
    // The Swarm stocks the food in its pantry; a Human expedition banks it as rations
    const paid = this.waves().pay(milestone.reward);
    const foodUnit = this.humanPlayer ? 'raciones' : 'comida';
    const info: MilestoneInfo = { night: nights, title: milestone.title, minerals: paid.minerals, food: paid.food, foodUnit };
    this.milestone = { info, remaining: MILESTONE_BANNER_SECONDS };
    emitAudio({ type: 'waveFx', kind: 'perfect' });
    this.world.pushNotification(
      'success',
      `🏆 ${milestone.title} +${paid.minerals} minerales${paid.food > 0 ? ` · +${paid.food} ${foodUnit}` : ''}`,
    );
  }

  /**
   * "Seguir jugando" after destroying the rival core: the run goes on, endless,
   * with no rival base. Its units cannot come without the base, so from now on
   * every wave is the wildlife's (beetles and the Acorazado Colosal).
   * Only a victory can be continued; returns whether the run resumed.
   */
  continueAfterVictory(): boolean {
    if (this.gameOver?.outcome !== 'victory') return false;
    this.gameOver = null;
    this.rivalCoreId = null; // the core is gone: no second victory
    this.waves().setRaidSource(null);
    this.world.pushNotification(
      'success',
      this.humanPlayer
        ? '🏆 La expedición sigue creciendo: ahora las oleadas vienen de la fauna salvaje'
        : '🏆 La colonia sigue creciendo: ahora las oleadas vienen de la fauna salvaje',
    );
    this.gameLoop.setPaused(false);
    this.publishStats();
    return true;
  }

  /** The ledger of the run's core; managers built without fields (tests) get one on first use */
  private coreLedgerNow(): CoreDamageLedger | null {
    if (!this.world) return null;
    this.coreLedger ??= new CoreDamageLedger(coreKindOf(this.runSetup?.playerRace ?? 'swarm'));
    return this.coreLedger;
  }

  /** The run's life: the queen, the command center or the Hive (null once gone) */
  private coreEntity(): EntityId | null {
    if (this.humanPlayer) return this.humanPlayer.coreId;
    if (this.crystal) return this.crystal.system.hive();
    return this.world.query(COMPONENT.QUEEN_ENTITY)[0] ?? null;
  }

  /** The Swarm queen's hunger is at 0: she is losing health to it */
  private queenStarving(): boolean {
    if (this.humanPlayer || this.crystal) return false;
    const id = this.world.query(COMPONENT.QUEEN_ENTITY)[0];
    const queen = id !== undefined ? this.world.getComponent<QueenEntityComponent>(id, COMPONENT.QUEEN_ENTITY) : undefined;
    return queen !== undefined && queen.hunger <= 0;
  }

  /** Queen death takes precedence over the rival core falling on the same tick. */
  private checkGameOver(): void {
    if (this.gameOver) return;

    const queens = this.world.query(COMPONENT.QUEEN_ENTITY);
    let queenDead = queens.length === 0;
    if (!queenDead) {
      const health = this.world.getComponent<HealthComponent>(queens[0], COMPONENT.HEALTH);
      if (health && health.current <= 0) queenDead = true;
    }
    const coreDestroyed = this.rivalCoreId != null && !this.world.hasEntity(this.rivalCoreId);
    // A Human player's life is the command center, a Crystal player's the Hive, not a queen.
    // Every run is endless: only losing that life or destroying the rival core ends it
    const alive = this.humanPlayer ? this.humanPlayer.isCoreAlive() : this.crystal ? this.crystal.hiveAlive() : !queenDead;
    const outcome = resolveRunOutcome(null, alive, coreDestroyed);
    if (!outcome) return;

    const nightsSurvived = this.nightsSurvived();

    this.gameOver = {
      outcome,
      survivedTicks: this.gameLoop.getTickCount(),
      antsHatched: this.world.metrics.antsHatched,
      densDestroyed: this.world.metrics.densDestroyed,
      tilesExcavated: this.world.metrics.tilesExcavated,
      wavesRepelled: this.world.metrics.wavesRepelled,
      build: summarizeMutationBuild(this.runModifiers.getAppliedMutations()),
      ...(this.humanPlayer ? { playerRace: 'human' as const } : {}),
      ...(this.crystal ? { playerRace: 'crystal' as const, crystal: this.crystal.system.stats() } : {}),
      ...(outcome === 'defeat'
        ? {
          cause: this.coreLedgerNow()?.cause() ?? { kind: 'unknown' as const, core: coreKindOf(this.runSetup?.playerRace ?? 'swarm') },
          diedOn: { day: this.dayNightSystem.getDayNumber(), phase: this.dayNightSystem.getPhase() },
        }
        : {}),
      ...(outcome === 'victory' && coreDestroyed
        ? { rivalCoreDestroyed: this.rivalRace === 'human' ? 'human' as const : 'crystal' as const, ...(this.rivalRace === 'crystal' ? { hiveDestroyed: true as const } : {}) }
        : {}),
      nightsSurvived,
      bestNight: recordNight(nightsSurvived),
      newRecord: nightsSurvived > 0 && nightsSurvived > this.runStartBest,
    };
    this.milestone = null;
    this.gameLoop.setPaused(true);

    // Push final stats immediately so the UI shows the game-over screen without waiting
    this.publishStats();
  }

  /** Push a snapshot now: the throttled publish in update() stops while paused. */
  private publishStats(): void {
    this.statsCallback?.(this.getStats());
  }

  /** Pause the run and open the evolution chamber for the current day. */
  private openMutationOffer(): void {
    const ids = offerMutations(this.offerRng, this.runModifiers.getAppliedMutations());
    if (ids.length === 0) return; // every mutation is at maxStacks
    const dayNumber = this.dayNightSystem.getDayNumber();
    this.mutationOffer = buildMutationOffer(dayNumber, ids, id => this.runModifiers.getStacks(id));
    this.mutationSelection = null;
    emitAudio({ type: 'dawnOffer' });
    this.gameLoop.setPaused(true);
    this.publishStats();
  }

  /**
   * Digit keys. While the evolution chamber is open, 1-3 select a card and
   * nothing else happens. Otherwise Ctrl+digit binds the selected ants to that
   * control group, Shift+digit adds them, and the digit alone recalls it. A
   * held key's auto-repeat is ignored.
   */
  private handleDigitKey(slot: number, press: KeyPress): void {
    if (press.repeat) return;
    if (this.mutationOffer) {
      const option = this.mutationOffer.options[slot - 1];
      if (option && !press.ctrl && !press.shift) this.selectMutation(option.id);
      return;
    }
    if (this.gameOver) return;
    if (press.ctrl) this.bindControlGroup(slot);
    else if (press.shift) this.bindControlGroup(slot, true);
    else this.recallControlGroup(slot);
  }

  /** Ctrl+digit: the selected own ants become group `slot`; `add` (Shift+digit) adds them instead. */
  bindControlGroup(slot: number, add = false): boolean {
    const ants = this.selectionSystem.getSelectedAnts();
    const bound = add ? this.controlGroups.add(slot, ants) : this.controlGroups.bind(slot, ants);
    if (bound) this.publishStats();
    return bound;
  }

  /**
   * Digit (or a click on its chip): select group `slot`'s living ants on the
   * layer in view. Pressed twice within CONTROL_GROUP_DOUBLE_TAP_MS it also
   * centers the camera on them, unless a cinematic owns the camera. Returns
   * how many ants were selected.
   */
  recallControlGroup(slot: number, nowMs = performance.now()): number {
    const double = this.controlGroups.tap(slot, nowMs);
    const layer = this.activeLayerValue();
    const living = this.controlGroups.recall(slot, (id) => this.world.hasEntity(id) && isPlayerUnit(this.world, id));
    const here = living.filter((id) => (this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface) === layer);
    if (here.length === 0) return 0;
    const selected = this.selectionSystem.selectAnts(here, layer);
    this.armedCommand = null;
    if (double) this.centerOnAnts(here);
    this.publishStats();
    return selected;
  }

  /** The bound control groups for the HUD chips: living count, lead caste, and whether it is the selection. */
  getControlGroups(): ControlGroupInfo[] {
    const selection = this.selectionSystem.getSelectedAnts();
    const out: ControlGroupInfo[] = [];
    for (const slot of this.controlGroups.slots()) {
      const ids = this.controlGroups.members(slot).filter((id) => this.world.hasEntity(id) && isPlayerUnit(this.world, id));
      if (ids.length === 0) continue;
      const byRole = new Map<AntRole, number>();
      for (const id of ids) {
        // A Human unit's chip borrows the icon of the matching caste; a Crystal unit's shows the fighter
        const human = this.world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT);
        const role = human ? HUMAN_GROUP_ROLE[human.type] : this.world.getComponent<AntComponent>(id, COMPONENT.ANT)?.role ?? AntRole.Soldier;
        byRole.set(role, (byRole.get(role) ?? 0) + 1);
      }
      const role = GROUP_ROLE_ORDER.reduce((best, r) => ((byRole.get(r) ?? 0) > (byRole.get(best) ?? 0) ? r : best));
      const selected = selection.length === ids.length && ids.every((id) => selection.includes(id));
      out.push({ slot, count: ids.length, role, selected });
    }
    return out;
  }

  /** Center the camera of the layer in view on these ants. */
  private centerOnAnts(ids: readonly EntityId[]): void {
    const camera = this.activeCamera();
    if (camera.isDirected()) return; // the intro cinematic owns the camera
    let x = 0;
    let y = 0;
    for (const id of ids) {
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      x += pos.x;
      y += pos.y;
    }
    camera.centerOn((x / ids.length) * TILE_SIZE + TILE_SIZE / 2, (y / ids.length) * TILE_SIZE + TILE_SIZE / 2);
  }

  /** + and -: one game speed step faster or slower, between ×1 and ×GAME_SPEED_MAX. */
  stepSpeed(step: 1 | -1): void {
    this.gameLoop.setSpeed(Math.max(1, Math.min(GAME_SPEED_MAX, this.gameLoop.getSpeed() + step)));
    this.publishStats();
  }

  private render(interpolation: number, dt: number): void {
    // One intro clock, advanced once per frame: the camera frames and the art draws the same intro time
    const introWasPlaying = this.introClock.isPlaying();
    this.introClock.advance(dt);
    audioIntroFrame(this.introClock.elapsed, dt);
    this.introDirector.frame();
    if (this.defenseBuild) {
      const hover = this.input.getHoverPoint();
      if (hover) this.updateGhostAt(hover.x, hover.y);
    }
    this.renderSystem.renderInterpolated(interpolation, dt);
    // The HUD fades in on the frame the intro ends, not at the next stats tick
    if (introWasPlaying && !this.introClock.isPlaying()) this.publishStats();
  }

  start(): void {
    this.gameLoop.start();
  }

  stop(): void {
    this.gameLoop.stop();
    this.input.destroy();
    this.detachIntroSkip();
    audioRunEnded();
  }

  togglePause(): void {
    if (this.gameOver || this.mutationOffer) return;
    this.gameLoop.setPaused(!this.gameLoop.isPaused());
  }

  isPaused(): boolean {
    return this.gameLoop.isPaused();
  }

  /**
   * The window changed size or devicePixelRatio: the canvas backing store
   * follows it (canvas px), and both cameras learn the new canvas and zoom range.
   */
  resizeCanvas(width: number, height: number, pixelRatio = 1): void {
    this.renderer.resize(width, height);
    this.camera.setCanvasSize(width, height, pixelRatio);
    this.undergroundCamera.setCanvasSize(width, height, pixelRatio);
  }

  /**
   * Screen layout from the UI: the part of the canvas the HUD leaves visible.
   * The default zoom (Home/R) follows every layout; the first one also
   * applies it and recenters both layers (surface on the nest); later calls
   * keep the view centered.
   */
  setViewport(rect: ViewportRect, defaultZoom?: number): void {
    this.camera.setViewport(rect);
    this.undergroundCamera.setViewport(rect);
    if (defaultZoom === undefined) return;
    for (const camera of [this.camera, this.undergroundCamera]) camera.setDefaultZoom(defaultZoom);
    if (this.viewportConfigured) return;
    this.viewportConfigured = true;
    for (const camera of [this.camera, this.undergroundCamera]) camera.zoom = camera.getDefaultZoom();
    this.camera.centerOn(Math.floor(WORLD_WIDTH / 2) * TILE_SIZE, Math.floor(WORLD_HEIGHT / 2) * TILE_SIZE);
    this.undergroundCamera.centerOn(Math.floor(UNDERGROUND_WIDTH / 2) * TILE_SIZE, Math.floor(UNDERGROUND_HEIGHT / 2) * TILE_SIZE);
  }

  setPaused(paused: boolean): void {
    if (this.gameOver || this.mutationOffer) return;
    this.gameLoop.setPaused(paused);
  }

  setSpeed(speed: number): void {
    this.gameLoop.setSpeed(speed);
  }

  /** Listen to every simulation tick (game time, not frames); returns the unsubscribe */
  onTick(listener: (dt: number) => void): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  onStats(callback: (stats: GameStats) => void): void {
    this.statsCallback = callback;
  }

  selectEntityAt(tileX: number, tileY: number): void {
    this.selectionSystem.selectAt(tileX, tileY, { layer: this.activeLayerValue() });
    // Force stats update to reflect selection
    this.publishStats();
  }

  clearSelection(): void {
    this.selectionSystem.clearSelection();
    this.farmFocus = null;
    this.armedCommand = null;
    this.publishStats();
  }

  /** Narrow a group to one of its ants (its cell in the group panel was clicked). */
  selectOnly(id: EntityId): void {
    this.selectionSystem.selectOnly(id);
    this.publishStats();
  }

  /** Detener: drop the orders of the selected ants; their own AI takes over. */
  stopSelectedAnts(): number {
    const stopped = stopAnts(this.world, this.selectionSystem.getSelectedAnts());
    this.armedCommand = null;
    this.publishStats();
    return stopped;
  }

  /** Mover: arm a move order; the next left click on the ground is the target. */
  armMoveTarget(): void {
    this.armCommand('move');
  }

  /** Atacar: arm an attack; the next left click picks an enemy, or the ground to attack-move to. */
  armAttackTarget(): void {
    this.armCommand('attack');
  }

  /** Recolectar: arm a gather order; the next click or tap on a food source is its target. */
  armGatherTarget(): void {
    this.armCommand('gather');
  }

  /** Minar: arm a mine order; the next click or tap on a mineral node is its target. */
  armMineTarget(): void {
    this.armCommand('mine');
  }

  private armCommand(command: CommandTarget): void {
    this.armedCommand = this.activeLayer === 'surface' && this.selectionSystem.getSelectedAnts().length > 0 ? command : null;
    this.publishStats();
  }

  cancelCommandTarget(): void {
    if (!this.armedCommand) return;
    this.armedCommand = null;
    this.publishStats();
  }

  /** Surface orders need the surface in view, a running game and some own ants selected. */
  private selectedAntsForOrder(): EntityId[] {
    this.armedCommand = null;
    if (this.activeLayer !== 'surface' || this.gameOver) return [];
    return this.selectionSystem.getSelectedAnts();
  }

  /**
   * Order the selected ants to walk to a tile: each gets its own formation slot.
   * `attack` makes it an attack-move. Surface only for now. Returns how many
   * ants took the order.
   */
  orderSelectedMove(tileX: number, tileY: number, attack = false): number {
    const ants = this.selectedAntsForOrder();
    if (ants.length === 0) return 0;
    const kind = attack ? OrderKind.AttackMove : OrderKind.Move;
    const result = issueMoveOrders(this.world, this.grid, ants, { x: tileX, y: tileY }, this.transitSystem, kind);
    if (!result) return 0;
    this.orderPings.push({ ...result.target, kind: attack ? 'attack' : 'move', ...this.pingExtras(result.ordered) });
    emitAudio({ type: 'order', kind: attack ? 'attack' : 'move' });
    this.emitOrderFeedback(attack ? 'attack-move' : 'move', result.ordered);
    this.publishStats();
    return result.ordered.length;
  }

  /** Order the selected ants to attack one enemy until it dies. Returns how many took the order. */
  orderSelectedAttack(targetId: EntityId): number {
    const ants = this.selectedAntsForOrder();
    if (ants.length === 0) return 0;
    const result = issueAttackOrders(this.world, this.grid, ants, targetId, this.transitSystem);
    if (!result) return 0;
    this.orderPings.push({ ...result.target, kind: 'attack', targetId, ...this.pingExtras(result.ordered) });
    this.emitOrderFeedback('attack', result.ordered, targetId);
    this.publishStats();
    return result.ordered.length;
  }

  /**
   * Minar: the selected workers mine `nodeId` in a loop until ordered
   * otherwise. Returns how many took the order.
   */
  orderSelectedMine(nodeId: EntityId): number {
    const ants = this.selectedAntsForOrder();
    if (!this.isSwarmRun()) return 0;
    if (ants.length === 0 || !isMineralNode(this.world, nodeId)) return 0;
    const ordered = issueMineOrders(this.world, ants, nodeId, this.transitSystem);
    this.acknowledgeResourceOrder(ordered, nodeId, 'mine');
    return ordered.length;
  }

  /**
   * Recolectar: the selected workers carry food from `foodId` to the pantry
   * and come back, until it is empty. Returns how many took the order.
   */
  orderSelectedGather(foodId: EntityId): number {
    const ants = this.selectedAntsForOrder();
    if (!this.isSwarmRun()) return 0;
    if (ants.length === 0 || !isFoodSource(this.world, foodId)) return 0;
    const ordered = issueGatherOrders(this.world, ants, foodId, this.transitSystem);
    const type = this.world.getComponent<FoodSourceComponent>(foodId, COMPONENT.FOOD_SOURCE)?.resourceType;
    this.acknowledgeResourceOrder(ordered, foodId, 'gather', foodOrderNoun(type));
    return ordered.length;
  }

  /**
   * The same feedback as the other orders: the marker on the target (the big
   * one with lines from the units for a finger), the order toast on a phone
   * ("3 obreras → minar"), the notice on a desktop; a refusal when no worker took it.
   */
  private acknowledgeResourceOrder(ordered: readonly EntityId[], targetId: EntityId, kind: 'gather' | 'mine', resource?: string): void {
    if (ordered.length === 0) {
      this.world.pushNotification('warning', kind === 'mine' ? 'Solo las obreras pueden minar.' : 'Solo las obreras pueden recolectar.', 'resource-order-refused', 1200);
      this.publishStats();
      return;
    }
    const at = this.world.getComponent<PositionComponent>(targetId, COMPONENT.POSITION);
    if (at) this.orderPings.push({ x: Math.round(at.x), y: Math.round(at.y), kind, targetId, ...this.pingExtras(ordered) });
    if (!this.touchInput) {
      const verb = kind === 'mine' ? 'minar' : `recolectar ${resource ?? 'comida'}`;
      this.world.pushNotification('info', `${workersNoun(ordered.length)} → ${verb}`);
    }
    emitAudio({ type: 'order', kind: 'move' });
    this.emitFeedback({
      type: 'order',
      order: kind,
      count: ordered.length,
      byRole: countRoles(this.world, ordered),
      target: null,
      touch: this.touchInput,
      ...(resource ? { resource } : {}),
    });
    this.publishStats();
  }

  /** Mineras: N, the autonomous miners the colony keeps on its fields (null: automatic). */
  setMinerTarget(target: number | null): void {
    this.antAISystem.setMinerTarget(target);
    this.publishStats();
  }

  getMinerStatus(): MinerStatus {
    return this.antAISystem.getMinerStatus();
  }

  /** Mantener posición: the selected ants stand still and fight only what is in reach. */
  holdSelectedAnts(): number {
    const held = issueHoldOrders(this.world, this.selectedAntsForOrder(), this.transitSystem);
    this.publishStats();
    return held.length;
  }

  /** Order pings since the last frame (tile coords); the renderer animates them. */
  drainOrderPings(): OrderPing[] {
    return this.orderPings.splice(0);
  }

  /** Live selection box (canvas px) while the player drags. */
  getDragBox(): ScreenBox | null {
    return this.input.getDragBox();
  }

  private activeLayerValue(): LayerValue {
    return this.activeLayer === 'underground' ? Layer.Underground : Layer.Surface;
  }

  private activeCamera(): Camera {
    return this.activeLayer === 'underground' ? this.undergroundCamera : this.camera;
  }

  /** Canvas px to entity-position space: an entity at (x, y) is drawn centered on tile (x, y). */
  private screenToEntity(screenX: number, screenY: number): { x: number; y: number } {
    const world = this.activeCamera().screenToWorld(screenX, screenY);
    return { x: world.x / TILE_SIZE - 0.5, y: world.y / TILE_SIZE - 0.5 };
  }

  /** Left click: pick one entity; shift toggles an ant in the group; ctrl takes its caste on screen. */
  private clickSelect(screenX: number, screenY: number, mods: InputModifiers): void {
    const at = this.screenToEntity(screenX, screenY);
    const layer = this.activeLayerValue();
    if (mods.ctrl) {
      const view = this.activeCamera().getViewRectTiles();
      const box: SelectionBox = { minX: view.x - 0.5, minY: view.y - 0.5, maxX: view.x + view.w - 0.5, maxY: view.y + view.h - 0.5 };
      this.selectionSystem.selectSameCaste(at.x, at.y, box, layer);
    } else {
      this.selectionSystem.selectAt(at.x, at.y, { layer, additive: mods.shift });
    }
    if (this.selectionSystem.getSelectedAnts().length === 0) this.armedCommand = null;
    emitAudio(selectionAudio(this.world, this.selectionSystem.getSelectedAnts()));
    this.publishStats();
  }

  /** Left drag released: select the own ants inside the box (shift adds). */
  private selectInScreenBox(box: ScreenBox, mods: InputModifiers): void {
    const a = this.screenToEntity(box.x0, box.y0);
    const b = this.screenToEntity(box.x1, box.y1);
    const area: SelectionBox = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
    this.selectionSystem.selectInBox(area, this.activeLayerValue(), mods.shift);
    emitAudio(selectionAudio(this.world, this.selectionSystem.getSelectedAnts()));
    this.armedCommand = null;
    this.areaSelect = false; // Seleccionar área is good for one box
    this.publishStats();
  }

  /**
   * Right tap (or a click with Mover armed): attack the enemy under the
   * pointer, mine the mineral node or gather from the food source under it,
   * else move there.
   */
  private commandAt(screenX: number, screenY: number): void {
    // Orders run on the surface only for now; right-click does nothing below
    if (this.activeLayer !== 'surface') return;
    if (this.crystal?.getBuildMode()) {
      // Right-click leaves build mode, as in StarCraft
      this.crystal.setBuildMode(null);
      this.publishStats();
      return;
    }
    // A spire selected (no units): the right-click is its rally point
    if (this.crystal && this.selectionSystem.getSelectedAnts().length === 0 && this.setRallyAt(this.screenToTile(screenX, screenY))) return;
    const at = this.screenToEntity(screenX, screenY);
    // A Human player's own orders: mine, help raise a frame, set a rally point, cancel a placement
    if (!this.armedCommand && this.humanPlayer?.commandAt(at)) {
      this.publishStats();
      return;
    }
    const moveOnly = this.armedCommand === 'move';
    const enemy = moveOnly ? null : this.enemyAt(at);
    if (enemy !== null) {
      this.orderSelectedAttack(enemy);
      return;
    }
    const resource = moveOnly ? null : this.resourceAt(at);
    if (resource !== null && this.selectionHasWorkers()) {
      if (isMineralNode(this.world, resource)) this.orderSelectedMine(resource);
      else this.orderSelectedGather(resource);
      return;
    }
    this.orderSelectedMove(Math.round(at.x), Math.round(at.y));
  }

  /** A click or tap with Recolectar or Minar armed: the source under the pointer, or a hint when it missed. */
  private resourceOrderAt(screenX: number, screenY: number, kind: 'gather' | 'mine'): void {
    const at = this.screenToEntity(screenX, screenY);
    const resource = this.resourceAt(at);
    const fits = resource !== null && (kind === 'mine' ? isMineralNode(this.world, resource) : isFoodSource(this.world, resource));
    if (!fits) {
      // Keep the order armed: the player can try again
      this.world.pushNotification('warning', kind === 'mine' ? 'Toca un yacimiento de cristal.' : 'Toca una fuente de comida.', 'resource-order-miss', 1200);
      this.publishStats();
      return;
    }
    if (kind === 'mine') this.orderSelectedMine(resource);
    else this.orderSelectedGather(resource);
  }

  /** The mineral node or food source drawn under the pointer, on explored ground. */
  private resourceAt(at: { x: number; y: number }): EntityId | null {
    const fog = this.visibilityGrid;
    return findResourceAt(this.world, at, (x, y) => fog.isExplored(x, y));
  }

  /** Minar and Recolectar are the Swarm's: Crystal and Human runs have economies of their own */
  private isSwarmRun(): boolean {
    return !this.crystal && !this.humanPlayer;
  }

  private selectionHasWorkers(): boolean {
    if (!this.isSwarmRun()) return false;
    return this.selectionSystem.getSelectedAnts().some((id) => this.world.getComponent<AntComponent>(id, COMPONENT.ANT)?.role === AntRole.Worker);
  }

  /** A click with Atacar armed: the enemy under the pointer, or an attack-move to the ground. */
  private attackAt(screenX: number, screenY: number): void {
    const at = this.screenToEntity(screenX, screenY);
    const enemy = this.enemyAt(at);
    if (enemy !== null) this.orderSelectedAttack(enemy);
    else this.orderSelectedMove(Math.round(at.x), Math.round(at.y), true);
  }

  /** The surface enemy drawn under the pointer: wildlife where the colony sees now, dens on explored ground. */
  private enemyAt(at: { x: number; y: number }): EntityId | null {
    const fog = this.visibilityGrid;
    return findEnemyAt(this.world, at, (x, y, den) => (den ? fog.isExplored(x, y) : isTileVisible(fog, x, y)));
  }

  /** Leaving a layer drops the ants picked on it; a selected nest or food stays. */
  private dropAntSelection(): void {
    this.armedCommand = null;
    if (this.selectionSystem.getSelectedAnts().length > 0) this.selectionSystem.clearSelection();
  }

  setColonyPriority(priority: ColonyPriority): void {
    this.antAISystem.colonyPriority = priority;
  }

  getColonyPriority(): ColonyPriority {
    return this.antAISystem.colonyPriority;
  }

  breedAnt(role: AntRole): boolean {
    const nests = this.world.query(COMPONENT.NEST, COMPONENT.QUEEN);
    if (nests.length === 0) return false;

    const nestId = nests[0];
    const nest = this.world.getComponent<NestComponent>(nestId, COMPONENT.NEST)!;
    const queen = this.world.getComponent<QueenComponent>(nestId, COMPONENT.QUEEN)!;

    // Check if already breeding
    if (queen.isBreeding) return false;

    // Determine cost and time based on role
    // Legacy nest breeding prices every role other than soldier and scout as a worker
    const cost = this.getBreedCost(role === AntRole.Soldier || role === AntRole.Scout ? role : AntRole.Worker);
    let time = BREED_TIME_WORKER;

    switch (role) {
      case AntRole.Soldier:
        time = BREED_TIME_SOLDIER;
        break;
      case AntRole.Scout:
        time = BREED_TIME_SCOUT;
        break;
    }

    // Check if enough food
    if (nest.foodStored < cost) return false;

    // Deduct cost and start breeding
    nest.foodStored -= cost;

    // Consume from cheapest food type first: leaves → mushrooms → meat
    let remaining = cost;
    const currentLeaf = Math.max(0, (nest.foodStored + cost) - nest.mushroomStored - nest.meatStored);
    const leafConsumed = Math.min(remaining, currentLeaf);
    remaining -= leafConsumed;
    if (remaining > 0) {
      const shroomConsumed = Math.min(remaining, nest.mushroomStored);
      nest.mushroomStored -= shroomConsumed;
      remaining -= shroomConsumed;
    }
    if (remaining > 0) {
      nest.meatStored = Math.max(0, nest.meatStored - remaining);
    }

    queen.isBreeding = true;
    queen.breedRole = role;
    queen.breedCooldown = time;
    queen.breedTimer = time;

    return true;
  }

  queueBreed(role: AntRole): boolean {
    const queens = this.world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.EGG_QUEUE);
    if (queens.length === 0) return false;

    const queenId = queens[0];
    const eggQueue = this.world.getComponent<EggQueueComponent>(queenId, COMPONENT.EGG_QUEUE)!;

    // Check queue limit per type
    const countForRole = eggQueue.queue.filter(e => e.role === role).length;
    if (countForRole >= eggQueue.maxPerType) return false;

    // Spend from the pantry tile piles (leaf → mushroom → meat priority). A
    // colony with no workers left may pay a worker egg with the entrance pile:
    // nobody may be able to carry that food down, and without a worker the
    // colony could never recover (player report: "me quedé sin obreras").
    const cost = this.getBreedCost(role);
    const rescue = role === AntRole.Worker && this.countWorkers() === 0;
    if (!this.deductFromStorage(cost, rescue)) return false;

    // Add to queue
    eggQueue.queue.push({
      role,
      layTimer: queenLayTime(this.world.upgradeLevels),
      layTimerTotal: queenLayTime(this.world.upgradeLevels),
    });
    emitAudio({ type: 'eggQueued' });

    return true;
  }

  /**
   * Deduct food from the underground pantry tiles (leaf → mushroom → meat).
   * With `orEntrance`, what the pantry lacks comes off the entrance pile.
   * False (nothing spent) if insufficient.
   */
  private deductFromStorage(cost: number, orEntrance = false): boolean {
    const pantry = this.undergroundGrid.getPantryStored().total;
    if (pantry >= cost) {
      this.undergroundGrid.drainFood(cost);
      return true;
    }
    const nest = orEntrance ? this.getPlayerNest() : undefined;
    if (!nest || pantry + nest.foodStored < cost) return false;
    this.undergroundGrid.drainFood(pantry);
    this.takeFromEntrancePile(nest, cost - pantry);
    return true;
  }

  /** Take food off the entrance pile, each type in proportion to what lies there */
  private takeFromEntrancePile(nest: NestComponent, amount: number): void {
    const share = nest.foodStored > 0 ? Math.min(1, amount / nest.foodStored) : 0;
    nest.mushroomStored = Math.max(0, nest.mushroomStored * (1 - share));
    nest.meatStored = Math.max(0, nest.meatStored * (1 - share));
    nest.foodStored = Math.max(0, nest.foodStored - amount);
  }

  private getPlayerNest(): NestComponent | undefined {
    const nestId = this.world.query(COMPONENT.NEST)[0];
    return nestId !== undefined ? this.world.getComponent<NestComponent>(nestId, COMPONENT.NEST) : undefined;
  }

  private countWorkers(): number {
    let workers = 0;
    for (const id of this.world.query(COMPONENT.ANT)) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role === AntRole.Worker) workers++;
    }
    return workers;
  }

  /** Food cost to breed one ant of this role, including run mutation surcharges. */
  getBreedCost(role: AntRole): number {
    // Nutrición de larvas discounts the whole price, the mutation surcharge included
    return breedCost(this.world.upgradeLevels, role, role === AntRole.Soldier ? this.runModifiers.soldierCostBonus : 0);
  }

  /** Apply one mutation stack; false (nothing changes) once it reached maxStacks. */
  applyMutation(id: MutationId): boolean {
    if (!this.runModifiers.apply(id)) return false;
    this.retrofitAntStats();
    return true;
  }

  /** Apply one card of the pending dawn offer and resume. False (no change) for any other id. */
  chooseMutation(id: string): boolean {
    const option = this.mutationOffer?.options.find(candidate => candidate.id === id);
    if (!option || this.gameOver || !this.applyMutation(option.id)) return false;
    this.mutationOffer = null;
    this.mutationSelection = null;
    this.lastMutationPick = option.id;
    emitAudio({ type: 'mutationChosen' });
    this.gameLoop.setPaused(false);
    this.publishStats();
    return true;
  }

  /**
   * Select a card of the pending offer without applying it (null clears the
   * selection). False (no change) with no offer pending or an id outside it.
   */
  selectMutation(id: string | null): boolean {
    if (!this.mutationOffer || this.gameOver) return false;
    const option = id === null ? null : this.mutationOffer.options.find(candidate => candidate.id === id);
    if (option === undefined) return false;
    this.mutationSelection = option?.id ?? null;
    this.publishStats();
    return true;
  }

  /** Apply the selected card of the pending offer and resume; false when none is selected. */
  confirmMutation(): boolean {
    return this.mutationSelection !== null && this.chooseMutation(this.mutationSelection);
  }

  getAppliedMutations(): MutationId[] {
    return this.runModifiers.getAppliedMutations();
  }

  /** Recompute spawn-time stats from base stats so purchase/pick order never compounds rounding. */
  private retrofitAntStats(): void {
    retrofitAntStats(this.world);
  }

  // ── Mejoras (Swarm upgrades) ─────────────────────────────────────

  /** Every upgrade line with its level, next price, affordability and effect numbers */
  getUpgrades(): UpgradeInfo[] {
    return upgradeInfos(this.world.upgradeLevels, this.upgradeFunds());
  }

  /** What the colony can pay upgrades with: pantry and farm food, mushrooms among it, and the mineral bank */
  private upgradeFunds(): UpgradeFunds {
    const stored = this.undergroundGrid.getPantryStored();
    return { food: stored.total, mushrooms: stored.mushroom, minerals: this.world.minerals.stored };
  }

  /** Pays an upgrade price: mushrooms from the farm piles first, then food (leaf → mushroom → meat), then minerals. */
  private payUpgradeCost(cost: { food: number; minerals: number; mushrooms: number }): void {
    if (cost.mushrooms > 0) this.undergroundGrid.drainFoodOfType('mushroom', cost.mushrooms);
    if (cost.food > 0) this.undergroundGrid.drainFood(cost.food);
    if (cost.minerals > 0) this.world.minerals.spend(cost.minerals);
  }

  /** Buy the next level of a line. False (nothing spent) at max level or when the colony cannot pay. */
  purchaseUpgrade(id: UpgradeId): boolean {
    const payer: UpgradePayer = { funds: () => this.upgradeFunds(), pay: (cost) => this.payUpgradeCost(cost) };
    const result = purchase(this.world.upgradeLevels, id, payer);
    if (!result.ok) return false;
    this.applyUpgradeLevels();
    const def = upgradeDef(id);
    this.world.pushNotification('success', `👑 Mejora: ${def.name} nivel ${result.level} (${UPGRADE_GROUP_LABEL[def.group]})`);
    emitUpgradeAudio(result.level);
    return true;
  }

  /** Push the levels into everything that reads them: ants, queen, queued eggs, pantry, colony multipliers */
  private applyUpgradeLevels(): void {
    syncWorldUpgrades(this.world);
    this.undergroundGrid.setPantryTileCapacityBonus(pantryTileBonus(this.world.upgradeLevels));
    this.retrofitAntStats();
    applyQueenUpgrades(this.world);
    retimeQueuedEggs(this.world);
  }

  /** The bought levels, as plain data for a save */
  getUpgradeLevels(): UpgradeLevels {
    return { ...this.world.upgradeLevels };
  }

  /** Restore saved levels (unknown lines dropped, levels clamped) and apply them to the colony */
  setUpgradeLevels(levels: Partial<Record<string, unknown>>): void {
    this.world.upgradeLevels = normalizeUpgradeLevels(levels);
    this.applyUpgradeLevels();
  }

  /** 0-3: the crown the queen wears for her upgrades */
  getQueenTier(): number {
    return queenTier(this.world.upgradeLevels);
  }

  /** The Estadísticas tab: population, stores, queen and brood rates, run tallies */
  getColonyStatsReport(): ColonyStatsReport {
    const stored = this.undergroundGrid.getPantryStored();
    const day = this.dayNightSystem.getDayNumber();
    return buildColonyStats(this.world, { food: stored.total, mushrooms: stored.mushroom, day, nightsSurvived: day - 1 });
  }

  // ── Retreat horn ──────────────────────────────────────────────────

  /** Recall every surface ant to the nest — defensive posture; it outranks every player order */
  soundRetreat(): void {
    const recalled = soundRetreatHorn(this.world);
    if (recalled > 0) {
      this.world.pushNotification('info', `📯 ¡Retirada! ${recalled} hormigas vuelven al nido`);
    }
  }

  // ── Garrison ──────────────────────────────────────────────────────

  setGarrisonSize(count: number): void {
    this.invasionSystem.setGarrison(count);
  }

  getGarrisonInfo(): { target: number; current: number } {
    let current = 0;
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.LAYER)) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role !== AntRole.Soldier) continue;
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer === Layer.Underground) current++;
    }
    return { target: this.invasionSystem.getGarrison(), current };
  }

  getBreedingStatus(): { isBreeding: boolean; progress: number; role: AntRole | null } {
    const nests = this.world.query(COMPONENT.QUEEN);
    if (nests.length === 0) {
      return { isBreeding: false, progress: 0, role: null };
    }

    const queen = this.world.getComponent<QueenComponent>(nests[0], COMPONENT.QUEEN)!;
    if (!queen.isBreeding) {
      return { isBreeding: false, progress: 0, role: null };
    }

    const progress = queen.breedCooldown > 0
      ? 1 - (queen.breedTimer / queen.breedCooldown)
      : 1;

    return {
      isBreeding: true,
      progress: Math.max(0, Math.min(1, progress)),
      role: queen.breedRole,
    };
  }

  /** All build modes are mutually exclusive — enabling one turns the rest off */
  private clearBuildModes(): void {
    this.digMode = false;
    this.incubationMode = false;
    this.farmMode = false;
    this.storageMode = false;
    this.throneMode = false;
    this.defenseMode = false;
  }

  setDigMode(enabled: boolean): void {
    if (enabled) this.clearBuildModes();
    this.digMode = enabled;
    if (!enabled) {
      this.digHover = null;
      this.digPreview = [];
    }
  }

  isDigMode(): boolean {
    return this.digMode;
  }

  setIncubationMode(enabled: boolean): void {
    if (enabled) this.clearBuildModes();
    this.incubationMode = enabled;
  }

  isIncubationMode(): boolean {
    return this.incubationMode;
  }

  setFarmMode(enabled: boolean): void {
    if (enabled) this.clearBuildModes();
    this.farmMode = enabled;
  }

  isFarmMode(): boolean {
    return this.farmMode;
  }

  setStorageMode(enabled: boolean): void {
    if (enabled) this.clearBuildModes();
    this.storageMode = enabled;
  }

  isStorageMode(): boolean {
    return this.storageMode;
  }

  setThroneMode(enabled: boolean): void {
    if (enabled) this.clearBuildModes();
    this.throneMode = enabled;
  }

  isThroneMode(): boolean {
    return this.throneMode;
  }

  setDefenseMode(enabled: boolean): void {
    if (enabled) this.clearBuildModes();
    this.defenseMode = enabled;
  }

  isDefenseMode(): boolean {
    return this.defenseMode;
  }

  getFarmTileCount(): number {
    return this.fungusFarmSystem.getFarmTileCount();
  }

  /** Colony consumption policy: which food type gets eaten first */
  setConsumptionPriority(type: 'leaf' | 'mushroom' | 'meat'): void {
    this.undergroundGrid.setConsumptionPriority(type);
  }

  getConsumptionPriority(): 'leaf' | 'mushroom' | 'meat' {
    return this.undergroundGrid.getConsumptionPriority();
  }

  /** The farm tile the player tapped (info card line and growth bars), if any */
  private farmFocus: { x: number; y: number } | null = null;

  /** Point the info card at a farm tile; any other tile lets go. True when it is a farm tile. */
  focusFarmTile(tileX: number, tileY: number): boolean {
    const tile = this.undergroundGrid.getTile(tileX, tileY);
    const isFarm = tile !== null && tile.walkable && tile.chamberType === ChamberType.FungusFarm;
    this.farmFocus = isFarm ? { x: tileX, y: tileY } : null;
    return isFarm;
  }

  /** Growth of the tapped farm tile, for the info card */
  getFocusedFarmTile(): { x: number; y: number; progress: number; ready: boolean; label: string } | null {
    const focus = this.farmFocus;
    if (!focus) return null;
    const tile = this.undergroundGrid.getTile(focus.x, focus.y);
    if (!tile || tile.chamberType !== ChamberType.FungusFarm) {
      this.farmFocus = null;
      return null;
    }
    const amount = tile.food?.type === 'mushroom' ? tile.food.amount : 0;
    const capacity = this.undergroundGrid.getPantryTileCapacity();
    return {
      x: focus.x,
      y: focus.y,
      progress: farmGrowthProgress(amount, capacity),
      ready: isFarmTileReady(amount, capacity),
      label: farmTileStatusLabel(amount, capacity),
    };
  }

  /** Farm state for the UI: production rate, stall reason, and fill level */
  getFarmStatus(): { tiles: number; rate: number; status: string; stored: number; capacity: number } {
    const s = this.fungusFarmSystem.getStatus();
    return {
      ...s,
      stored: Math.floor(this.undergroundGrid.getFarmStored()),
      capacity: this.undergroundGrid.getFarmCapacity(),
    };
  }

  getStorageTileCount(): number {
    return this.undergroundGrid.getPantryTiles().length;
  }

  designateFarm(tileX: number, tileY: number): boolean {
    const tile = this.undergroundGrid.getTile(tileX, tileY);
    if (!tile) return false;
    if (!tile.walkable) return false;
    if (
      tile.chamberType === ChamberType.Queen ||
      tile.chamberType === ChamberType.FoodStorage ||
      tile.chamberType === ChamberType.Incubation ||
      tile.chamberType === ChamberType.Defense
    ) return false;
    // Un-designation guard: a farm tile still holding mushrooms can't be removed
    if (tile.chamberType === ChamberType.FungusFarm && tile.food && tile.food.amount > 0) {
      this.world.pushNotification(
        'warning',
        '🍄 No puedes quitar una granja con hongos: espera a que se coman',
        'farm-undesignate',
        3000
      );
      return false;
    }
    // Toggle: farm ↔ general
    tile.chamberType = tile.chamberType === ChamberType.FungusFarm ? ChamberType.General : ChamberType.FungusFarm;
    this.undergroundGrid.invalidateChamberCache();
    if (this.renderSystem) {
      this.renderSystem.invalidateUndergroundTexture();
    }
    return true;
  }

  designateStorage(tileX: number, tileY: number): boolean {
    const tile = this.undergroundGrid.getTile(tileX, tileY);
    if (!tile) return false;
    if (!tile.walkable) return false;
    if (
      tile.chamberType === ChamberType.Queen ||
      tile.chamberType === ChamberType.Incubation ||
      tile.chamberType === ChamberType.FungusFarm ||
      tile.chamberType === ChamberType.Defense
    ) return false;
    // Un-designation guard: a pantry tile holding food can't be removed
    if (tile.chamberType === ChamberType.FoodStorage) {
      if (tile.food && tile.food.amount > 0) {
        this.world.pushNotification(
          'warning',
          '🍖 No puedes quitar un almacén con comida: espera a que se vacíe',
          'storage-undesignate',
          3000
        );
        return false;
      }
      tile.chamberType = ChamberType.General;
    } else {
      tile.chamberType = ChamberType.FoodStorage;
    }
    this.undergroundGrid.invalidateChamberCache();
    // Invalidate texture cache
    if (this.renderSystem) {
      this.renderSystem.invalidateUndergroundTexture();
    }
    return true;
  }

  /** Toggle a walkable tile as Defense area — defenders post here and guard it */
  designateDefense(tileX: number, tileY: number): boolean {
    const tile = this.undergroundGrid.getTile(tileX, tileY);
    if (!tile) return false;
    if (!tile.walkable) return false;
    if (
      tile.chamberType === ChamberType.Queen ||
      tile.chamberType === ChamberType.FoodStorage ||
      tile.chamberType === ChamberType.Incubation ||
      tile.chamberType === ChamberType.FungusFarm
    ) return false;
    // Toggle: defense ↔ general
    tile.chamberType = tile.chamberType === ChamberType.Defense ? ChamberType.General : ChamberType.Defense;
    this.undergroundGrid.invalidateChamberCache();
    if (this.renderSystem) {
      this.renderSystem.invalidateUndergroundTexture();
    }
    return true;
  }

  /** Toggle a walkable tile as Queen (throne) area — where the queen can relocate */
  designateThrone(tileX: number, tileY: number): boolean {
    const tile = this.undergroundGrid.getTile(tileX, tileY);
    if (!tile) return false;
    if (!tile.walkable) return false;
    if (
      tile.chamberType === ChamberType.FoodStorage ||
      tile.chamberType === ChamberType.Incubation ||
      tile.chamberType === ChamberType.FungusFarm ||
      tile.chamberType === ChamberType.Defense
    ) return false;
    // Toggle: queen ↔ general
    const designating = tile.chamberType !== ChamberType.Queen;
    tile.chamberType = designating ? ChamberType.Queen : ChamberType.General;
    this.undergroundGrid.invalidateChamberCache();
    if (this.renderSystem) {
      this.renderSystem.invalidateUndergroundTexture();
    }
    // Teach the command at the moment it becomes available
    if (designating) {
      this.world.pushNotification(
        'info',
        '👑 Trono designado — CLICKEALO (sin modo de construcción) para mandar a la reina ahí',
        'throne-howto',
        15000
      );
    }
    return true;
  }

  /**
   * Direct command: send the queen to the throne area CONTAINING the clicked
   * tile. With several thrones, the player decides which one — clicking is the
   * order. Returns false when the click isn't a valid relocation (not a throne,
   * or it's the throne she already occupies) so the caller can fall through.
   */
  sendQueenToThroneAt(tileX: number, tileY: number): boolean {
    const tile = this.undergroundGrid.getTile(tileX, tileY);
    if (!tile || !tile.walkable || tile.chamberType !== ChamberType.Queen) return false;

    const queens = this.world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.POSITION);
    if (queens.length === 0) return false;
    const queenPos = this.world.getComponent<PositionComponent>(queens[0], COMPONENT.POSITION)!;

    // Which throne region was clicked? And is the queen already living in it?
    const regions = this.undergroundGrid.getChamberRegions();
    const clicked = regions.find(
      (r) => r.type === ChamberType.Queen && r.tiles.some((t) => t.x === tileX && t.y === tileY)
    );
    if (!clicked) return false;
    const queenTileX = Math.floor(queenPos.x);
    const queenTileY = Math.floor(queenPos.y);
    if (clicked.tiles.some((t) => t.x === queenTileX && t.y === queenTileY)) {
      return false; // her current home — let the click select instead
    }

    // Walk her to the region's heart: the tile nearest its centroid
    let target = clicked.tiles[0];
    let bestD = Infinity;
    for (const t of clicked.tiles) {
      const d = Math.hypot(t.x + 0.5 - clicked.cx, t.y + 0.5 - clicked.cy);
      if (d < bestD) {
        bestD = d;
        target = t;
      }
    }

    const path = this.world.getComponent<PathComponent>(queens[0], COMPONENT.PATH);
    if (!path) return false;
    const route = this.undergroundGrid.findPath(queenPos.x, queenPos.y, target.x, target.y);
    if (!route || route.length === 0) {
      this.world.pushNotification('warning', '👑 No hay túnel hasta ese trono — excavá un camino que lo conecte');
      return true; // it WAS a throne command — don't fall through to selection
    }
    path.waypoints = route;
    path.currentIndex = 0;
    this.world.pushNotification('info', '👑 La reina se muda al trono elegido — escoltala, es lenta y valiosa');
    return true;
  }

  /**
   * Mark an earth tile for digging. A mark refused only because the queue is
   * full is said out loud (once per burst) and previewed red.
   */
  designateDig(tileX: number, tileY: number): boolean {
    if (this.excavationSystem.designateTile(tileX, tileY)) {
      this.noteDigPreview(tileX, tileY, 'ok');
      return true;
    }
    const tile = this.undergroundGrid.getTile(tileX, tileY);
    if (tile && !tile.designated && tile.terrain === UndergroundTerrainType.Earth && this.excavationSystem.isFull()) {
      this.noteDigPreview(tileX, tileY, 'over');
      const now = Date.now();
      if (now - this.digLimitNotifiedAt > 2000) {
        this.digLimitNotifiedAt = now;
        emitAudio({ type: 'ui', sound: 'error' });
        this.world.pushNotification('warning', `⛏️ ${digLimitMessage(this.getDigCap())}`);
        this.publishStats();
      }
    }
    return false;
  }

  /** A click with Excavar: marks earth, or takes the mark off a marked tile */
  toggleDigAt(tileX: number, tileY: number): void {
    if (this.undergroundGrid.getTile(tileX, tileY)?.designated) {
      this.cancelDig(tileX, tileY);
      this.digPreview = [];
    } else {
      if (!this.paintStroke) this.digPreview = this.digPreview.filter((p) => Date.now() - p.at < DIG_PREVIEW_MS);
      this.designateDig(tileX, tileY);
    }
    this.publishStats();
  }

  private noteDigPreview(x: number, y: number, state: 'ok' | 'over'): void {
    this.digPreview.push({ x, y, state, at: Date.now() });
    if (this.digPreview.length > 256) this.digPreview.shift();
  }

  /** Pending dig marks the colony may queue at once: the base cap plus 5 per level of Excavación rápida */
  getDigCap(): number {
    return digJobCap(this.world.upgradeLevels.dig);
  }

  /** The dig counter: marks over the cap, the crew on them and the time left */
  getDigStatus(): DigStatus {
    return digStatus({
      pending: this.excavationSystem.getPendingJobCount(),
      cap: this.getDigCap(),
      diggers: this.excavationSystem.getActiveDiggerCount(),
      secondsPerTile: this.excavationSystem.getSecondsPerTile(),
    });
  }

  /**
   * What the renderer draws while Excavar is on below: the cached diggable
   * map (rebuilt only when the layout changes), the queue and the preview.
   */
  getDigOverlay(): DigOverlay | null {
    if (!this.digMode || this.activeLayer !== 'underground') return null;
    const grid = this.undergroundGrid;
    const version = grid.getLayoutVersion();
    if (!this.digClassCache || this.digClassCache.version !== version) {
      this.digClassCache = { version, map: buildDigClassMap(grid) };
    }
    const classes = this.digClassCache.map;
    const now = Date.now();
    const preview = this.paintStroke
      ? this.digPreview
      : this.digPreview.filter((p) => now - p.at < DIG_PREVIEW_MS);
    const hoverAt = this.digHover;
    let hover: DigOverlay['hover'] = null;
    if (hoverAt && hoverAt.x >= 0 && hoverAt.y >= 0 && hoverAt.x < grid.width && hoverAt.y < grid.height) {
      const tile = grid.getTile(hoverAt.x, hoverAt.y);
      const cls = classes[hoverAt.y * grid.width + hoverAt.x] as DigTileClass;
      hover = {
        x: hoverAt.x,
        y: hoverAt.y,
        state: previewDigTile(cls, Boolean(tile?.designated), this.excavationSystem.getPendingJobCount(), this.getDigCap()),
      };
    }
    return {
      classes,
      width: grid.width,
      jobs: this.excavationSystem.getJobProgress(),
      preview: preview.map(({ x, y, state }) => ({ x, y, state })),
      hover,
    };
  }

  designateIncubation(tileX: number, tileY: number): boolean {
    const tile = this.undergroundGrid.getTile(tileX, tileY);
    if (!tile) return false;
    // Can only designate walkable tiles that aren't already a special chamber
    if (!tile.walkable) return false;
    if (
      tile.chamberType === ChamberType.Queen ||
      tile.chamberType === ChamberType.FoodStorage ||
      tile.chamberType === ChamberType.FungusFarm ||
      tile.chamberType === ChamberType.Defense
    ) return false;
    // Toggle: if already incubation, remove it (set to General)
    if (tile.chamberType === ChamberType.Incubation) {
      tile.chamberType = ChamberType.General;
    } else {
      tile.chamberType = ChamberType.Incubation;
    }
    this.undergroundGrid.invalidateChamberCache();
    // Invalidate texture cache
    if (this.renderSystem) {
      this.renderSystem.invalidateUndergroundTexture();
    }
    return true;
  }

  cancelDig(tileX: number, tileY: number): void {
    this.excavationSystem.cancelDesignation(tileX, tileY);
  }

  enterUnderground(): void {
    if (this.humanPlayer || this.crystal) return; // the Humans build up and the Crystal Hive grows spires: there is no nest view
    this.dropAntSelection();
    this.activeLayer = 'underground';
    const cx = Math.floor(UNDERGROUND_WIDTH / 2) * TILE_SIZE;
    const cy = Math.floor(UNDERGROUND_HEIGHT / 2) * TILE_SIZE;
    this.undergroundCamera.centerOn(cx, cy);
    // Wheel zoom + right-drag pan must drive the camera of the ACTIVE layer
    this.input.setCamera(this.undergroundCamera);
  }

  exitUnderground(): void {
    this.dropAntSelection();
    this.farmFocus = null;
    this.activeLayer = 'surface';
    this.input.setCamera(this.camera);
  }

  getActiveLayer(): 'surface' | 'underground' {
    return this.activeLayer;
  }

  getUndergroundGrid(): UndergroundGrid {
    return this.undergroundGrid;
  }

  // ── Underground minimap ────────────────────────────────────────────
  // The underground is 90x60 tiles but a 1x-zoom viewport shows ~25x18, so the
  // player sees under 10% of a base they dug themselves. These feed the minimap.

  /** Camera viewport as a tile rect — drawn as the "you are here" box */
  getUndergroundView(): { x: number; y: number; w: number; h: number } {
    return this.undergroundCamera.getViewRectTiles();
  }

  /**
   * The camera view of the layer on screen, in tiles, and the band of the
   * screen it fills (fractions: the HUD covers the rest) — the wave alert's edge arrows
   */
  getActiveView(): { x: number; y: number; w: number; h: number; band: { left: number; top: number; width: number; height: number } } {
    const camera = this.activeCamera();
    const v = camera.getViewport();
    const canvas = camera.getCanvasSize();
    return {
      ...camera.getViewRectTiles(),
      band: { left: v.x / canvas.width, top: v.y / canvas.height, width: v.w / canvas.width, height: v.h / canvas.height },
    };
  }

  /** Hostile units on one layer: anything inside the nest, the wave's raiders on the surface (roaming wildlife is no attack) */
  getInvaderCount(layer: 'surface' | 'underground'): number {
    return layer === 'underground' ? this.nestHostiles().length : this.invasionSystem.invadersOn('surface');
  }

  /** "Ir al nido": switch to the nest and put the camera on the fight */
  goToNestFight(): void {
    if (this.activeLayer !== 'underground') this.enterUnderground();
    const fight = this.nestAlert.getState().fight ?? this.nestFightCenter(this.nestHostiles());
    if (fight) this.centerUndergroundOn(fight.x + 0.5, fight.y + 0.5);
  }

  /** Living hostile units inside the nest, with their positions */
  private nestHostiles(): PositionComponent[] {
    const out: PositionComponent[] = [];
    for (const store of [COMPONENT.BEETLE, COMPONENT.CRICKET, COMPONENT.CRYSTAL_UNIT, HUMAN_COMPONENT.UNIT]) {
      for (const id of this.world.query(store, COMPONENT.POSITION, COMPONENT.LAYER)) {
        if (this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer !== Layer.Underground) continue;
        const hp = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
        if ((hp && hp.current <= 0) || !isHostileTo(this.world, FactionId.PLAYER, id)) continue;
        out.push(this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!);
      }
    }
    return out;
  }

  private nestFightCenter(hostiles: readonly PositionComponent[]): { x: number; y: number } | null {
    if (hostiles.length === 0) return null;
    let x = 0;
    let y = 0;
    for (const p of hostiles) {
      x += p.x;
      y += p.y;
    }
    return { x: x / hostiles.length, y: y / hostiles.length };
  }

  /** What the nest alert sees this tick: who is inside, and whether the queen or the eggs are bitten */
  private sampleNest(): NestSample {
    const hostiles = this.nestHostiles();
    const near = (p: { x: number; y: number }, r: number) => hostiles.some((h) => Math.hypot(h.x - p.x, h.y - p.y) <= r);
    let queen: NestSample['queen'] = null;
    const queenId = this.world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.POSITION)[0];
    if (queenId !== undefined) {
      const pos = this.world.getComponent<PositionComponent>(queenId, COMPONENT.POSITION)!;
      const hp = this.world.getComponent<HealthComponent>(queenId, COMPONENT.HEALTH);
      if (hp) queen = { health: hp.current, max: hp.max, attacked: hostiles.length > 0 && near(pos, NEST_BITE_RADIUS) };
    }
    let eggsAttacked = false;
    if (hostiles.length > 0) {
      for (const id of this.world.query(COMPONENT.EGG, COMPONENT.POSITION)) {
        if (near(this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!, NEST_BITE_RADIUS)) {
          eggsAttacked = true;
          break;
        }
      }
    }
    return {
      invaders: hostiles.length,
      surfaceInvaders: this.invasionSystem.invadersOn('surface'),
      fight: this.nestFightCenter(hostiles),
      queen,
      eggsAttacked,
    };
  }

  /** Feed the nest alert; a new alert sounds the alarm and flashes the screen edge */
  /**
   * The queen lays only what the player orders: with food piling up and no egg
   * ordered for a while, say so (player report: a full pantry, no brood all day).
   */
  private updateIdleQueenHint(dt: number): void {
    if (this.humanPlayer || this.crystal || this.tutorialCalm || !this.undergroundGrid) return;
    const queens = this.world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.EGG_QUEUE);
    const queue = queens.length > 0 ? this.world.getComponent<EggQueueComponent>(queens[0], COMPONENT.EGG_QUEUE) : undefined;
    const capacity = this.undergroundGrid.getPantryCapacity();
    const plenty = capacity > 0 && this.undergroundGrid.getPantryStored().total >= capacity * IDLE_QUEEN_PANTRY_RATIO;
    if (!queue || queue.queue.length > 0 || !plenty) {
      this.idleQueenSeconds = 0;
      return;
    }
    this.idleQueenSeconds += dt;
    if (this.idleQueenSeconds < IDLE_QUEEN_HINT_SECONDS) return;
    // Game-time throttle (saved with the run), not the wall-clock notification cooldown
    this.idleQueenSeconds = -IDLE_QUEEN_REPEAT_SECONDS;
    this.world.pushNotification('warning', '🥚 La despensa rebosa y la reina no tiene huevos encargados: encarga crías en el panel CRÍA');
  }

  private updateNestAlert(dt: number): void {
    // Harnesses that build a bare manager have no invasion system to watch
    if (!this.invasionSystem || !this.nestAlert || this.humanPlayer || this.crystal || this.tutorialCalm) return; // no nest to alert about, or the tutorial's calm
    // A few looks a second is plenty for an alert, and keeps the queries off every tick
    this.nestAlertClock += dt;
    if (this.nestAlertClock < NEST_SAMPLE_SECONDS) return;
    const elapsed = this.nestAlertClock;
    this.nestAlertClock = 0;
    const event = this.nestAlert.update(elapsed, this.sampleNest());
    if (event && event !== 'cleared') {
      emitAudio({ type: 'nestAlarm' });
      this.renderSystem.triggerAlarm?.();
    }
  }

  /** Where the coming or ongoing wave is on one layer — minimap pings */
  getWaveThreats(layer: 'surface' | 'underground'): WaveThreat[] {
    return this.waves().getInfo().threats.filter((t) => t.layer === layer);
  }

  /** Entrances the colony currently has — every one is also a breach point */
  getUndergroundEntrances(): Array<{ x: number; y: number }> {
    return this.undergroundGrid.getEntrances();
  }

  /** Pending dig orders as tiles — minimap markers */
  getUndergroundDigOrders(): Array<{ x: number; y: number }> {
    return this.excavationSystem.getJobTiles();
  }

  /** Recenter the underground camera on a tile (minimap click-to-navigate) */
  centerUndergroundOn(tileX: number, tileY: number): void {
    this.undergroundCamera.centerOn(tileX * TILE_SIZE, tileY * TILE_SIZE);
  }

  /** Live dots for the minimap. Polled a few times a second, never per frame. */
  getUndergroundEntities(): MinimapEntity[] {
    const out: MinimapEntity[] = [];

    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.LAYER)) {
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Underground) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      out.push({ x: pos.x, y: pos.y, kind: ant.role });
    }

    for (const id of this.world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.POSITION)) {
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      out.push({ x: pos.x, y: pos.y, kind: 'queen' });
    }

    // Beetles underground are wave invaders — the single most urgent dot
    for (const id of this.world.query(COMPONENT.BEETLE, COMPONENT.POSITION, COMPONENT.LAYER)) {
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Underground) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      out.push({ x: pos.x, y: pos.y, kind: 'invader' });
    }

    return out;
  }

  // ── Surface minimap ────────────────────────────────────────────────

  /** Surface terrain (static after world generation) — minimap base layer */
  getSurfaceGrid(): TileGrid {
    return this.grid;
  }

  /** Fog state: explored tiles and current brightness (read-only) */
  getSurfaceFog(): VisibilityReader {
    return this.visibilityGrid;
  }

  /** Surface camera viewport as a tile rect — the minimap "you are here" box */
  getSurfaceView(): { x: number; y: number; w: number; h: number } {
    return this.camera.getViewRectTiles();
  }

  /** Recenter the surface camera on a tile (minimap click-to-navigate) */
  centerSurfaceOn(tileX: number, tileY: number): void {
    if (this.camera.isDirected()) return; // the intro cinematic owns the camera
    this.camera.centerOn(tileX * TILE_SIZE, tileY * TILE_SIZE);
  }

  /**
   * Live markers for the surface minimap: the colony's surface ants, enemies
   * only where the fog is clear (the same rule the renderer uses), and dens
   * and food on explored ground. Polled a few times a second, never per frame.
   */
  getSurfaceMinimapDots(): SurfaceMinimapDot[] {
    const out: SurfaceMinimapDot[] = [];
    const fog = this.visibilityGrid;
    const onSurface = (id: EntityId) => {
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      return !layer || layer.layer === Layer.Surface;
    };
    const explored = (pos: PositionComponent) => fog.isExplored(Math.floor(pos.x), Math.floor(pos.y));

    for (const id of this.world.query(COMPONENT.FOOD_SOURCE, COMPONENT.POSITION)) {
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      if (explored(pos)) out.push({ x: pos.x, y: pos.y, kind: 'food' });
    }
    // The player's own base and units (Human or Crystal) read as home and friends, never as enemies
    const mine = (id: EntityId) => ownerOf(this.world, id) === FactionId.PLAYER;
    for (const component of [COMPONENT.BEETLE_DEN, COMPONENT.CRICKET_DEN, COMPONENT.CRYSTAL_HIVE, COMPONENT.CRYSTAL_SPIRE, HUMAN_COMPONENT.BUILDING]) {
      for (const id of this.world.query(component, COMPONENT.POSITION)) {
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        // The player's own base: its core reads as home, a Crystal player's spires as friends
        if (mine(id)) out.push({ x: pos.x, y: pos.y, kind: component === COMPONENT.CRYSTAL_SPIRE ? 'ant' : 'nest' });
        else if (explored(pos)) out.push({ x: pos.x, y: pos.y, kind: 'den' });
      }
    }
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.POSITION)) {
      if (!onSurface(id)) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      out.push({ x: pos.x, y: pos.y, kind: 'ant' });
    }
    for (const component of [COMPONENT.BEETLE, COMPONENT.CRICKET, COMPONENT.CRYSTAL_UNIT, HUMAN_COMPONENT.UNIT]) {
      for (const id of this.world.query(component, COMPONENT.POSITION)) {
        if (!onSurface(id)) continue;
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        if (mine(id)) out.push({ x: pos.x, y: pos.y, kind: 'ant' });
        else if (isTileVisible(fog, Math.floor(pos.x), Math.floor(pos.y))) out.push({ x: pos.x, y: pos.y, kind: 'enemy' });
      }
    }
    for (const id of this.world.query(COMPONENT.NEST, COMPONENT.POSITION)) {
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      out.push({ x: pos.x, y: pos.y, kind: 'nest' });
    }
    return out;
  }

  getQueenStats(): { health: number; maxHealth: number; hunger: number; maxHunger: number; isLaying: boolean } | null {
    const queens = this.world.query(COMPONENT.QUEEN_ENTITY);
    if (queens.length === 0) return null;

    const queenId = queens[0];
    const queenComp = this.world.getComponent<QueenEntityComponent>(queenId, COMPONENT.QUEEN_ENTITY)!;
    const health = this.world.getComponent<HealthComponent>(queenId, COMPONENT.HEALTH);
    const eggQueue = this.world.getComponent<EggQueueComponent>(queenId, COMPONENT.EGG_QUEUE);

    return {
      health: health?.current ?? 0,
      maxHealth: health?.max ?? 0,
      hunger: queenComp.hunger,
      maxHunger: queenComp.maxHunger,
      isLaying: eggQueue ? eggQueue.currentlyLaying : false,
    };
  }

  getBroodSnapshot(): BroodSnapshot {
    const stored = this.undergroundGrid.getPantryStored();
    const nestId = this.world.query(COMPONENT.NEST)[0];
    const nest = nestId !== undefined ? this.world.getComponent<NestComponent>(nestId, COMPONENT.NEST) : undefined;

    const queenId = this.world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.EGG_QUEUE)[0];
    const queen = queenId !== undefined ? this.world.getComponent<QueenEntityComponent>(queenId, COMPONENT.QUEEN_ENTITY) : undefined;
    const eggQueue = queenId !== undefined ? this.world.getComponent<EggQueueComponent>(queenId, COMPONENT.EGG_QUEUE) : undefined;

    // Same placement rule as EggIncubationSystem and the nurses' free-slot search
    const eggsPerTile = new Map<number, number>();
    const eggs: BroodSnapshot['eggs'] = [];
    for (const id of this.world.query(COMPONENT.EGG, COMPONENT.POSITION)) {
      const egg = this.world.getComponent<EggComponent>(id, COMPONENT.EGG)!;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const tx = Math.floor(pos.x);
      const ty = Math.floor(pos.y);
      const key = ty * this.undergroundGrid.width + tx;
      eggsPerTile.set(key, (eggsPerTile.get(key) ?? 0) + 1);
      eggs.push({
        role: egg.role,
        progress: egg.hatchTime > 0 ? 1 - egg.hatchTimer / egg.hatchTime : 1,
        fedProgress: egg.requiredFood > 0 ? egg.fedAmount / egg.requiredFood : 1,
        remaining: Math.max(0, egg.hatchTimer),
        incubating: this.undergroundGrid.getTile(tx, ty)?.chamberType === ChamberType.Incubation,
      });
    }

    let incubationTiles = 0;
    let freeSlots = 0;
    const perTile = eggsPerIncubationTile(this.world.upgradeLevels);
    for (let y = 0; y < this.undergroundGrid.height; y++) {
      for (let x = 0; x < this.undergroundGrid.width; x++) {
        const tile = this.undergroundGrid.getTile(x, y);
        if (!tile || !tile.walkable || tile.chamberType !== ChamberType.Incubation) continue;
        incubationTiles++;
        freeSlots += Math.max(0, perTile - (eggsPerTile.get(y * this.undergroundGrid.width + x) ?? 0));
      }
    }

    let nurses = 0;
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.LAYER)) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (ant.role === AntRole.Nurse && layer.layer === Layer.Underground) nurses++;
    }
    const workers = this.countWorkers();

    return {
      pantry: {
        stored: stored.total,
        capacity: this.undergroundGrid.getPantryCapacity() + this.undergroundGrid.getFarmCapacity(),
        tiles: this.undergroundGrid.getPantryTiles().length,
      },
      surfaceStock: nest ? Math.floor(nest.foodStored) : 0,
      hasQueen: queen !== undefined,
      queenCanLay: queen !== undefined && queen.hunger >= QUEEN_MIN_HUNGER_TO_LAY,
      queue: (eggQueue?.queue ?? []).map((e) => ({
        role: e.role,
        progress: e.layTimerTotal > 0 ? 1 - e.layTimer / e.layTimerTotal : 0,
      })),
      maxQueuedPerRole: eggQueue?.maxPerType ?? 0,
      eggs,
      incubation: { tiles: incubationTiles, freeSlots },
      nurses,
      workers,
      costs: {
        [AntRole.Worker]: this.getBreedCost(AntRole.Worker),
        [AntRole.Soldier]: this.getBreedCost(AntRole.Soldier),
        [AntRole.Scout]: this.getBreedCost(AntRole.Scout),
        [AntRole.Nurse]: this.getBreedCost(AntRole.Nurse),
        [AntRole.Defender]: this.getBreedCost(AntRole.Defender),
      },
    };
  }

  getColonyFood(): { total: number; leaves: number; mushrooms: number; meat: number } {
    const stored = this.undergroundGrid.getPantryStored();
    return {
      total: Math.floor(stored.total),
      leaves: Math.floor(stored.leaf),
      mushrooms: Math.floor(stored.mushroom),
      meat: Math.floor(stored.meat),
    };
  }

  /** Two or more selected ants: counts per caste and the wireframe cells. */
  getSelectedGroup(): SelectedGroupInfo | null {
    // Ants and Crystal units: a Human player's group is summed up in HumanPlayerStats.group
    const ids = this.selectionSystem.getSelectedAnts().filter((id) => this.world.getComponent(id, HUMAN_COMPONENT.UNIT) === undefined);
    if (ids.length < 2) return null;
    const byRole: Partial<Record<AntRole, number>> = {};
    const units: SelectedGroupInfo['units'] = [];
    let ordered = 0;
    for (const id of ids) {
      // A Crystal unit counts as a fighter here; the Crystal HUD reads its own kinds
      const role = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)?.role ?? AntRole.Soldier;
      const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
      const hasOrder = hasActiveOrder(this.world, id);
      byRole[role] = (byRole[role] ?? 0) + 1;
      if (hasOrder) ordered++;
      units.push({
        id,
        role,
        health: health ? Math.max(0, Math.min(1, health.current / Math.max(1, health.max))) : 1,
        ordered: hasOrder,
      });
    }
    units.sort((a, b) => GROUP_ROLE_ORDER.indexOf(a.role) - GROUP_ROLE_ORDER.indexOf(b.role) || a.id - b.id);
    return { count: ids.length, byRole, ordered, units: units.slice(0, GROUP_GRID_MAX) };
  }

  getSelectedEntity(): SelectedEntityInfo | null {
    const selectedId = this.selectionSystem.getSelectedEntityId();
    if (selectedId === null) return null;

    // Check what type of entity it is
    const pos = this.world.getComponent<PositionComponent>(selectedId, COMPONENT.POSITION);
    if (!pos) return null;

    // Check if it's an ant
    const ant = this.world.getComponent<AntComponent>(selectedId, COMPONENT.ANT);
    if (ant) {
      const health = this.world.getComponent<HealthComponent>(selectedId, COMPONENT.HEALTH);
      const hunger = this.world.getComponent<HungerComponent>(selectedId, COMPONENT.HUNGER);
      const carrying = this.world.getComponent<CarryingComponent>(selectedId, COMPONENT.CARRYING);

      return {
        entityId: selectedId,
        type: 'ant',
        position: { x: Math.round(pos.x), y: Math.round(pos.y) },
        role: ant.role,
        state: ant.state,
        health: health ? { current: health.current, max: health.max } : undefined,
        hunger: hunger ? { current: hunger.current, max: hunger.max } : undefined,
        carrying: carrying ? { type: carrying.resourceType, amount: carrying.amount } : undefined,
        antStats: antStatLines(this.world, selectedId),
      };
    }

    // Check if it's a beetle
    const beetle = this.world.getComponent<BeetleComponent>(selectedId, COMPONENT.BEETLE);
    if (beetle) {
      const health = this.world.getComponent<HealthComponent>(selectedId, COMPONENT.HEALTH);
      return {
        entityId: selectedId,
        type: 'beetle',
        position: { x: Math.round(pos.x), y: Math.round(pos.y) },
        beetleState: beetle.state,
        beetleHealth: health ? { current: health.current, max: health.max } : undefined,
      };
    }

    // Check if it's a beetle den
    const beetleDen = this.world.getComponent<BeetleDenComponent>(selectedId, COMPONENT.BEETLE_DEN);
    if (beetleDen) {
      return {
        entityId: selectedId,
        type: 'beetle_den',
        position: { x: Math.round(pos.x), y: Math.round(pos.y) },
        denHealth: { current: beetleDen.health, max: beetleDen.maxHealth },
        denActiveBeetles: beetleDen.activeBeetles,
        denMaxBeetles: beetleDen.maxBeetles,
      };
    }

    // Check if it's a cricket
    const cricket = this.world.getComponent<CricketComponent>(selectedId, COMPONENT.CRICKET);
    if (cricket) {
      const health = this.world.getComponent<HealthComponent>(selectedId, COMPONENT.HEALTH);
      return {
        entityId: selectedId,
        type: 'cricket',
        position: { x: Math.round(pos.x), y: Math.round(pos.y) },
        cricketState: cricket.state,
        cricketHealth: health ? { current: health.current, max: health.max } : undefined,
      };
    }

    // Check if it's a cricket den
    const cricketDen = this.world.getComponent<CricketDenComponent>(selectedId, COMPONENT.CRICKET_DEN);
    if (cricketDen) {
      return {
        entityId: selectedId,
        type: 'cricket_den',
        position: { x: Math.round(pos.x), y: Math.round(pos.y) },
        cricketDenHealth: { current: cricketDen.health, max: cricketDen.maxHealth },
        cricketDenActiveCrickets: cricketDen.activeCrickets,
      };
    }

    // The rival's base: same card as a den (health and the attack wave), plus its shield and economy
    const shieldOf = () => {
      const shield = this.world.getComponent<ShieldComponent>(selectedId, COMPONENT.SHIELD);
      return shield ? { current: shield.current, max: shield.max } : undefined;
    };
    if (this.world.getComponent(selectedId, COMPONENT.CRYSTAL_HIVE)) {
      const health = this.world.getComponent<HealthComponent>(selectedId, COMPONENT.HEALTH);
      return {
        entityId: selectedId,
        type: 'crystal_hive',
        position: { x: Math.round(pos.x), y: Math.round(pos.y) },
        hiveHealth: health ? { current: health.current, max: health.max } : undefined,
        shield: shieldOf(),
        ...(ownerOf(this.world, selectedId) === FactionId.PLAYER ? { owned: true } : { rival: this.crystalRival?.snapshot() }),
      };
    }

    // A Crystal unit or spire: name, shield and health
    const crystalUnit = this.world.getComponent<CrystalUnitComponent>(selectedId, COMPONENT.CRYSTAL_UNIT);
    const spire = this.world.getComponent<CrystalSpireComponent>(selectedId, COMPONENT.CRYSTAL_SPIRE);
    if (crystalUnit || spire) {
      const health = this.world.getComponent<HealthComponent>(selectedId, COMPONENT.HEALTH);
      return {
        entityId: selectedId,
        type: crystalUnit ? 'crystal_unit' : 'crystal_spire',
        position: { x: Math.round(pos.x), y: Math.round(pos.y) },
        health: health ? { current: health.current, max: health.max } : undefined,
        shield: shieldOf(),
        ...(crystalUnit ? { crystalKind: crystalUnit.kind, crystalState: crystalUnit.state } : {}),
        ...(ownerOf(this.world, selectedId) === FactionId.PLAYER ? { owned: true } : {}),
        ...(spire ? { spireKind: spire.kind, spireFloors: spire.floors } : {}),
      };
    }

    // A Human unit or building: its card says what it is and does
    const human = humanSelection(this.world, selectedId);
    if (human) {
      return {
        entityId: selectedId,
        type: human.building ? 'human_building' : 'human_unit',
        position: { x: Math.round(pos.x), y: Math.round(pos.y) },
        human,
      };
    }

    // Check if it's food
    const food = this.world.getComponent<FoodSourceComponent>(selectedId, COMPONENT.FOOD_SOURCE);
    if (food) {
      return {
        entityId: selectedId,
        type: 'food',
        position: { x: Math.round(pos.x), y: Math.round(pos.y) },
        foodAmount: food.amount,
        foodType: food.resourceType || 'leaf',
        foodMax: Math.max(food.amount, food.maxAmount ?? food.amount),
        workers: this.gatherersOf(selectedId),
      };
    }

    // A mineral node: ore left and the workers mining it
    const mineral = this.world.getComponent<MineralComponent>(selectedId, COMPONENT.MINERAL);
    if (mineral) {
      return {
        entityId: selectedId,
        type: 'mineral',
        position: { x: Math.round(pos.x), y: Math.round(pos.y) },
        mineralAmount: mineral.amount,
        mineralMax: mineral.maxAmount,
        workers: minersOn(this.world, selectedId),
      };
    }

    // Check if it's the nest
    const nest = this.world.getComponent<NestComponent>(selectedId, COMPONENT.NEST);
    if (nest) {
      const ants = this.world.query(COMPONENT.ANT);
      return {
        entityId: selectedId,
        type: 'nest',
        position: { x: Math.round(pos.x), y: Math.round(pos.y) },
        foodStored: nest.foodStored,
        pantryStored: Math.floor(this.undergroundGrid.getPantryStored().total),
        pantryCapacity: this.undergroundGrid.getPantryCapacity() + this.undergroundGrid.getFarmCapacity(),
        mushroomStored: nest.mushroomStored,
        meatStored: nest.meatStored,
        totalAnts: ants.length,
      };
    }

    return null;
  }

  /**
   * Food headed for the pantry: the entrance pile and the food in the jaws of
   * workers, soldiers and scouts (nurses carry food already taken out of the
   * pantry; ore is not food). `types` are the food types among it.
   */
  private foodOnItsWay(nests: EntityId[]): { entrance: number; carried: number; types: PantryFoodType[] } {
    let entrance = 0;
    const types = new Set<PantryFoodType>();
    for (const id of nests) {
      const nest = this.world.getComponent<NestComponent>(id, COMPONENT.NEST);
      if (!nest) continue;
      entrance += nest.foodStored;
      if (nest.mushroomStored >= 1) types.add('mushroom');
      if (nest.meatStored >= 1) types.add('meat');
      if (nest.foodStored - nest.mushroomStored - nest.meatStored >= 1) types.add('leaf');
    }
    let carried = 0;
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.CARRYING)) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      const load = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;
      if (ant.role === AntRole.Nurse || load.amount <= 0 || !load.resourceType || isOreLoad(load.resourceType)) continue;
      carried += load.amount;
      types.add(load.resourceType === 'mushroom' || load.resourceType === 'meat' ? load.resourceType : 'leaf');
    }
    return { entrance, carried, types: [...types] };
  }

  /** Workers taking food from this source now: on a Recolectar order or walking to it on their own. */
  private gatherersOf(foodId: EntityId): number {
    let n = workersOrderedTo(this.world, foodId, 'gather');
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.PATH)) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.resourceOrder === 'gather' || ant.state !== AntState.GoingToFood) continue;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
      const goal = path.waypoints[path.waypoints.length - 1];
      const at = this.world.getComponent<PositionComponent>(foodId, COMPONENT.POSITION);
      if (goal && at && Math.hypot(goal.x - at.x, goal.y - at.y) < 1.5) n++;
    }
    return n;
  }

  getStats(): GameStats {
    const ants = this.world.query(COMPONENT.ANT);
    const nests = this.world.query(COMPONENT.NEST);
    const pantryStored = this.undergroundGrid.getPantryStored();
    const transit = this.foodOnItsWay(nests);

    // Count ants by role
    let workerCount = 0;
    let soldierCount = 0;
    let scoutCount = 0;
    let nurseCount = 0;
    let defenderCount = 0;
    let antsWaitingForPantry = 0;

    for (const id of ants) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT);
      if (ant) {
        if (ant.state === AntState.WaitingForPantry) antsWaitingForPantry++;
        switch (ant.role) {
          case AntRole.Worker:
            workerCount++;
            break;
          case AntRole.Soldier:
            soldierCount++;
            break;
          case AntRole.Scout:
            scoutCount++;
            break;
          case AntRole.Nurse:
            nurseCount++;
            break;
          case AntRole.Defender:
            defenderCount++;
            break;
        }
      }
    }

    // Soldiers free for the den attack: on the surface, no player order, idling, foraging or patrolling
    let availableSoldiers = 0;
    for (const id of ants) {
      if (isFreeSoldier(this.world, id)) availableSoldiers++;
    }

    return {
      antCount: ants.length,
      workerCount,
      soldierCount,
      scoutCount,
      nurseCount,
      defenderCount,
      // The food totals are the pantry: the only food that pays for eggs
      foodStored: Math.floor(pantryStored.total),
      mushroomStored: Math.floor(pantryStored.mushroom),
      meatStored: Math.floor(pantryStored.meat),
      pantryStored: Math.floor(pantryStored.total),
      entranceFoodStored: Math.floor(transit.entrance),
      foodInTransit: Math.floor(transit.entrance + transit.carried),
      pantryFull: !this.undergroundGrid.hasDepositSpace() || transit.types.some((type) => !this.undergroundGrid.hasDepositSpace([type])),
      antsWaitingForPantry,
      pantryCapacity: this.undergroundGrid.getPantryCapacity() + this.undergroundGrid.getFarmCapacity(),
      mineralsStored: Math.floor(this.world.minerals.stored),
      miners: this.minerStats(),
      upgradesAffordable: this.humanPlayer ? 0 : affordableCount(this.world.upgradeLevels, this.upgradeFunds()),
      beetleCount: this.world.query(COMPONENT.BEETLE).length,
      beetleDenCount: this.world.query(COMPONENT.BEETLE_DEN).length,
      cricketCount: this.world.query(COMPONENT.CRICKET).length,
      cricketDenCount: this.world.query(COMPONENT.CRICKET_DEN).length,
      availableSoldiers,
      activeLayer: this.activeLayer,
      tickCount: this.gameLoop.getTickCount(),
      paused: this.gameLoop.isPaused(),
      speed: this.gameLoop.getSpeed(),
      zoom: this.camera.getZoom(),
      colonyPriority: this.getColonyPriority(),
      breeding: this.getBreedingStatus(),
      selectedEntity: this.getSelectedEntity(),
      selectedGroup: this.getSelectedGroup(),
      commandTarget: this.selectionSystem.getSelectedAnts().length > 0 ? this.armedCommand : null,
      areaSelect: this.areaSelect,
      dig: this.activeLayer === 'underground' ? this.getDigStatus() : null,
      defenseBuild: this.defenseBuild,
      controlGroups: this.getControlGroups(),
      quickSelect: quickSelectInfo(
        this.world,
        this.activeLayerValue(),
        this.selectionSystem.getSelectedAnts(),
        this.humanPlayer ? HUMAN_QUICK_SELECT_KINDS : this.crystal ? CRYSTAL_QUICK_SELECT_KINDS : QUICK_SELECT_KINDS,
      ),
      notifications: this.getActiveNotifications(),
      objective: this.humanPlayer ? null : this.crystal ? this.crystal.objective() : this.objectiveSystem.getState(),
      invasion: this.waves().getInfo(),
      nestAlert: this.humanPlayer || this.crystal ? undefined : this.nestAlert.getState(),
      gameOver: this.gameOver,
      milestone: this.milestone?.info ?? null,
      activeEvents: this.eventSystem.active.map((e) => ({
        icon: e.definition.icon,
        name: e.definition.name,
        remaining: Math.ceil(e.remainingTime),
      })),
      dayPhase: this.dayNightSystem.getPhase(),
      dayNumber: this.dayNightSystem.getDayNumber(),
      phaseRemaining: Math.ceil(this.dayNightSystem.getPhaseRemaining()),
      mutationOffer: this.mutationOffer,
      mutationSelection: this.mutationSelection,
      lastMutationPick: this.lastMutationPick,
      introPlaying: this.introClock.isPlaying(),
      crystal: this.crystal?.snapshot(this.selectionSystem.getSelectedEntityId(), this.selectionSystem.getSelectedAnts()) ?? null,
      human: this.humanPlayer?.stats() ?? null,
    };
  }

  private minerStats(): GameStats['miners'] {
    const status = this.antAISystem.getMinerStatus();
    return { count: status.miners, target: status.target, auto: status.auto, ordered: status.ordered };
  }

  /** A Humans run's base (build, train, rally), for the HUD; null when the player is the Swarm */
  getHumanPlayer(): HumanPlayerRun | null {
    return this.humanPlayer;
  }

  /** Prune expired notifications and return the live ones (newest last) */
  private getActiveNotifications(): GameNotification[] {
    const now = Date.now();
    const ttl = 6500; // ms a notification stays on screen
    this.world.notifications = this.world.notifications.filter(n => now - n.createdAt < ttl);
    return [...this.world.notifications];
  }

  /**
   * Atacar guarida: the `soldierCount` free soldiers closest to the den get a
   * real attack order on it, the same order a right-click gives. Returns how
   * many were sent.
   */
  dispatchAttackWave(targetEntityId: EntityId, soldierCount: number): number {
    const sent = dispatchDenAttack(this.world, this.grid, targetEntityId, soldierCount, this.transitSystem);
    const den = this.world.getComponent<PositionComponent>(targetEntityId, COMPONENT.POSITION);
    if (sent.length > 0 && den) {
      this.orderPings.push({ x: Math.round(den.x), y: Math.round(den.y), kind: 'attack', targetId: targetEntityId });
    }
    if (sent.length > 0) {
      emitAudio({ type: 'order', kind: 'attack' });
      this.emitOrderFeedback('attack', sent, targetEntityId);
    }
    return sent.length;
  }
}
