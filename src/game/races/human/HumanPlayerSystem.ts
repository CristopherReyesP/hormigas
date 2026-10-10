import type { System } from '../../../engine/ecs/types';
import type { World } from '../../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../../shared/types';
import type { PathGrid } from '../../../simulation/pathfinding/AStar';
import {
  COMPONENT,
  type CombatComponent,
  type HealthComponent,
  type MineralComponent,
  type PathComponent,
  type PositionComponent,
} from '../../components/components';
import { FactionId, isHostileTo } from '../../factions/factions';
import {
  HUMAN_BUILDING_STATS,
  HUMAN_UNIT_STATS,
  humanIncome,
  pickTurretTarget,
  type HumanBuildingKind,
  type HumanUnitType,
  type TurretCandidate,
} from '../../rival/humanBase';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent } from '../../rival/humanComponents';
import { HUMAN_BUILDING_NAME, HUMAN_UNIT_NAME } from '../../rival/humanInfo';
import { hasPlayerOrder, issueMoveOrders } from '../../systems/helpers/playerOrders';
import { HUMAN_PLAYER_COMPONENT, type HumanProducerComponent, type HumanWorkerComponent } from './humanPlayerComponents';
import { createPlayerHumanBuilding, createPlayerHumanUnit } from './humanPlayerFactories';
import {
  BUILD_REACH,
  HUMAN_GATHER,
  PLAYER_BUILD_COST,
  PLAYER_HUMAN_START,
  PLAYER_TRAIN_COST,
  PRODUCER_OF,
  PRODUCTION_QUEUE_MAX,
  buildRate,
  canAfford,
  placementProblem,
  type HumanStock,
  type PlayerBuildable,
} from './humanPlayerRules';
import {
  clearPath,
  isPlayerOwned,
  nearest,
  onSurface,
  pathDone,
  playerBuildings,
  playerSupplyCap,
  playerSupplyUsed,
  playerUnits,
  positionOf,
  routeTo,
} from './humanPlayerQueries';

/** Seconds between two route requests of a busy builder */
const WORKER_REPATH = 1;
/** New units appear on this ring around the building that made them */
const SPAWN_RING = 2.5;
const SPAWN_SLOTS = 8;
/** Units the player's bunkers shoot at */
const TURRET_PREY = [COMPONENT.ANT, COMPONENT.BEETLE, COMPONENT.CRICKET, COMPONENT.CRYSTAL_UNIT, HUMAN_COMPONENT.UNIT];

/** Where each unit is trained, for the refusal text */
const TRAINED_IN: Readonly<Record<HumanBuildingKind, string>> = {
  command_center: 'el Centro de Mando',
  barracks: 'el cuartel',
  factory: 'la fábrica',
  bunker: 'el búnker',
  supply_depot: 'el depósito',
};

export type PlaceResult = { ok: true; buildingId: EntityId } | { ok: false; reason: string };

export interface HumanPlayerStatus {
  rations: number;
  minerals: number;
  supply: number;
  supplyCap: number;
  /** Rations per second right now */
  income: number;
}

/**
 * The player's Human base: rations from the command center and the supply
 * depots, builders that mine the mineral fields and raise the frames the
 * player places, production queues with rally points, and bunkers that shoot
 * on their own. The player's troops answer orders in HumanPlayerUnitSystem.
 */
export class HumanPlayerSystem implements System {
  readonly name = 'HumanPlayerSystem';
  readonly priority = 4.6; // after DayNight (4), before AntAI (5) and the unit AIs (6)

  private world: World;
  private grid: PathGrid & { width: number; height: number };
  private rations: number;
  private spawnCount = 0;
  private prey: TurretCandidate[] = [];

  constructor(world: World, grid: PathGrid & { width: number; height: number }, startRations: number = PLAYER_HUMAN_START.rations) {
    this.world = world;
    this.grid = grid;
    this.rations = startRations;
  }

  stock(): HumanStock {
    return { rations: Math.floor(this.rations), minerals: Math.floor(this.world.minerals.stored) };
  }

  /** Add (or, negative, take) rations; for events and tests. */
  addRations(amount: number): void {
    this.rations = Math.max(0, this.rations + amount);
  }

  status(): HumanPlayerStatus {
    const { rations, minerals } = this.stock();
    return {
      rations,
      minerals,
      supply: playerSupplyUsed(this.world),
      supplyCap: playerSupplyCap(this.world),
      income: this.income(),
    };
  }

  private income(): number {
    if (playerBuildings(this.world, 'command_center', true).length === 0) return 0;
    return humanIncome(playerBuildings(this.world, 'supply_depot', true).length);
  }

