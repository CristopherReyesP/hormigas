import type { EntityId } from '../shared/types';
import { World } from '../engine/ecs/World';
import { GameLoop } from '../engine/loop/GameLoop';
import { CanvasRenderer } from '../engine/renderer/CanvasRenderer';
import { InputManager } from '../engine/input/InputManager';
import { Camera } from '../engine/camera/Camera';
import { TileGrid } from '../simulation/world/TileGrid';
import { VisibilityGrid } from '../simulation/world/VisibilityGrid';
import { UndergroundGrid } from '../simulation/world/UndergroundGrid';
import { TerrainType, ChamberType } from '../simulation/world/types';
import { RenderSystem } from './systems/RenderSystem';
import { MovementSystem } from './systems/MovementSystem';
import { PheromoneSystem } from './systems/PheromoneSystem';
import { AntAISystem } from './systems/AntAISystem';
import { BeetleAISystem } from './systems/BeetleAISystem';
import { CricketAISystem } from './systems/CricketAISystem';
import { CombatSystem } from './systems/CombatSystem';
import { BeetleSpawnSystem } from './systems/BeetleSpawnSystem';
import { CricketSpawnSystem } from './systems/CricketSpawnSystem';
import { HungerSystem } from './systems/HungerSystem';
import { BreedingSystem } from './systems/BreedingSystem';
import { SelectionSystem } from './systems/SelectionSystem';
import { FoodRespawnSystem } from './systems/FoodRespawnSystem';
import { FogOfWarSystem } from './systems/FogOfWarSystem';
import { EggIncubationSystem } from './systems/EggIncubationSystem';
import { NurseAISystem } from './systems/NurseAISystem';
import { TransitSystem } from './systems/TransitSystem';
import { ExcavationSystem } from './systems/ExcavationSystem';
import { PorterSystem } from './systems/PorterSystem';
import { ObjectiveSystem, type ObjectiveState } from './systems/ObjectiveSystem';
import { UndergroundInvasionSystem, type InvasionInfo } from './systems/UndergroundInvasionSystem';
import { SpoilageSystem } from './systems/SpoilageSystem';
import { FungusFarmSystem } from './systems/FungusFarmSystem';
import { UndergroundHealingSystem } from './systems/UndergroundHealingSystem';
import { DayNightSystem } from './systems/DayNightSystem';
import { DefenderAISystem } from './systems/DefenderAISystem';
import { createAnt, createFood, createNest, createBeetleDen, createQueen } from './entities/factories';
import { createDefaultModifiers } from './events/GlobalModifiers';
import { EventSystem } from './events/EventSystem';
import {
  AntRole,
  AntState,
  ColonyPriority,
  FoodType,
  Layer,
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
  ROLE_STATS,
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
  PANTRY_STORAGE_UPGRADE_PER_TILE,
} from '../shared/constants';

export interface SelectedEntityInfo {
  entityId: EntityId;
  type: 'ant' | 'food' | 'nest' | 'beetle' | 'beetle_den' | 'cricket' | 'cricket_den';
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
}

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
  survivedTicks: number;
  antsHatched: number;
  densDestroyed: number;
  tilesExcavated: number;
  wavesRepelled: number;
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
  notifications: GameNotification[];
  objective: ObjectiveState | null;
  invasion: InvasionInfo;
  gameOver: GameOverStats | null;
  activeEvents: Array<{ icon: string; name: string; remaining: number }>;
  dayPhase: 'day' | 'night';
  dayNumber: number;
  phaseRemaining: number; // seconds left in the current phase
}

export class GameManager {
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

