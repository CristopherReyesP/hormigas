// A Humans run, as GameManager sees it: one object that installs the
// player's Human systems (and drops the Swarm-only ones), lands the
// expedition, routes the clicks only a Human player has (placing buildings,
// mining, helping a frame, rally points) and sums the base up for the HUD.
// GameManager branches on `setup.playerRace === 'human'` and calls in here.

import type { World } from '../../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../../shared/types';
import type { PathGrid } from '../../../simulation/pathfinding/AStar';
import { AntRole, COMPONENT, Layer, type HealthComponent, type PositionComponent } from '../../components/components';
import { FactionId } from '../../factions/factions';
import { HUMAN_BUILDING_STATS, HUMAN_UNIT_STATS, type HumanBuildingKind, type HumanUnitType } from '../../rival/humanBase';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent } from '../../rival/humanComponents';
import { HUMAN_BUILDING_NAME, HUMAN_UNIT_NAME } from '../../rival/humanInfo';
import { findStructureAt, hasActiveOrder, issueMoveOrders } from '../../systems/helpers/playerOrders';
import type { TilePos } from '../../run/craterSite';
import { HumanPlayerSystem, playerBuildersAmong } from './HumanPlayerSystem';
import { HumanPlayerUnitSystem } from './HumanPlayerUnitSystem';
import { HumanWaveSystem, type WaveClock } from './HumanWaveSystem';
import { HUMAN_PLAYER_COMPONENT, type HumanProducerComponent, type HumanWorkerComponent } from './humanPlayerComponents';
import { spawnHumanPlayerStart } from './humanPlayerFactories';
import { isPlayerOwned, playerBuildings, playerUnits, positionOf } from './humanPlayerQueries';
import {
  PLAYER_BUILD_COST,
  PLAYER_BUILDABLE,
  PLAYER_TRAIN_COST,
  trainableAt,
  type HumanCost,
  type PlayerBuildable,
} from './humanPlayerRules';

/** Swarm-only systems a Humans run does without (no ants, nest, queen or cave) */
const SWARM_ONLY_SYSTEMS = [
  'AntAISystem',
  'HungerSystem',
  'RegenerationSystem',
  'BreedingSystem',
  'TransitSystem',
  'UndergroundHealingSystem',
  'DefenderAISystem',
  'EggIncubationSystem',
  'NurseAISystem',
  'ExcavationSystem',
  'PorterSystem',
  'ObjectiveSystem',
  'SpoilageSystem',
  'FungusFarmSystem',
];

/** The landing banner's line, and how long it stays up (ms) */
export const HUMAN_INTRO_TITLE = 'LA EXPEDICIÓN ATERRIZA';
const INTRO_MS = 5000;
/** A right-click this close to a mineral node is a mining order */
const NODE_PICK = 0.9;

/** What the selection system tells the facade */
export interface SelectionReader {
  getSelectedAnts(): EntityId[];
  getSelectedEntityId(): EntityId | null;
  selectAnts(ids: readonly EntityId[], layer: typeof Layer.Surface): number;
  selectOnly(id: EntityId): void;
}

export interface HumanTrainOption {
  type: HumanUnitType;
  name: string;
  cost: HumanCost;
  /** Why it cannot be queued now (null: it can) */
  reason: string | null;
}

/** One of the player's own buildings, selected */
export interface HumanSelectedBuilding {
  id: EntityId;
  kind: HumanBuildingKind;
  name: string;
  /** 0..1 while a frame is being raised, null once it stands */
  construction: number | null;
  queue: HumanUnitType[];
  /** 0..1 of the unit in training */
  progress: number;
  /** Seconds left on the unit in training */
  remaining: number;
  rally: Vector2 | null;
  trains: HumanTrainOption[];
}

export interface HumanGroupInfo {
  count: number;
  byType: Partial<Record<HumanUnitType, number>>;
  ordered: number;
  units: Array<{ id: EntityId; type: HumanUnitType; health: number; ordered: boolean }>;
}

export interface HumanPlacement {
  kind: PlayerBuildable;
  name: string;
  cost: HumanCost;
  /** The ghost's tile (null until the pointer or a finger shows where) */
  x: number | null;
  y: number | null;
  valid: boolean;
  reason: string | null;
}

/** What the HUD shows for a Human player (GameStats.human) */
export interface HumanPlayerStats {
  rations: number;
  minerals: number;
  supply: number;
  supplyCap: number;
  /** Rations per second */
  income: number;
  units: Record<HumanUnitType, number>;
  idleBuilders: number;
  /** Own builders in the selection: Construir shows when there is one */
  selectedBuilders: number;
  /** Own units in the selection (troops and builders): the unit card shows when there is one */
  selectedUnits: number;
  placing: HumanPlacement | null;
  selected: HumanSelectedBuilding | null;
  group: HumanGroupInfo | null;
  /** The landing banner, while it shows */
  intro: string | null;
}