  private pay(cost: { rations: number; minerals: number }): boolean {
    if (!canAfford(this.stock(), cost)) return false;
    if (cost.minerals > 0 && !this.world.minerals.spend(cost.minerals)) return false;
    this.rations -= cost.rations;
    return true;
  }

  private refund(cost: { rations: number; minerals: number }): void {
    this.rations += cost.rations;
    this.world.minerals.deposit(cost.minerals);
  }

  // ── Orders from the HUD ──

  /** Why `kind` cannot go on `tile` (placement, then cost), or null. */
  placementProblem(kind: PlayerBuildable, tile: Vector2): string | null {
    const spot = placementProblem(kind, tile, this.placementWorld());
    if (spot) return spot;
    const cost = PLAYER_BUILD_COST[kind];
    if (!canAfford(this.stock(), cost)) return `Faltan minerales: ${HUMAN_BUILDING_NAME[kind]} cuesta ${cost.minerals}.`;
    return null;
  }

  private placementWorld() {
    return {
      width: this.grid.width,
      height: this.grid.height,
      isWalkable: (x: number, y: number) => this.grid.isWalkable(x, y),
      buildings: this.world.query(HUMAN_COMPONENT.BUILDING, COMPONENT.POSITION).map((id) => {
        const p = positionOf(this.world, id)!;
        const kind = this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind;
        return { x: p.x, y: p.y, halfWidth: HUMAN_BUILDING_STATS[kind].halfWidth };
      }).concat(
        [COMPONENT.CRYSTAL_HIVE, COMPONENT.CRYSTAL_SPIRE, COMPONENT.BEETLE_DEN, COMPONENT.CRICKET_DEN].flatMap((store) =>
          this.world.query(store, COMPONENT.POSITION).map((id) => {
            const p = positionOf(this.world, id)!;
            return { x: p.x, y: p.y, halfWidth: 1.5 };
          })),
      ),
      minerals: this.world.query(COMPONENT.MINERAL, COMPONENT.POSITION).map((id) => {
        const p = positionOf(this.world, id)!;
        return { x: p.x, y: p.y };
      }),
    };
  }

  /**
   * Lay a `kind` frame on `tile` and send `builderIds` to raise it: the
   * minerals are paid now (StarCraft style). Nothing happens on a bad spot,
   * without a builder or without the minerals.
   */
  placeBuilding(builderIds: readonly EntityId[], kind: PlayerBuildable, tile: Vector2): PlaceResult {
    const builders = builderIds.filter((id) => this.workerOf(id));
    if (builders.length === 0) return { ok: false, reason: 'Selecciona un constructor.' };
    const at = { x: Math.round(tile.x), y: Math.round(tile.y) };
    const problem = this.placementProblem(kind, at);
    if (problem) return { ok: false, reason: problem };
    if (!this.pay(PLAYER_BUILD_COST[kind])) return { ok: false, reason: 'Faltan minerales.' };
    const buildingId = createPlayerHumanBuilding(this.world, kind, at.x, at.y, true);
    this.orderBuild(builders, buildingId);
    return { ok: true, buildingId };
  }

  /** Builders go help raise the frame `buildingId`; returns how many went. */
  orderBuild(builderIds: readonly EntityId[], buildingId: EntityId): number {
    const building = this.world.getComponent<HumanBuildingComponent>(buildingId, HUMAN_COMPONENT.BUILDING);
    if (!building || building.constructing <= 0 || !isPlayerOwned(this.world, buildingId)) return 0;
    let sent = 0;
    for (const id of builderIds) {
      const worker = this.workerOf(id);
      if (!worker) continue;
      this.releaseOrder(id);
      worker.task = 'build';
      worker.buildingId = buildingId;
      worker.repath = 0;
      worker.working = false;
      clearPath(this.pathOf(id));
      sent++;
    }
    return sent;
  }

  /** Builders go mine `nodeId` (a mineral node); returns how many went. */
  orderGather(builderIds: readonly EntityId[], nodeId: EntityId): number {
    if (!this.world.getComponent(nodeId, COMPONENT.MINERAL)) return 0;
    let sent = 0;
    for (const id of builderIds) {
      const worker = this.workerOf(id);
      if (!worker) continue;
      this.releaseOrder(id);
      worker.nodeId = nodeId;
      worker.buildingId = null;
      worker.working = false;
      worker.task = worker.carrying > 0 ? 'deliver' : 'gather';
      worker.progress = 0;
      worker.repath = 0;
      clearPath(this.pathOf(id));
      sent++;
    }
    return sent;
  }

