import { RunModifiers } from './run/RunModifiers';
import type { MutationId } from './run/MutationDefinitions';
import { antSpawnStats } from './run/antStats';
import { buildMutationOffer, shouldOfferMutation, summarizeMutationBuild, type MutationBuildEntry, type MutationOffer } from './run/DawnPick';
import { createSeededRng, offerMutations } from './run/MutationOffers';
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
import { UndergroundGrid } from '../simulation/world/UndergroundGrid';
import { TerrainType, ChamberType } from '../simulation/world/types';
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
import { BreedingSystem } from './systems/BreedingSystem';
import { SelectionSystem, type SelectionBox } from './systems/SelectionSystem';
import { ControlGroups } from './systems/ControlGroups';
import {
  dispatchDenAttack,
  findEnemyAt,
  hasActiveOrder,
  isFreeSoldier,
  issueAttackOrders,
  issueHoldOrders,
  issueMoveOrders,
  soundRetreatHorn,
  stopAnts,
} from './systems/helpers/playerOrders';
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
import { UndergroundHealingSystem } from './systems/UndergroundHealingSystem';
import { resolveRunOutcome, type RunOutcome } from './run/RunOutcome';
import { DayNightSystem, type DayPhase } from './systems/DayNightSystem';
import { DefenderAISystem } from './systems/DefenderAISystem';
import { IntroDirector } from './render/IntroDirector';
import { IntroClock } from './render/introTimeline';
import { audioIntroFrame, audioRunEnded, audioRunStarted, emitAudio } from '../audio';
import { selectionAudio } from '../audio/gameHooks';
import { createAnt, createFood, createMineral, createNest, createBeetleDen, createQueen, createCrystalHive } from './entities/factories';
import { CrystalHiveSystem } from './systems/CrystalHiveSystem';
import { CrystalUnitAISystem } from './systems/CrystalUnitAISystem';
import { CrystalRivalSystem, type CrystalRivalSnapshot } from './systems/CrystalRivalSystem';
import type { ShieldComponent } from './rival/crystalShield';
import { CrystalShieldSystem } from './systems/CrystalShieldSystem';
import { DEFAULT_RUN_SETUP, type RunSetup } from './run/RunSetup';
import { FactionId, FactionRegistry, defaultFactions } from './factions/factions';
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
  type HealthComponent,
  type BeetleComponent,
  type BeetleDenComponent,
  type CricketComponent,
  type CricketDenComponent,
  type EggQueueComponent,
  type CombatComponent,
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
  INITIAL_FOOD_CLUSTERS,
  FOOD_PER_CLUSTER_MIN,
  FOOD_PER_CLUSTER_MAX,
  FOOD_AMOUNT_MIN,
  FOOD_AMOUNT_MAX,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TILE_SIZE,
  BREED_COST_WORKER,
  BREED_COST_SOLDIER,
  BREED_COST_SCOUT,
  BREED_COST_NURSE,
  BREED_COST_DEFENDER,
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
  QUEEN_EGG_LAY_TIME,
  QUEEN_MIN_HUNGER_TO_LAY,
  MAX_EGGS_PER_INCUBATION_TILE,
  PANTRY_STORAGE_UPGRADE_PER_TILE,
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
/** Mixed into the run seed so the mineral fields draw from their own stream. */
const MINERAL_SEED_SALT = 0x85ebca6b;

/** A command card order that waits for a click: Mover (Q) or Atacar (A). */
export type CommandTarget = 'move' | 'attack';

export interface SelectedEntityInfo {
  entityId: EntityId;
  type: 'ant' | 'food' | 'nest' | 'beetle' | 'beetle_den' | 'cricket' | 'cricket_den' | 'crystal_hive' | 'crystal_unit' | 'crystal_spire';
  position: { x: number; y: number };
  // Ant-specific
  role?: AntRole;
  state?: AntState;
  health?: { current: number; max: number };
  hunger?: { current: number; max: number };
  carrying?: { type: string | null; amount: number };
  // Food-specific
  foodAmount?: number;
  foodType?: string;
  // Nest-specific
  foodStored?: number;
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
const NO_MODIFIERS: InputModifiers = { shift: false, ctrl: false };
const GROUP_ROLE_ORDER: readonly AntRole[] = [AntRole.Soldier, AntRole.Defender, AntRole.Worker, AntRole.Scout, AntRole.Nurse];

export interface GameNotification {
  id: number;
  severity: 'info' | 'success' | 'warning' | 'danger';
  message: string;
  createdAt: number;
}

export type UpgradeId = 'carry' | 'damage' | 'storage' | 'dig' | 'porters' | 'heal';

export interface UpgradeInfo {
  id: UpgradeId;
  name: string;
  description: string;
  level: number;
  maxLevel: number;
  nextCost: number | null;
}

// Upgrade costs are paid in MUSHROOMS — the farm is the colony's tech economy:
// leaves feed bellies, mushrooms buy progress
const UPGRADE_COSTS = [40, 80, 140];

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
}

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