const GROUP_ORDER: readonly HumanUnitType[] = ['tank', 'soldier', 'marksman', 'builder'];
const GROUP_MAX = 24;

/** The ant caste whose chip icon stands in for a Human unit type (control group chips) */
export const HUMAN_GROUP_ROLE: Readonly<Record<HumanUnitType, AntRole>> = {
  soldier: AntRole.Soldier,
  marksman: AntRole.Scout,
  tank: AntRole.Defender,
  builder: AntRole.Worker,
};

export class HumanPlayerRun {
  readonly economy: HumanPlayerSystem;
  readonly units: HumanPlayerUnitSystem;
  readonly waves: HumanWaveSystem;
  coreId: EntityId | null = null;

  private world: World;
  private grid: PathGrid & { width: number; height: number };
  private selection: SelectionReader;
  private placing: PlayerBuildable | null = null;
  private ghost: Vector2 | null = null;
  private introAt = Date.now();

  constructor(world: World, grid: PathGrid & { width: number; height: number }, clock: WaveClock, selection: SelectionReader) {
    this.world = world;
    this.grid = grid;
    this.selection = selection;
    this.economy = new HumanPlayerSystem(world, grid);
    this.units = new HumanPlayerUnitSystem(world, grid);
    this.waves = new HumanWaveSystem(world, grid, clock, () => this.liveCore(), { onFood: (amount) => this.economy.addRations(amount) });
  }

  /** Swap the Swarm's colony systems for the Human base's (the waves are GameManager's wave director) */
  install(): void {
    for (const name of SWARM_ONLY_SYSTEMS) this.world.removeSystem(name);
    this.world.addSystem(this.economy);
    this.world.addSystem(this.units);
  }

  /** The expedition lands at `center`; its command center is the player's core */
  spawnStart(center: TilePos): void {
    const start = spawnHumanPlayerStart(this.world, this.grid, center);
    this.coreId = start.coreId;
    const player = this.world.factions.get(FactionId.PLAYER);
    if (player) player.coreId = start.coreId;
  }

  /** The command center, while it stands */
  private liveCore(): EntityId | null {
    return this.coreId !== null && this.world.hasEntity(this.coreId) ? this.coreId : null;
  }

  /** The run is lost once the command center falls */
  isCoreAlive(): boolean {
    if (this.liveCore() === null) return false;
    const health = this.world.getComponent<HealthComponent>(this.coreId!, COMPONENT.HEALTH);
    return !health || health.current > 0;
  }

  addRations(amount: number): void {
    this.economy.addRations(amount);
  }

  // ── Building placement ──

  private selectedBuilders(): EntityId[] {
    return playerBuildersAmong(this.world, this.selection.getSelectedAnts());
  }

  /** Construir → `kind`: the next click (or tap) places it. Returns why it cannot start, or null. */
  beginPlacement(kind: PlayerBuildable): string | null {
    if (this.selectedBuilders().length === 0) return 'Selecciona un constructor para construir.';
    const cost = PLAYER_BUILD_COST[kind];
    if (this.world.minerals.stored < cost.minerals) return `Faltan minerales: ${HUMAN_BUILDING_NAME[kind]} cuesta ${cost.minerals}.`;
    this.placing = kind;
    this.ghost = null;
    return null;
  }

  cancelPlacement(): void {
    this.placing = null;
    this.ghost = null;
  }

  isPlacing(): boolean {
    return this.placing !== null;
  }

  /** The pointer moved over the map (entity-position space): the ghost follows it */
  hover(at: Vector2): void {
    if (this.placing) this.ghost = { x: Math.round(at.x), y: Math.round(at.y) };
  }

  /**
   * A left click (or a tap) while placing. A mouse click places the building
   * there. On touch the first tap only shows the ghost; a second tap on the
   * same spot places it. Returns false when not placing (the click is a
   * normal one).
   */
  clickAt(at: Vector2, touch: boolean): boolean {
    if (!this.placing) return false;
    const tile = { x: Math.round(at.x), y: Math.round(at.y) };
    const same = this.ghost !== null && this.ghost.x === tile.x && this.ghost.y === tile.y;
    this.ghost = tile;
    if (touch && !same) return true;
    const builders = this.selectedBuilders();
    const result = this.economy.placeBuilding(builders, this.placing, tile);
    if (!result.ok) {
      this.world.pushNotification('warning', `🚫 ${result.reason}`);
      return true;
    }
    this.world.pushNotification('info', `🏗️ ${HUMAN_BUILDING_NAME[this.placing]}: los constructores van en camino`);
    this.cancelPlacement();
    return true;
  }