  /** Queue a `type` at `buildingId`, paid now; returns why it cannot, or null. */
  train(buildingId: EntityId, type: HumanUnitType): string | null {
    const building = this.world.getComponent<HumanBuildingComponent>(buildingId, HUMAN_COMPONENT.BUILDING);
    const producer = this.world.getComponent<HumanProducerComponent>(buildingId, HUMAN_PLAYER_COMPONENT.PRODUCER);
    if (!building || !isPlayerOwned(this.world, buildingId)) return 'Selecciona un edificio tuyo.';
    if (PRODUCER_OF[type] !== building.kind || !producer) {
      return `${HUMAN_UNIT_NAME[type]}: se entrena en ${TRAINED_IN[PRODUCER_OF[type]]}.`;
    }
    if (building.constructing > 0) return 'El edificio sigue en construcción.';
    if (producer.queue.length >= PRODUCTION_QUEUE_MAX) return `La cola está llena (${PRODUCTION_QUEUE_MAX}).`;
    const supply = HUMAN_UNIT_STATS[type].supply;
    if (playerSupplyUsed(this.world) + supply > playerSupplyCap(this.world)) {
      return 'Sin suministro: construye un depósito de suministros.';
    }
    const cost = PLAYER_TRAIN_COST[type];
    if (this.stock().rations < cost.rations) return `Faltan raciones: ${HUMAN_UNIT_NAME[type]} cuesta ${cost.rations}.`;
    if (this.stock().minerals < cost.minerals) return `Faltan minerales: ${HUMAN_UNIT_NAME[type]} cuesta ${cost.minerals}.`;
    if (!this.pay(cost)) return 'No alcanza.';
    if (producer.queue.length === 0) producer.progress = 0;
    producer.queue.push(type);
    return null;
  }

  /** Take the last queued unit off `buildingId`'s queue, refunded in full; false when the queue is empty. */
  cancelTraining(buildingId: EntityId): boolean {
    const producer = this.world.getComponent<HumanProducerComponent>(buildingId, HUMAN_PLAYER_COMPONENT.PRODUCER);
    if (!producer || producer.queue.length === 0 || !isPlayerOwned(this.world, buildingId)) return false;
    const type = producer.queue.pop()!;
    if (producer.queue.length === 0) producer.progress = 0;
    this.refund(PLAYER_TRAIN_COST[type]);
    return true;
  }

  /** New units from `buildingId` walk to `tile` (null clears it); false for a building that trains nothing. */
  setRally(buildingId: EntityId, tile: Vector2 | null): boolean {
    const producer = this.world.getComponent<HumanProducerComponent>(buildingId, HUMAN_PLAYER_COMPONENT.PRODUCER);
    if (!producer || !isPlayerOwned(this.world, buildingId)) return false;
    producer.rally = tile ? { x: Math.round(tile.x), y: Math.round(tile.y) } : null;
    return true;
  }

  // ── The tick ──

  update(dt: number): void {
    this.rations += this.income() * dt;
    this.runWorkers(dt);
    this.raiseFrames(dt);
    this.runProduction(dt);
    this.aimBunkers();
  }

  private workerOf(id: EntityId): HumanWorkerComponent | undefined {
    if (!this.world.hasEntity(id) || !isPlayerOwned(this.world, id)) return undefined;
    return this.world.getComponent<HumanWorkerComponent>(id, HUMAN_PLAYER_COMPONENT.WORKER);
  }

  private pathOf(id: EntityId): PathComponent | undefined {
    return this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
  }

  /** A job given from the HUD replaces any player order (move, hold) the builder had */
  private releaseOrder(id: EntityId): void {
    if (hasPlayerOrder(this.world, id)) this.world.removeComponent(id, COMPONENT.PLAYER_ORDER);
  }

  private runWorkers(dt: number): void {
    for (const id of this.world.query(HUMAN_PLAYER_COMPONENT.WORKER, COMPONENT.POSITION, COMPONENT.PATH)) {
      const worker = this.world.getComponent<HumanWorkerComponent>(id, HUMAN_PLAYER_COMPONENT.WORKER)!;
      worker.working = false;
      // A builder under a player order (move) is the unit system's; the job waits
      if (hasPlayerOrder(this.world, id)) {
        if (worker.task !== 'idle') worker.task = 'idle';
        continue;
      }
      worker.repath = Math.max(0, worker.repath - dt);
      const pos = positionOf(this.world, id)!;
      const path = this.pathOf(id)!;
      if (worker.task === 'gather') this.gather(worker, pos, path, dt);
      else if (worker.task === 'deliver') this.deliver(worker, pos, path);
      else if (worker.task === 'build') this.build(worker, pos, path);
    }
  }