export interface GameStats {
  antCount: number;
  workerCount: number;
  soldierCount: number;
  scoutCount: number;
  nurseCount: number;
  defenderCount: number;
  foodStored: number;
  mushroomStored: number;
  meatStored: number;
  pantryStored: number;
  pantryCapacity: number;
  /** Food on the pile at the nest entrance, still waiting for porters to carry it to the pantry */
  entranceFoodStored: number;
  /** The minerals bank: what miners delivered, the currency for structures */
  mineralsStored: number;
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
  /** Bound control groups, by digit */
  controlGroups?: ControlGroupInfo[];
  notifications: GameNotification[];
  objective: ObjectiveState | null;
  invasion: InvasionInfo;
  gameOver: GameOverStats | null;
  activeEvents: Array<{ icon: string; name: string; remaining: number }>;
  dayPhase: 'day' | 'night';
  dayNumber: number;
  phaseRemaining: number; // seconds left in the current phase
  /** Pending dawn pick; the simulation stays paused while it is set. */
  mutationOffer: MutationOffer | null;
  lastMutationPick: MutationId | null;
  /** True while the opening cinematic plays: the HUD stays hidden and the world takes the whole window. */
  introPlaying: boolean;
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
  costs: Record<AntRole, number>;
}

export class GameManager {
  private readonly runModifiers = new RunModifiers();
  /** Chosen once per run; every dawn offer of the run is drawn from it. */
  private readonly runSeed = Math.floor(Math.random() * 0x100000000);
  private readonly offerRng = createSeededRng(this.runSeed);
  private mutationOffer: MutationOffer | null = null;
  private lastMutationPick: MutationId | null = null;
  /**
   * Where the opening meteorite struck: a reachable clearing on the far side
   * of the map, fixed for the whole run. The crater decal sits here, the
   * minimap marks it, and the Crystal Hive rises from it (P5).
   */
  private readonly craterSite: TilePos;
  /** The rival Crystal Hive at the crater; destroying it wins the run */
  private rivalHiveId: EntityId | null = null;
  /** The player's race and the rival picked before the run */
  private readonly runSetup: RunSetup;
  /** The full Crystal Hive rival (only when the rival is the Colmena de Cristal) */
  private crystalRival: CrystalRivalSystem | null = null;
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
  private gameOver: GameOverStats | null = null;
  private upgradeLevels: Record<UpgradeId, number> = { carry: 0, damage: 0, storage: 0, dig: 0, porters: 0, heal: 0 };
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
  /** Mover or Atacar was pressed: the next left click on the surface is that order's target */
  private armedCommand: CommandTarget | null = null;
  /** Order pings for the renderer (tile coords), drained every frame */
  private orderPings: OrderPing[] = [];
  /** Ctrl+digit groups of own ants */
  private readonly controlGroups = new ControlGroups();