  constructor(canvas: HTMLCanvasElement) {
    this.world = new World();
    this.grid = new TileGrid();
    this.visibilityGrid = new VisibilityGrid(WORLD_WIDTH, WORLD_HEIGHT);
    this.renderer = new CanvasRenderer(canvas);
    this.camera = new Camera();
    this.input = new InputManager(canvas);
    this.input.setCamera(this.camera);

    // Underground layer
    this.undergroundGrid = new UndergroundGrid();
    this.undergroundCamera = new Camera(UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT);

    // Create global modifiers (shared by reference across all systems)
    const modifiers = createDefaultModifiers();

    // Create systems
    this.renderSystem = new RenderSystem(this.world, this.renderer, this.grid, this.visibilityGrid);
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
    const beetleAISystem = new BeetleAISystem(this.world, this.grid);
    const cricketAISystem = new CricketAISystem(this.world, this.grid);
    const combatSystem = new CombatSystem(this.world, this.grid);
    const beetleSpawnSystem = new BeetleSpawnSystem(this.world, this.grid, modifiers);
    const cricketSpawnSystem = new CricketSpawnSystem(this.world, this.grid, modifiers);
    this.dayNightSystem = new DayNightSystem(this.world, modifiers);
    const hungerSystem = new HungerSystem(this.world, modifiers);
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
    this.world.addSystem(breedingSystem);
    const transitSystem = new TransitSystem(this.world, this.undergroundGrid);
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
    this.invasionSystem = new UndergroundInvasionSystem(this.world, this.undergroundGrid, transitSystem);
    this.world.addSystem(this.invasionSystem);
    this.world.addSystem(new SpoilageSystem(this.world));
    this.fungusFarmSystem = new FungusFarmSystem(this.world, this.undergroundGrid);
    this.world.addSystem(this.fungusFarmSystem);
    // Farm tiles pulse while producing — render needs to know the farm state
    this.renderSystem.setFarmStatusProvider(() => this.fungusFarmSystem.getStatus().status);

    // Create game loop
    this.gameLoop = new GameLoop(
      (dt) => this.update(dt),
      (interpolation) => this.render(interpolation)
    );

    // Setup input
    this.input.onKeyAction('Space', () => this.togglePause());
    this.input.onKeyAction('Digit1', () => this.gameLoop.setSpeed(1));
    this.input.onKeyAction('Digit2', () => this.gameLoop.setSpeed(2));
    this.input.onKeyAction('Digit3', () => this.gameLoop.setSpeed(3));
    this.input.onKeyAction('Home', () => this.camera.reset());
    this.input.onKeyAction('KeyR', () => this.camera.reset());

    // Setup canvas click handler for selection (screen coords → tile coords via camera)
    this.input.onCanvasClick((screenX, screenY) => {
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
            this.selectEntityAt(tile.x, tile.y);
          }
        }
        return;
      }
      const tile = this.camera.screenToTile(screenX, screenY);
      // Check if clicking on already-selected nest → enter underground
      const currentSelected = this.selectionSystem.getSelectedEntityId();
      if (currentSelected !== null) {
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
      this.selectEntityAt(tile.x, tile.y);
    });

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

    createNest(this.world, nestX, nestY);

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
    try {
      this.world.update(dt);
    } catch (e) {
      console.error('[GameManager] System update error:', e);
    }

    this.checkGameOver();

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

  /** SURVIVAL: if the queen dies (starvation or invaders), the colony falls */
  private checkGameOver(): void {
    if (this.gameOver) return;

    const queens = this.world.query(COMPONENT.QUEEN_ENTITY);
    let queenDead = queens.length === 0;
    if (!queenDead) {
      const health = this.world.getComponent<HealthComponent>(queens[0], COMPONENT.HEALTH);
      if (health && health.current <= 0) queenDead = true;
    }
    if (!queenDead) return;

    this.gameOver = {
      survivedTicks: this.gameLoop.getTickCount(),
      antsHatched: this.world.metrics.antsHatched,
      densDestroyed: this.world.metrics.densDestroyed,
      tilesExcavated: this.world.metrics.tilesExcavated,
      wavesRepelled: this.world.metrics.wavesRepelled,
    };
    this.gameLoop.setPaused(true);

    // Push final stats immediately so the UI shows the game-over screen without waiting
    if (this.statsCallback) {
      this.statsCallback(this.getStats());
    }
  }

  private render(interpolation: number): void {
    this.renderSystem.renderInterpolated(interpolation);
  }

  start(): void {
    this.gameLoop.start();
  }

  stop(): void {
    this.gameLoop.stop();
    this.input.destroy();
  }

  togglePause(): void {
    this.gameLoop.setPaused(!this.gameLoop.isPaused());
  }

  setPaused(paused: boolean): void {
    this.gameLoop.setPaused(paused);
  }

  setSpeed(speed: number): void {
    this.gameLoop.setSpeed(speed);
  }

  onStats(callback: (stats: GameStats) => void): void {
    this.statsCallback = callback;
  }

  selectEntityAt(tileX: number, tileY: number): void {
    this.selectionSystem.selectAt(tileX, tileY);
    // Force stats update to reflect selection
    if (this.statsCallback) {
      this.statsCallback(this.getStats());
    }
  }

  clearSelection(): void {
    this.selectionSystem.clearSelection();
    if (this.statsCallback) {
      this.statsCallback(this.getStats());
    }
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
    let cost = BREED_COST_WORKER;
    let time = BREED_TIME_WORKER;

    switch (role) {
      case AntRole.Soldier:
        cost = BREED_COST_SOLDIER;
        time = BREED_TIME_SOLDIER;
        break;
      case AntRole.Scout:
        cost = BREED_COST_SCOUT;
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

    let cost = BREED_COST_WORKER;
    switch (role) {
      case AntRole.Soldier: cost = BREED_COST_SOLDIER; break;
      case AntRole.Scout: cost = BREED_COST_SCOUT; break;
      case AntRole.Nurse: cost = BREED_COST_NURSE; break;
      case AntRole.Defender: cost = BREED_COST_DEFENDER; break;
    }

    // Spend from the pantry tile piles (leaf → mushroom → meat priority)
    if (!this.deductFromStorage(cost)) return false;

    // Add to queue
    eggQueue.queue.push({
      role,
      layTimer: QUEEN_EGG_LAY_TIME,
      layTimerTotal: QUEEN_EGG_LAY_TIME,
    });

    return true;
  }

  /** Deduct food from the underground pantry tiles (leaf → mushroom → meat). False if insufficient. */
  private deductFromStorage(cost: number): boolean {
    if (this.undergroundGrid.getPantryStored().total < cost) return false;
    this.undergroundGrid.drainFood(cost);
    return true;
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
      // Retrofit living workers
      for (const antId of this.world.query(COMPONENT.ANT, COMPONENT.CARRYING)) {
        const ant = this.world.getComponent<AntComponent>(antId, COMPONENT.ANT)!;
        if (ant.role !== AntRole.Worker) continue;
        const carrying = this.world.getComponent<CarryingComponent>(antId, COMPONENT.CARRYING)!;
        carrying.maxCapacity = Math.round(ROLE_STATS.worker.carryCapacity * this.world.upgrades.workerCarryMult);
      }
      this.world.pushNotification('success', `👑 Mejora: obreras nivel ${newLevel} — cargan más comida`);
    } else if (id === 'damage') {
      this.world.upgrades.soldierDamageMult = 1 + 0.25 * newLevel;
      const newDamage = Math.round(ROLE_STATS.soldier.damage * this.world.upgrades.soldierDamageMult);
      for (const antId of this.world.query(COMPONENT.ANT, COMPONENT.HEALTH)) {
        const ant = this.world.getComponent<AntComponent>(antId, COMPONENT.ANT)!;
        if (ant.role !== AntRole.Soldier) continue;
        this.world.getComponent<HealthComponent>(antId, COMPONENT.HEALTH)!.damage = newDamage;
        const combat = this.world.getComponent<CombatComponent>(antId, COMPONENT.COMBAT);
        if (combat) combat.attackDamage = newDamage;
      }
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

  /** Recall every surface ant to the nest — defensive posture */
  soundRetreat(): void {
    const ants = this.world.query(COMPONENT.ANT, COMPONENT.LAYER);
    let recalled = 0;

    for (const id of ants) {
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Surface) continue;

      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      // Porters keep their load and task — they're heading to the nest or
      // underground anyway, and re-typing their state would double-count food
      if (ant.state === AntState.FetchingFood || ant.state === AntState.Hauling) continue;
      ant.commandTargetId = null;
      ant.state = ant.role === AntRole.Soldier ? AntState.PatrollingNest : AntState.ReturningHome;
      ant.stateTimer = 0;

      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
      if (path) {
        path.waypoints = [];
        path.currentIndex = 0;
      }
      recalled++;
    }

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
        '🍄 No podés quitar una granja con hongos — esperá a que se coman',
        'farm-undesignate',
        3000
      );
      return false;
    }
    // Toggle: farm ↔ general
    tile.chamberType = tile.chamberType === ChamberType.FungusFarm ? ChamberType.General : ChamberType.FungusFarm;
    this.undergroundGrid.invalidateChamberCache();
    if (this.renderSystem) {
      (this.renderSystem as any).ugTextureReady = false;
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
          '🍖 No podés quitar un almacén con comida — esperá a que se vacíe',
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
      (this.renderSystem as any).ugTextureReady = false;
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
      (this.renderSystem as any).ugTextureReady = false;
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
      (this.renderSystem as any).ugTextureReady = false;
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
      (this.renderSystem as any).ugTextureReady = false;
    }
    return true;
  }

  cancelDig(tileX: number, tileY: number): void {
    this.excavationSystem.cancelDesignation(tileX, tileY);
  }

  enterUnderground(): void {
    this.activeLayer = 'underground';
    const cx = Math.floor(UNDERGROUND_WIDTH / 2) * TILE_SIZE;
    const cy = Math.floor(UNDERGROUND_HEIGHT / 2) * TILE_SIZE;
    this.undergroundCamera.centerOn(cx, cy);
    // Wheel zoom + right-drag pan must drive the camera of the ACTIVE layer
    this.input.setCamera(this.undergroundCamera);
  }

  exitUnderground(): void {
    this.activeLayer = 'surface';
    this.input.setCamera(this.camera);
  }

  getActiveLayer(): 'surface' | 'underground' {
    return this.activeLayer;
  }

  getUndergroundGrid(): UndergroundGrid {
    return this.undergroundGrid;
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

  getEggQueue(): Array<{ role: string; progress: number }> {
    const queens = this.world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.EGG_QUEUE);
    if (queens.length === 0) return [];

    const queenId = queens[0];
    const eggQueue = this.world.getComponent<EggQueueComponent>(queenId, COMPONENT.EGG_QUEUE)!;

    return eggQueue.queue.map(e => ({
      role: e.role,
      progress: e.layTimerTotal > 0 ? 1 - (e.layTimer / e.layTimerTotal) : 0,
    }));
  }

  getActiveEggs(): Array<{ role: string; progress: number; fedProgress: number }> {
    const eggs = this.world.query(COMPONENT.EGG, COMPONENT.POSITION);
    const result: Array<{ role: string; progress: number; fedProgress: number }> = [];

    for (const id of eggs) {
      const egg = this.world.getComponent<EggComponent>(id, COMPONENT.EGG)!;
      const progress = egg.hatchTime > 0 ? 1 - (egg.hatchTimer / egg.hatchTime) : 1;
      const fedProgress = egg.requiredFood > 0 ? egg.fedAmount / egg.requiredFood : 1;
      result.push({ role: egg.role, progress, fedProgress });
    }
    return result;
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

    // Count available soldiers (idle/searching/patrolling, no active command)
    let availableSoldiers = 0;
    for (const id of ants) {
      const antComp = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (antComp.role === AntRole.Soldier && antComp.commandTargetId === null) {
        if (antComp.state === AntState.Searching ||
            antComp.state === AntState.PatrollingNest ||
            antComp.state === AntState.Idle ||
            antComp.state === AntState.GoingToDen) {
          availableSoldiers++;
        }
      }
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
      pantryCapacity: this.undergroundGrid.getPantryCapacity() + this.undergroundGrid.getFarmCapacity(),
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
    };
  }

  /** Prune expired notifications and return the live ones (newest last) */
  private getActiveNotifications(): GameNotification[] {
    const now = Date.now();
    const ttl = 6500; // ms a notification stays on screen
    this.world.notifications = this.world.notifications.filter(n => now - n.createdAt < ttl);
    return [...this.world.notifications];
  }

  dispatchAttackWave(targetEntityId: EntityId, soldierCount: number): number {
    // Validate target exists and is a den
    if (!this.world.hasEntity(targetEntityId)) return 0;
    const isBeetleDen = this.world.getComponent<BeetleDenComponent>(targetEntityId, COMPONENT.BEETLE_DEN);
    const isCricketDen = this.world.getComponent<CricketDenComponent>(targetEntityId, COMPONENT.CRICKET_DEN);
    if (!isBeetleDen && !isCricketDen) return 0;

    const targetPos = this.world.getComponent<PositionComponent>(targetEntityId, COMPONENT.POSITION);
    if (!targetPos) return 0;

    // Find available soldiers
    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION);
    const available: { id: EntityId; dist: number }[] = [];

    for (const id of ants) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role !== AntRole.Soldier) continue;
      if (ant.commandTargetId !== null) continue;

      // Accept soldiers that are idle/searching/patrolling/going to den (auto)
      if (ant.state !== AntState.Searching &&
          ant.state !== AntState.PatrollingNest &&
          ant.state !== AntState.Idle &&
          ant.state !== AntState.GoingToDen) continue;

      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const dx = pos.x - targetPos.x;
      const dy = pos.y - targetPos.y;
      available.push({ id, dist: Math.sqrt(dx * dx + dy * dy) });
    }

    // Sort by distance (closest first)
    available.sort((a, b) => a.dist - b.dist);

    // Dispatch up to soldierCount
    const toDispatch = Math.min(soldierCount, available.length);
    for (let i = 0; i < toDispatch; i++) {
      const ant = this.world.getComponent<AntComponent>(available[i].id, COMPONENT.ANT)!;
      ant.commandTargetId = targetEntityId;
      ant.state = AntState.GoingToDen;
      ant.stateTimer = 0;
      // Path computed on next tick by handleGoingToDen
    }

    return toDispatch;
  }
}