  private walk(worker: HumanWorkerComponent, pos: PositionComponent, path: PathComponent, goal: Vector2): void {
    if (!pathDone(path) || worker.repath > 0) return;
    worker.repath = WORKER_REPATH;
    routeTo(this.grid, pos, path, goal);
  }

  private gather(worker: HumanWorkerComponent, pos: PositionComponent, path: PathComponent, dt: number): void {
    if (worker.carrying > 0) {
      worker.task = 'deliver';
      return;
    }
    let node = worker.nodeId !== null ? this.world.getComponent<MineralComponent>(worker.nodeId, COMPONENT.MINERAL) : undefined;
    if (!node) {
      worker.nodeId = this.nextNode(pos);
      node = worker.nodeId !== null ? this.world.getComponent<MineralComponent>(worker.nodeId, COMPONENT.MINERAL) : undefined;
      if (!node) {
        worker.task = 'idle';
        return;
      }
    }
    const nodePos = positionOf(this.world, worker.nodeId!)!;
    if (Math.hypot(nodePos.x - pos.x, nodePos.y - pos.y) > HUMAN_GATHER.nodeReach) {
      worker.progress = 0;
      this.walk(worker, pos, path, nodePos);
      return;
    }
    clearPath(path);
    worker.progress += dt;
    if (worker.progress < HUMAN_GATHER.mineSeconds) return;
    const take = Math.min(HUMAN_GATHER.tripAmount, node.amount);
    node.amount -= take;
    worker.carrying = take;
    worker.progress = 0;
    if (node.amount <= 0) {
      this.world.destroyEntity(worker.nodeId!);
      worker.nodeId = this.nextNode(nodePos);
    }
    worker.task = 'deliver';
    worker.repath = 0;
  }

  /** The node nearest `from` within reach of a re-target, or null */
  private nextNode(from: Vector2): EntityId | null {
    const nodes = this.world.query(COMPONENT.MINERAL, COMPONENT.POSITION).filter((n) => {
      const p = positionOf(this.world, n)!;
      return Math.hypot(p.x - from.x, p.y - from.y) <= HUMAN_GATHER.retarget;
    });
    return nearest(this.world, nodes, from);
  }

  private deliver(worker: HumanWorkerComponent, pos: PositionComponent, path: PathComponent): void {
    const core = nearest(this.world, playerBuildings(this.world, 'command_center', true), pos);
    if (core === null) {
      worker.task = 'idle';
      return;
    }
    const corePos = positionOf(this.world, core)!;
    const reach = HUMAN_BUILDING_STATS.command_center.halfWidth + HUMAN_GATHER.dropReach;
    if (Math.hypot(corePos.x - pos.x, corePos.y - pos.y) > reach) {
      this.walk(worker, pos, path, corePos);
      return;
    }
    clearPath(path);
    this.world.minerals.deposit(worker.carrying);
    worker.carrying = 0;
    worker.repath = 0;
    worker.task = worker.nodeId !== null || this.nextNode(pos) !== null ? 'gather' : 'idle';
  }