  constructor(canvas: HTMLCanvasElement, setup: RunSetup = DEFAULT_RUN_SETUP) {
    this.canvas = canvas;
    this.runSetup = setup;
    const crystalRival = setup.rivalRace === 'crystal';
    this.world = new World(this.runModifiers, new FactionRegistry([
      ...defaultFactions(),
      ...(crystalRival ? [{ id: FactionId.RIVAL, race: 'crystal' as const, controller: 'ai' as const }] : []),
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
    const breedingSystem = new BreedingSystem(this.world);
    this.selectionSystem = new SelectionSystem(this.world);
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
    this.invasionSystem = new UndergroundInvasionSystem(
      this.world,
      this.undergroundGrid,
      transitSystem,
      this.dayNightSystem
    );
    this.world.addSystem(this.invasionSystem);
    if (crystalRival) this.addCrystalRival();
    // Waves land at nightfall, so the dusk warning doubles as the last call
    this.dayNightSystem.setWaveArmedProvider(() => this.invasionSystem.getInfo().armed);
    this.world.addSystem(new SpoilageSystem(this.world));
    this.fungusFarmSystem = new FungusFarmSystem(this.world, this.undergroundGrid);
    this.world.addSystem(this.fungusFarmSystem);
    // Farm tiles pulse while producing — render needs to know the farm state
    this.renderSystem.setFarmStatusProvider(() => this.fungusFarmSystem.getStatus().status);

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
    // Rival Colmena de Cristal: the hive rises from the crater, the rival's base and core.
    // Against Fauna salvaje the crater stays bare.
    if (crystalRival) {
      this.rivalHiveId = createCrystalHive(this.world, this.craterSite.x, this.craterSite.y);
      const rival = this.world.factions.get(FactionId.RIVAL);
      if (rival) rival.coreId = this.rivalHiveId;
    }
    this.renderSystem.startMeteorIntro(this.craterSite, { x: nestX, y: nestY }, this.introClock);
    this.spawnMineralFields({ x: nestX, y: nestY });
    const tileCenter = (tile: TilePos) => ({ x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 });
    // The fireball lights the ground it flies over and the crater, so the chase
    // crosses lit terrain; what it lit stays explored, a scorched trail to the crater
    this.introDirector = new IntroDirector(
      this.camera,
      this.introClock,
      tileCenter({ x: nestX, y: nestY }),
      tileCenter(this.craterSite),
      (x, y, r) => this.visibilityGrid.revealCircle(x, y, r),
    );
    window.addEventListener('keydown', this.skipIntro);
    canvas.addEventListener('pointerdown', this.skipIntro);
    audioRunStarted(() => ({ layer: this.activeLayerValue(), view: this.activeCamera().getViewRectTiles() }));
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
    this.invasionSystem.setRaidSource({
      launch: (count) => crystalHiveSystem.launchRaid(count),
      origin: () => crystalHiveSystem.raidOrigin(),
      launchBoss: () => rival.launchQueen(),
    });
    this.world.addSystem(new CrystalUnitAISystem(this.world, this.grid));
    this.world.addSystem(new CrystalShieldSystem(this.world));
  }

  /** The skirmish this run was started with */
  getRunSetup(): RunSetup {
    return this.runSetup;
  }

  /**
   * Left click (or a finger tap that is not an order): build tools below,
   * the armed card order's target above, else select (a second click on the
   * selected nest goes down into it).
   */
  private handleClick(screenX: number, screenY: number, mods: InputModifiers): void {
    if (this.activeLayer === 'underground') {
      const tile = this.undergroundCamera.screenToTile(screenX, screenY);
      if (this.digMode) {
        this.designateDig(tile.x, tile.y);
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
        }
      }
      return;
    }
    if (this.armedCommand) {
      // Mover or Atacar was pressed: this click is the order's target
      if (this.armedCommand === 'attack') this.attackAt(screenX, screenY);
      else this.commandAt(screenX, screenY);
      return;
    }
    const tile = this.camera.screenToTile(screenX, screenY);
    // Check if clicking on already-selected nest → enter underground
    const currentSelected = this.selectionSystem.getSelectedEntityId();
    if (currentSelected !== null && !mods.shift && !mods.ctrl) {
      const nest = this.world.getComponent<NestComponent>(currentSelected, COMPONENT.NEST);
      if (nest) {
        const pos = this.world.getComponent<PositionComponent>(currentSelected, COMPONENT.POSITION);
        if (pos) {
          const dx = Math.abs(tile.x - Math.round(pos.x));
          const dy = Math.abs(tile.y - Math.round(pos.y));
          if (dx <= 2 && dy <= 2) {
            this.enterUnderground();
            return;
          }
        }
      }
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
    if (this.activeLayer === 'surface' && !this.armedCommand && !this.gameOver && this.selectionSystem.getSelectedAnts().length > 0) {
      const at = this.screenToEntity(screenX, screenY);
      if (this.enemyAt(at) === null && this.selectionSystem.antAt(at.x, at.y, Layer.Surface) !== null) {
        this.clickSelect(screenX, screenY, NO_MODIFIERS);
      } else {
        this.commandAt(screenX, screenY);
      }
      return;
    }
    this.handleClick(screenX, screenY, NO_MODIFIERS);
  }

  /** A finger held on an own ant: it and every ant of its caste on screen (Ctrl+click). */
  private handleLongPress(screenX: number, screenY: number): void {
    if (this.gameOver) return;
    this.armedCommand = null;
    this.clickSelect(screenX, screenY, { shift: false, ctrl: true });
  }

  /** What a one-finger drag does now: paint with a build tool on, a box while Seleccionar área is on, else pan. */
  private touchDragMode(): TouchDragMode {
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
    const tool = this.activeBuildMode();
    if (this.activeLayer !== 'underground' || tool === null) {
      this.paintStroke = null;
      return;
    }
    const tile = this.undergroundCamera.screenToTile(screenX, screenY);
    if (phase === 'start' || !this.paintStroke || this.paintStroke.tool !== tool) {
      const zone = ZONE_OF_TOOL[tool];
      const startTile = this.undergroundGrid.getTile(tile.x, tile.y);
      this.paintStroke = {
        tool,
        erase: zone !== null && startTile?.chamberType === zone,
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
      this.designateDig(x, y);
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

        // Must be far from nest
        const nestPos = this.world.getComponent<PositionComponent>(
          this.world.query(COMPONENT.NEST)[0],
          COMPONENT.POSITION
        );
        if (!nestPos) continue;
        const dx = x - nestPos.x;
        const dy = y - nestPos.y;
        const distToNest = Math.sqrt(dx * dx + dy * dy);
        if (distToNest < BEETLE_DEN_MIN_NEST_DISTANCE) continue;

        createBeetleDen(this.world, x, y);
        break;
      }
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
    try {
      this.world.update(dt);
    } catch (e) {
      console.error('[GameManager] System update error:', e);
    }

    this.checkGameOver(previousPhase);
    const dayPhase = this.dayNightSystem.getPhase();
    if (shouldOfferMutation(previousPhase, dayPhase, this.dayNightSystem.getDayNumber(), this.gameOver !== null)) {
      this.openMutationOffer();
    }

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

  /** Queen death takes precedence over surviving the final night. */
  private checkGameOver(previousPhase: DayPhase): void {
    if (this.gameOver) return;

    const queens = this.world.query(COMPONENT.QUEEN_ENTITY);
    let queenDead = queens.length === 0;
    if (!queenDead) {
      const health = this.world.getComponent<HealthComponent>(queens[0], COMPONENT.HEALTH);
      if (health && health.current <= 0) queenDead = true;
    }
    const hiveDestroyed = this.rivalHiveId != null && !this.world.hasEntity(this.rivalHiveId);
    const outcome = resolveRunOutcome(
      null,
      !queenDead,
      previousPhase,
      this.dayNightSystem.getPhase(),
      this.dayNightSystem.getDayNumber(),
      hiveDestroyed,
    );
    if (!outcome) return;

    this.gameOver = {
      outcome,
      survivedTicks: this.gameLoop.getTickCount(),
      antsHatched: this.world.metrics.antsHatched,
      densDestroyed: this.world.metrics.densDestroyed,
      tilesExcavated: this.world.metrics.tilesExcavated,
      wavesRepelled: this.world.metrics.wavesRepelled,
      build: summarizeMutationBuild(this.runModifiers.getAppliedMutations()),
      ...(outcome === 'victory' && hiveDestroyed ? { hiveDestroyed: true as const } : {}),
    };
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
    emitAudio({ type: 'dawnOffer' });
    this.gameLoop.setPaused(true);
    this.publishStats();
  }

  /**
   * Digit keys. While the evolution chamber is open, 1-3 pick a card and
   * nothing else happens. Otherwise Ctrl+digit binds the selected ants to that
   * control group, Shift+digit adds them, and the digit alone recalls it. A
   * held key's auto-repeat is ignored.
   */
  private handleDigitKey(slot: number, press: KeyPress): void {
    if (press.repeat) return;
    if (this.mutationOffer) {
      const option = this.mutationOffer.options[slot - 1];
      if (option && !press.ctrl && !press.shift) this.chooseMutation(option.id);
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
    const living = this.controlGroups.recall(slot, (id) => this.world.getComponent(id, COMPONENT.ANT) !== undefined);
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
      const ids = this.controlGroups.members(slot).filter((id) => this.world.getComponent(id, COMPONENT.ANT) !== undefined);
      if (ids.length === 0) continue;
      const byRole = new Map<AntRole, number>();
      for (const id of ids) {
        const role = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!.role;
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
    this.orderPings.push({ ...result.target, kind: attack ? 'attack' : 'move' });
    emitAudio({ type: 'order', kind: attack ? 'attack' : 'move' });
    this.publishStats();
    return result.ordered.length;
  }

  /** Order the selected ants to attack one enemy until it dies. Returns how many took the order. */
  orderSelectedAttack(targetId: EntityId): number {
    const ants = this.selectedAntsForOrder();
    if (ants.length === 0) return 0;
    const result = issueAttackOrders(this.world, this.grid, ants, targetId, this.transitSystem);
    if (!result) return 0;
    this.orderPings.push({ ...result.target, kind: 'attack', targetId });
    this.publishStats();
    return result.ordered.length;
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

  /** Right tap (or a click with Mover armed): attack the enemy under the pointer, else move there. */
  private commandAt(screenX: number, screenY: number): void {
    // Orders run on the surface only for now; right-click does nothing below
    if (this.activeLayer !== 'surface') return;
    const at = this.screenToEntity(screenX, screenY);
    const enemy = this.armedCommand === 'move' ? null : this.enemyAt(at);
    if (enemy !== null) this.orderSelectedAttack(enemy);
    else this.orderSelectedMove(Math.round(at.x), Math.round(at.y));
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

    // Spend from the pantry tile piles (leaf → mushroom → meat priority)
    if (!this.deductFromStorage(this.getBreedCost(role))) return false;

    // Add to queue
    eggQueue.queue.push({
      role,
      layTimer: QUEEN_EGG_LAY_TIME,
      layTimerTotal: QUEEN_EGG_LAY_TIME,
    });
    emitAudio({ type: 'eggQueued' });

    return true;
  }

  /** Deduct food from the underground pantry tiles (leaf → mushroom → meat). False if insufficient. */
  private deductFromStorage(cost: number): boolean {
    if (this.undergroundGrid.getPantryStored().total < cost) return false;
    this.undergroundGrid.drainFood(cost);
    return true;
  }

  /** Food cost to breed one ant of this role, including run mutation surcharges. */
  getBreedCost(role: AntRole): number {
    switch (role) {
      case AntRole.Soldier: return BREED_COST_SOLDIER + this.runModifiers.soldierCostBonus;
      case AntRole.Scout: return BREED_COST_SCOUT;
      case AntRole.Nurse: return BREED_COST_NURSE;
      case AntRole.Defender: return BREED_COST_DEFENDER;
      default: return BREED_COST_WORKER;
    }
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
    this.lastMutationPick = option.id;
    emitAudio({ type: 'mutationChosen' });
    this.gameLoop.setPaused(false);
    this.publishStats();
    return true;
  }

  getAppliedMutations(): MutationId[] {
    return this.runModifiers.getAppliedMutations();
  }

  /** Recompute spawn-time stats from base stats so purchase/pick order never compounds rounding. */
  private retrofitAntStats(): void {
    for (const antId of this.world.query(COMPONENT.ANT)) {
      const ant = this.world.getComponent<AntComponent>(antId, COMPONENT.ANT)!;
      const stats = antSpawnStats(this.world, ant.role);
      const hunger = this.world.getComponent<HungerComponent>(antId, COMPONENT.HUNGER);
      if (hunger) {
        hunger.max = stats.maxHunger;
        hunger.current = Math.min(hunger.current, stats.maxHunger);
      }
      if (ant.role === AntRole.Worker) {
        const carrying = this.world.getComponent<CarryingComponent>(antId, COMPONENT.CARRYING);
        if (carrying) carrying.maxCapacity = stats.carryCapacity;
      } else if (ant.role === AntRole.Soldier) {
        const health = this.world.getComponent<HealthComponent>(antId, COMPONENT.HEALTH);
        if (health) {
          // Extra max HP arrives as health, like a newborn's full bar
          health.current = Math.min(stats.maxHealth, health.current + Math.max(0, stats.maxHealth - health.max));
          health.max = stats.maxHealth;
          health.damage = stats.damage;
        }
        const combat = this.world.getComponent<CombatComponent>(antId, COMPONENT.COMBAT);
        if (combat) combat.attackDamage = stats.damage;
      }
    }
  }

  // ── Queen upgrades ────────────────────────────────────────────────

  getUpgrades(): UpgradeInfo[] {
    const defs: Array<{ id: UpgradeId; name: string; description: string }> = [
      { id: 'carry', name: '💪 Obreras fuertes', description: '+25% capacidad de carga por nivel' },
      { id: 'damage', name: '⚔️ Soldados feroces', description: '+25% daño por nivel' },
      { id: 'storage', name: '🏠 Despensa amplia', description: '+15 capacidad por tile por nivel' },
      { id: 'dig', name: '⛏️ Excavación rápida', description: '+30% velocidad de excavación por nivel' },
      { id: 'porters', name: '🐜 Más porteadoras', description: '+1 porteadora simultánea por nivel' },
      { id: 'heal', name: '🌿 Curación veloz', description: '+50% velocidad de curación por nivel' },
    ];
    return defs.map((d) => {
      const level = this.upgradeLevels[d.id];
      return {
        ...d,
        level,
        maxLevel: UPGRADE_COSTS.length,
        nextCost: level < UPGRADE_COSTS.length ? UPGRADE_COSTS[level] : null,
      };
    });
  }

  /** Upgrades cost MUSHROOMS only — drains pantry + farm piles. False if insufficient. */
  private deductMushrooms(cost: number): boolean {
    if (this.undergroundGrid.getPantryStored().mushroom < cost) return false;
    this.undergroundGrid.drainFoodOfType('mushroom', cost);
    return true;
  }

  purchaseUpgrade(id: UpgradeId): boolean {
    const level = this.upgradeLevels[id];
    if (level >= UPGRADE_COSTS.length) return false;
    if (!this.deductMushrooms(UPGRADE_COSTS[level])) return false;

    this.upgradeLevels[id] = level + 1;
    const newLevel = level + 1;

    if (id === 'carry') {
      this.world.upgrades.workerCarryMult = 1 + 0.25 * newLevel;
      this.retrofitAntStats();
      this.world.pushNotification('success', `👑 Mejora: obreras nivel ${newLevel} — cargan más comida`);
    } else if (id === 'damage') {
      this.world.upgrades.soldierDamageMult = 1 + 0.25 * newLevel;
      this.retrofitAntStats();
      this.world.pushNotification('success', `👑 Mejora: soldados nivel ${newLevel} — pegan más fuerte`);
    } else if (id === 'storage') {
      // Flat extra capacity on every pantry tile (scales with excavated pantry size)
      this.undergroundGrid.setPantryTileCapacityBonus(PANTRY_STORAGE_UPGRADE_PER_TILE * newLevel);
      this.world.pushNotification('success', `👑 Mejora: despensa nivel ${newLevel} — +${PANTRY_STORAGE_UPGRADE_PER_TILE} de capacidad por tile`);
    } else if (id === 'dig') {
      this.world.upgrades.digSpeedMult = 1 + 0.3 * newLevel;
      this.world.pushNotification('success', `👑 Mejora: excavación nivel ${newLevel} — las obreras cavan más rápido`);
    } else if (id === 'porters') {
      this.world.upgrades.porterBonus = newLevel;
      this.world.pushNotification('success', `👑 Mejora: logística nivel ${newLevel} — +1 porteadora simultánea`);
    } else {
      this.world.upgrades.healRateMult = 1 + 0.5 * newLevel;
      this.world.pushNotification('success', `👑 Mejora: curación nivel ${newLevel} — las hormigas sanan más rápido`);
    }
    return true;
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

  designateDig(tileX: number, tileY: number): boolean {
    return this.excavationSystem.designateTile(tileX, tileY);
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

  /** Where the coming or ongoing wave is on one layer — minimap pings */
  getWaveThreats(layer: 'surface' | 'underground'): WaveThreat[] {
    return this.invasionSystem.getInfo().threats.filter((t) => t.layer === layer);
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
    for (const component of [COMPONENT.BEETLE_DEN, COMPONENT.CRICKET_DEN, COMPONENT.CRYSTAL_HIVE, COMPONENT.CRYSTAL_SPIRE]) {
      for (const id of this.world.query(component, COMPONENT.POSITION)) {
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        if (explored(pos)) out.push({ x: pos.x, y: pos.y, kind: 'den' });
      }
    }
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.POSITION)) {
      if (!onSurface(id)) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      out.push({ x: pos.x, y: pos.y, kind: 'ant' });
    }
    for (const component of [COMPONENT.BEETLE, COMPONENT.CRICKET, COMPONENT.CRYSTAL_UNIT]) {
      for (const id of this.world.query(component, COMPONENT.POSITION)) {
        if (!onSurface(id)) continue;
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        if (isTileVisible(fog, Math.floor(pos.x), Math.floor(pos.y))) out.push({ x: pos.x, y: pos.y, kind: 'enemy' });
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
    for (let y = 0; y < this.undergroundGrid.height; y++) {
      for (let x = 0; x < this.undergroundGrid.width; x++) {
        const tile = this.undergroundGrid.getTile(x, y);
        if (!tile || !tile.walkable || tile.chamberType !== ChamberType.Incubation) continue;
        incubationTiles++;
        freeSlots += Math.max(0, MAX_EGGS_PER_INCUBATION_TILE - (eggsPerTile.get(y * this.undergroundGrid.width + x) ?? 0));
      }
    }

    let nurses = 0;
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.LAYER)) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (ant.role === AntRole.Nurse && layer.layer === Layer.Underground) nurses++;
    }

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
    const ids = this.selectionSystem.getSelectedAnts();
    if (ids.length < 2) return null;
    const byRole: Partial<Record<AntRole, number>> = {};
    const units: SelectedGroupInfo['units'] = [];
    let ordered = 0;
    for (const id of ids) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
      const hasOrder = hasActiveOrder(this.world, id);
      byRole[ant.role] = (byRole[ant.role] ?? 0) + 1;
      if (hasOrder) ordered++;
      units.push({
        id,
        role: ant.role,
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
        rival: this.crystalRival?.snapshot(),
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
        ...(spire ? { spireKind: spire.kind, spireFloors: spire.floors } : {}),
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
        mushroomStored: nest.mushroomStored,
        meatStored: nest.meatStored,
        totalAnts: ants.length,
      };
    }

    return null;
  }

  getStats(): GameStats {
    const ants = this.world.query(COMPONENT.ANT);
    const nests = this.world.query(COMPONENT.NEST);
    let foodStored = 0;
    let mushroomStored = 0;
    let meatStored = 0;
    for (const id of nests) {
      const nest = this.world.getComponent<NestComponent>(id, COMPONENT.NEST);
      if (nest) {
        foodStored += nest.foodStored;
        mushroomStored += nest.mushroomStored;
        meatStored += nest.meatStored;
      }
    }

    const entranceFoodStored = foodStored;

    // Add underground pantry (tile piles are the source of truth) to total
    const pantryStored = this.undergroundGrid.getPantryStored();
    foodStored += pantryStored.total;
    mushroomStored += pantryStored.mushroom;
    meatStored += pantryStored.meat;

    // Count ants by role
    let workerCount = 0;
    let soldierCount = 0;
    let scoutCount = 0;
    let nurseCount = 0;
    let defenderCount = 0;

    for (const id of ants) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT);
      if (ant) {
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
      foodStored: Math.floor(foodStored),
      mushroomStored: Math.floor(mushroomStored),
      meatStored: Math.floor(meatStored),
      pantryStored: Math.floor(pantryStored.total),
      entranceFoodStored: Math.floor(entranceFoodStored),
      pantryCapacity: this.undergroundGrid.getPantryCapacity() + this.undergroundGrid.getFarmCapacity(),
      mineralsStored: Math.floor(this.world.minerals.stored),
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
      controlGroups: this.getControlGroups(),
      notifications: this.getActiveNotifications(),
      objective: this.objectiveSystem.getState(),
      invasion: this.invasionSystem.getInfo(),
      gameOver: this.gameOver,
      activeEvents: this.eventSystem.active.map((e) => ({
        icon: e.definition.icon,
        name: e.definition.name,
        remaining: Math.ceil(e.remainingTime),
      })),
      dayPhase: this.dayNightSystem.getPhase(),
      dayNumber: this.dayNightSystem.getDayNumber(),
      phaseRemaining: Math.ceil(this.dayNightSystem.getPhaseRemaining()),
      mutationOffer: this.mutationOffer,
      lastMutationPick: this.lastMutationPick,
      introPlaying: this.introClock.isPlaying(),
    };
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
    if (sent.length > 0) emitAudio({ type: 'order', kind: 'attack' });
    return sent.length;
  }
}