  /**
   * A right-click (or a tap that gives an order) at `at`. Handles what only a
   * Human player has: builders sent to mine a node or to help raise a frame,
   * and a production building's rally point. Returns false for anything else
   * (a plain move or attack, which GameManager gives).
   */
  commandAt(at: Vector2): boolean {
    if (this.placing) {
      this.cancelPlacement();
      return true;
    }
    const selected = this.selection.getSelectedAnts();
    const builders = playerBuildersAmong(this.world, selected);
    if (builders.length > 0) {
      const others = selected.filter((id) => !builders.includes(id));
      const node = this.nodeAt(at);
      if (node !== null) {
        this.economy.orderGather(builders, node);
        if (others.length > 0) issueMoveOrders(this.world, this.grid, others, at);
        return true;
      }
      const frame = this.frameAt(at);
      if (frame !== null) {
        this.economy.orderBuild(builders, frame);
        if (others.length > 0) issueMoveOrders(this.world, this.grid, others, at);
        return true;
      }
      return false;
    }
    const building = this.selectedProducer();
    if (building !== null && selected.length === 0) {
      this.economy.setRally(building, at);
      this.world.pushNotification('info', '🚩 Punto de reunión fijado');
      return true;
    }
    return false;
  }

  /** A tap while a production building is selected sets its rally point when it lands on bare ground */
  tapAt(at: Vector2, hitsSomething: boolean): boolean {
    if (this.placing) return this.clickAt(at, true);
    if (hitsSomething) return false;
    const building = this.selectedProducer();
    if (building === null || this.selection.getSelectedAnts().length > 0) return false;
    this.economy.setRally(building, at);
    this.world.pushNotification('info', '🚩 Punto de reunión fijado');
    return true;
  }

  private nodeAt(at: Vector2): EntityId | null {
    let best: EntityId | null = null;
    let bestDist = NODE_PICK;
    for (const id of this.world.query(COMPONENT.MINERAL, COMPONENT.POSITION)) {
      const p = positionOf(this.world, id)!;
      const d = Math.hypot(p.x - at.x, p.y - at.y);
      if (d < bestDist) {
        best = id;
        bestDist = d;
      }
    }
    return best;
  }