  private build(worker: HumanWorkerComponent, pos: PositionComponent, path: PathComponent): void {
    const id = worker.buildingId;
    const building = id !== null ? this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING) : undefined;
    if (!building || building.constructing <= 0) {
      this.afterBuild(worker);
      return;
    }
    const at = positionOf(this.world, id!)!;
    const reach = HUMAN_BUILDING_STATS[building.kind].halfWidth + BUILD_REACH;
    if (Math.hypot(at.x - pos.x, at.y - pos.y) > reach) {
      this.walk(worker, pos, path, at);
      return;
    }
    clearPath(path);
    worker.working = true;
  }

  /** Frame done (or gone): back to the node it mined before, else stand by */
  private afterBuild(worker: HumanWorkerComponent): void {
    worker.buildingId = null;
    worker.working = false;
    const node = worker.nodeId !== null && this.world.getComponent(worker.nodeId, COMPONENT.MINERAL) ? worker.nodeId : null;
    worker.task = node !== null ? 'gather' : 'idle';
  }

  /** Every frame rises at the pace of the builders working on it */
  private raiseFrames(dt: number): void {
    const crews = new Map<EntityId, number>();
    for (const id of this.world.query(HUMAN_PLAYER_COMPONENT.WORKER)) {
      const worker = this.world.getComponent<HumanWorkerComponent>(id, HUMAN_PLAYER_COMPONENT.WORKER)!;
      if (worker.working && worker.buildingId !== null) crews.set(worker.buildingId, (crews.get(worker.buildingId) ?? 0) + 1);
    }
    for (const [id, crew] of crews) {
      const building = this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING);
      const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
      if (!building || !health || building.constructing <= 0) continue;
      const total = HUMAN_BUILDING_STATS[building.kind].buildTime;
      const work = Math.min(building.constructing, dt * buildRate(crew));
      building.constructing = Math.max(0, building.constructing - work);
      health.current = Math.min(health.max, health.current + (health.max * 0.9 * work) / total);
      if (building.constructing <= 0) {
        health.current = Math.max(health.current, health.max * 0.999);
        this.world.pushNotification('success', `🏗️ ${HUMAN_BUILDING_NAME[building.kind]} terminado`);
      }
    }
  }

  private runProduction(dt: number): void {
    for (const id of this.world.query(HUMAN_PLAYER_COMPONENT.PRODUCER, HUMAN_COMPONENT.BUILDING)) {
      if (!isPlayerOwned(this.world, id)) continue;
      const building = this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!;
      const producer = this.world.getComponent<HumanProducerComponent>(id, HUMAN_PLAYER_COMPONENT.PRODUCER)!;
      if (building.constructing > 0 || producer.queue.length === 0) continue;
      const type = producer.queue[0];
      producer.progress += dt;
      if (producer.progress < HUMAN_UNIT_STATS[type].trainTime) continue;
      producer.queue.shift();
      producer.progress = 0;
      this.spawnFrom(id, building.kind, type, producer);
    }
  }

  private spawnFrom(sourceId: EntityId, kind: HumanBuildingKind, type: HumanUnitType, producer: HumanProducerComponent): void {
    const at = positionOf(this.world, sourceId)!;
    const slot = this.spawnSlot(at, HUMAN_BUILDING_STATS[kind].halfWidth);
    const core = nearest(this.world, playerBuildings(this.world, 'command_center', true), at);
    const unit = createPlayerHumanUnit(this.world, type, slot.x, slot.y, core);
    if (producer.rally) {
      issueMoveOrders(this.world, this.grid, [unit], producer.rally);
    } else if (type === 'builder') {
      // A fresh builder goes straight to the nearest field, as in StarCraft
      const node = this.nextNode(at);
      if (node !== null) this.orderGather([unit], node);
    }
  }

  /** The next walkable tile on the ring around a building (its own tile when none is) */
  private spawnSlot(at: PositionComponent, halfWidth: number): Vector2 {
    const ring = halfWidth + SPAWN_RING - 1;
    for (let tries = 0; tries < SPAWN_SLOTS; tries++) {
      const angle = ((this.spawnCount++ % SPAWN_SLOTS) / SPAWN_SLOTS) * Math.PI * 2 + Math.PI / 2;
      const x = Math.round(at.x + Math.cos(angle) * ring);
      const y = Math.round(at.y + Math.sin(angle) * ring);
      if (this.grid.isWalkable(x, y)) return { x, y };
    }
    return { x: at.x, y: at.y + 1 };
  }

  /** Finished player bunkers take the nearest hostile unit in range (wildlife too) */
  private aimBunkers(): void {
    const turrets = this.world.query(HUMAN_COMPONENT.BUILDING, COMPONENT.COMBAT, COMPONENT.POSITION).filter((id) => isPlayerOwned(this.world, id));
    if (turrets.length === 0) return;
    this.prey.length = 0;
    for (const store of TURRET_PREY) {
      for (const id of this.world.query(store, COMPONENT.POSITION, COMPONENT.HEALTH)) {
        if (!onSurface(this.world, id) || !isHostileTo(this.world, FactionId.PLAYER, id)) continue;
        const p = positionOf(this.world, id)!;
        this.prey.push({ id, x: p.x, y: p.y });
      }
    }
    for (const id of turrets) {
      const building = this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!;
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!;
      if (building.constructing > 0) {
        combat.targetEntityId = null;
        continue;
      }
      combat.targetEntityId = pickTurretTarget(positionOf(this.world, id)!, combat.attackRange, this.prey, combat.targetEntityId);
    }
  }
}

/** The player's builders among `ids` (what Construir and right-clicks on minerals act on) */
export function playerBuildersAmong(world: World, ids: readonly EntityId[]): EntityId[] {
  return ids.filter((id) => {
    const unit = world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT);
    return unit?.type === 'builder' && isPlayerOwned(world, id);
  });
}

export { playerUnits };