  private frameAt(at: Vector2): EntityId | null {
    const id = findStructureAt(this.world, at);
    if (id === null || !isPlayerOwned(this.world, id)) return null;
    const building = this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING);
    return building && building.constructing > 0 ? id : null;
  }

  /** The selected own building that trains units, if exactly that is selected */
  private selectedProducer(): EntityId | null {
    const id = this.selection.getSelectedEntityId();
    if (id === null || !isPlayerOwned(this.world, id)) return null;
    return this.world.getComponent(id, HUMAN_PLAYER_COMPONENT.PRODUCER) ? id : null;
  }

  /** Constructores ociosos: select the builders standing by; returns how many */
  selectIdleBuilders(): number {
    const idle = playerUnits(this.world, 'builder').filter((id) => {
      const worker = this.world.getComponent<HumanWorkerComponent>(id, HUMAN_PLAYER_COMPONENT.WORKER);
      return worker?.task === 'idle' && !hasActiveOrder(this.world, id);
    });
    if (idle.length === 0) return 0;
    this.cancelPlacement();
    return this.selection.selectAnts(idle, Layer.Surface);
  }

  /** Select the command center; false once it is gone */
  selectCore(): boolean {
    const core = this.liveCore();
    if (core === null) return false;
    this.cancelPlacement();
    this.selection.selectOnly(core);
    return true;
  }

  // ── Production ──

  /** Queue `type` at the selected building; returns why it cannot, or null */
  train(type: HumanUnitType): string | null {
    const id = this.selection.getSelectedEntityId();
    if (id === null) return 'Selecciona un edificio.';
    return this.economy.train(id, type);
  }

  /** Take the last unit off the selected building's queue (refunded) */
  cancelTraining(): boolean {
    const id = this.selection.getSelectedEntityId();
    return id !== null && this.economy.cancelTraining(id);
  }

  /** Clear the selected building's rally point */
  clearRally(): boolean {
    const id = this.selectedProducer();
    return id !== null && this.economy.setRally(id, null);
  }

  // ── HUD ──

  stats(): HumanPlayerStats {
    const status = this.economy.status();
    const units: Record<HumanUnitType, number> = { builder: 0, soldier: 0, marksman: 0, tank: 0 };
    let idleBuilders = 0;
    for (const id of playerUnits(this.world)) {
      const type = this.world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type;
      units[type]++;
      const worker = this.world.getComponent<HumanWorkerComponent>(id, HUMAN_PLAYER_COMPONENT.WORKER);
      if (worker && worker.task === 'idle' && !hasActiveOrder(this.world, id)) idleBuilders++;
    }
    return {
      rations: status.rations,
      minerals: status.minerals,
      supply: status.supply,
      supplyCap: status.supplyCap,
      income: Math.round(status.income * 10) / 10,
      units,
      idleBuilders,
      selectedBuilders: this.selectedBuilders().length,
      selectedUnits: this.selection.getSelectedAnts().filter((id) => this.world.getComponent(id, HUMAN_COMPONENT.UNIT)).length,
      placing: this.placementInfo(),
      selected: this.selectedInfo(),
      group: this.groupInfo(),
      intro: Date.now() - this.introAt < INTRO_MS ? HUMAN_INTRO_TITLE : null,
    };
  }

  private placementInfo(): HumanPlacement | null {
    if (!this.placing) return null;
    const reason = this.ghost ? this.economy.placementProblem(this.placing, this.ghost) : null;
    return {
      kind: this.placing,
      name: HUMAN_BUILDING_NAME[this.placing],
      cost: PLAYER_BUILD_COST[this.placing],
      x: this.ghost?.x ?? null,
      y: this.ghost?.y ?? null,
      valid: this.ghost !== null && reason === null,
      reason,
    };
  }

  /** The ghost to draw: where, what, and whether it fits */
  ghostInfo(): { kind: PlayerBuildable; x: number; y: number; valid: boolean } | null {
    if (!this.placing || !this.ghost) return null;
    return { kind: this.placing, ...this.ghost, valid: this.economy.placementProblem(this.placing, this.ghost) === null };
  }

  private selectedInfo(): HumanSelectedBuilding | null {
    const id = this.selection.getSelectedEntityId();
    if (id === null || !isPlayerOwned(this.world, id)) return null;
    const building = this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING);
    if (!building) return null;
    const producer = this.world.getComponent<HumanProducerComponent>(id, HUMAN_PLAYER_COMPONENT.PRODUCER);
    const total = HUMAN_BUILDING_STATS[building.kind].buildTime;
    const head = producer?.queue[0];
    const trainTime = head ? Math.max(0.001, this.trainTime(head)) : 1;
    return {
      id,
      kind: building.kind,
      name: HUMAN_BUILDING_NAME[building.kind],
      construction: building.constructing > 0 ? 1 - building.constructing / Math.max(1, total) : null,
      queue: producer ? [...producer.queue] : [],
      progress: head ? Math.min(1, producer!.progress / trainTime) : 0,
      remaining: head ? Math.max(0, Math.ceil(trainTime - producer!.progress)) : 0,
      rally: producer?.rally ? { ...producer.rally } : null,
      trains: trainableAt(building.kind).map((type) => ({
        type,
        name: HUMAN_UNIT_NAME[type],
        cost: PLAYER_TRAIN_COST[type],
        reason: this.economy.trainProblem(id, type),
      })),
    };
  }

  private trainTime(type: HumanUnitType): number {
    return HUMAN_UNIT_STATS[type].trainTime;
  }

  private groupInfo(): HumanGroupInfo | null {
    const ids = this.selection.getSelectedAnts().filter((id) => this.world.getComponent(id, HUMAN_COMPONENT.UNIT));
    if (ids.length < 2) return null;
    const byType: Partial<Record<HumanUnitType, number>> = {};
    let ordered = 0;
    const units = ids.map((id) => {
      const type = this.world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type;
      const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
      const busy = hasActiveOrder(this.world, id);
      byType[type] = (byType[type] ?? 0) + 1;
      if (busy) ordered++;
      return { id, type, health: health ? Math.max(0, Math.min(1, health.current / Math.max(1, health.max))) : 1, ordered: busy };
    });
    units.sort((a, b) => GROUP_ORDER.indexOf(a.type) - GROUP_ORDER.indexOf(b.type) || a.id - b.id);
    return { count: ids.length, byType, ordered, units: units.slice(0, GROUP_MAX) };
  }

  /** The command center's tile, for the camera and the minimap */
  corePosition(): Vector2 | null {
    const core = this.liveCore();
    const p = core !== null ? this.world.getComponent<PositionComponent>(core, COMPONENT.POSITION) : undefined;
    return p ? { x: p.x, y: p.y } : null;
  }

  /** Buildings the player can raise, in card order */
  buildable(): readonly PlayerBuildable[] {
    return PLAYER_BUILDABLE;
  }

  /** The player's buildings (for the minimap) */
  buildings(): EntityId[] {
    return playerBuildings(this.world);
  }
}
