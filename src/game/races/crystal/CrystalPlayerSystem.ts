import type { System } from '../../../engine/ecs/types';
import type { World } from '../../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../../shared/types';
import type { PathGrid } from '../../../simulation/pathfinding/AStar';
import {
  COMPONENT,
  Layer,
  type CombatComponent,
  type CrystalSpireComponent,
  type CrystalUnitComponent,
  type HealthComponent,
  type LayerComponent,
  type MineralComponent,
  type PositionComponent,
} from '../../components/components';
import { FactionId, ownerOf } from '../../factions/factions';
import { addSpireFloor, createCrystalSpire, createCrystalUnit } from '../../rival/crystalFactories';
import { CRYSTAL_MAX_FLOORS } from '../../rival/crystalRival';
import type { ShieldComponent } from '../../rival/crystalShield';
import { SPIRE_NAME } from '../../rival/crystalNames';
import { isSurfaceEnemy, issueMoveOrders } from '../../systems/helpers/playerOrders';
import { HUMAN_COMPONENT } from '../../rival/humanComponents';
import { emitAudio } from '../../../audio/events';
import { checkPlacement, type PlacedStructure, type PlacementWorld } from './crystalPlacement';
import {
  CONSTRUCTION_START_HEALTH,
  CRYSTAL_FLOOR,
  CRYSTAL_HIVE_DEFENSE,
  CRYSTAL_PLAYER_ECONOMY,
  CRYSTAL_PLAYER_UNITS,
  CRYSTAL_QUEUE_MAX,
  CRYSTAL_STRUCTURES,
  stepQueue,
  supplyCap,
  supplyUsed,
  unitForSpire,
  type CrystalBuildKind,
  type CrystalPlayerUnitKind,
} from './crystalPlayerRules';
import {
  CRYSTAL_PLAYER_COMPONENT,
  type ConstructionComponent,
  type ProducerComponent,
} from './crystalPlayerComponents';

export type ActionResult = { ok: true } | { ok: false; reason: string };
export type BuildResult = { ok: true; id: EntityId } | { ok: false; reason: string };

/** Units the Hive's bolt can aim at: anything hostile that moves, wildlife included */
const HIVE_TARGET_STORES = [COMPONENT.BEETLE, COMPONENT.CRICKET, COMPONENT.CRYSTAL_UNIT, HUMAN_COMPONENT.UNIT] as const;
/** Every surface structure placement keeps apart from */
const STRUCTURE_STORES = [COMPONENT.CRYSTAL_HIVE, COMPONENT.CRYSTAL_SPIRE, COMPONENT.BEETLE_DEN, COMPONENT.CRICKET_DEN, COMPONENT.NEST, HUMAN_COMPONENT.BUILDING] as const;

export interface CrystalPlayerStats {
  unitsMade: number;
  structuresBuilt: number;
}

/**
 * The player's Crystal Hive, simulation side (P10):
 * - the economy: the Hive's trickle and every finished extractor draining
 *   the mineral nodes around it into the bank (World.minerals);
 * - structures and new floors crystallizing over time;
 * - the spires' paid production queues, held at the supply cap, and their
 *   rally points;
 * - the Hive's own defensive bolt.
 * The player's units themselves are driven by CrystalPlayerUnitSystem.
 */
export class CrystalPlayerSystem implements System {
  readonly name = 'CrystalPlayerSystem';
  readonly priority = 4.7; // after the rival's base (4.5, 4.6), before AntAI (5)

  private world: World;
  private grid: PathGrid;
  private counters: CrystalPlayerStats = { unitsMade: 0, structuresBuilt: 0 };

  constructor(world: World, grid: PathGrid) {
    this.world = world;
    this.grid = grid;
  }

  update(dt: number): void {
    const hive = this.hive();
    if (hive === null) return;
    this.earn(dt);
    this.crystallize(dt);
    this.produce(hive, dt);
    this.aimHive(hive);
  }

  // ── Lookups ──────────────────────────────────────────────

  /** The player's Hive, while it stands */
  hive(): EntityId | null {
    for (const id of this.world.query(COMPONENT.CRYSTAL_HIVE, COMPONENT.POSITION)) {
      if (ownerOf(this.world, id) === FactionId.PLAYER) return id;
    }
    return null;
  }

  /** The player's spires and extractors, finished or not */
  structures(): EntityId[] {
    return this.world.query(COMPONENT.CRYSTAL_SPIRE).filter((id) => ownerOf(this.world, id) === FactionId.PLAYER);
  }

  /** The player's units */
  units(): EntityId[] {
    return this.world.query(COMPONENT.CRYSTAL_UNIT).filter((id) => ownerOf(this.world, id) === FactionId.PLAYER);
  }

  isComplete(id: EntityId): boolean {
    return this.world.getComponent(id, CRYSTAL_PLAYER_COMPONENT.CONSTRUCTION) === undefined;
  }

  /** A new structure still crystallizing (a new floor does not count: the spire works meanwhile) */
  private isBuilding(id: EntityId): boolean {
    return this.world.getComponent<ConstructionComponent>(id, CRYSTAL_PLAYER_COMPONENT.CONSTRUCTION)?.kind === 'build';
  }

  constructionOf(id: EntityId): ConstructionComponent | undefined {
    return this.world.getComponent<ConstructionComponent>(id, CRYSTAL_PLAYER_COMPONENT.CONSTRUCTION);
  }

  producerOf(id: EntityId): ProducerComponent | undefined {
    return this.world.getComponent<ProducerComponent>(id, CRYSTAL_PLAYER_COMPONENT.PRODUCER);
  }

  stats(): CrystalPlayerStats {
    return { ...this.counters };
  }

  supply(): { used: number; cap: number } {
    const standing = this.structures().map((id) => {
      const spire = this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE)!;
      return { kind: spire.kind, floors: spire.floors, complete: !this.isBuilding(id) };
    });
    const kinds = this.units()
      .map((id) => this.world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!.kind)
      .filter((kind): kind is CrystalPlayerUnitKind => kind === 'drone' || kind === 'sentinel');
    return { used: supplyUsed(kinds), cap: supplyCap(this.hive() !== null, standing) };
  }

  /** What placement reads from the live map; `isExplored` is the player's fog */
  placementWorld(isExplored: (x: number, y: number) => boolean): PlacementWorld {
    const structures: PlacedStructure[] = [];
    for (const store of STRUCTURE_STORES) {
      for (const id of this.world.query(store, COMPONENT.POSITION)) {
        const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
        if (layer && layer.layer !== Layer.Surface) continue;
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        const spire = this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE);
        const kind: PlacedStructure['kind'] = store === COMPONENT.CRYSTAL_HIVE ? 'hive' : spire ? spire.kind : 'other';
        structures.push({ x: pos.x, y: pos.y, kind, own: ownerOf(this.world, id) === FactionId.PLAYER, complete: !this.isBuilding(id) });
      }
    }
    const minerals: Vector2[] = [];
    for (const id of this.world.query(COMPONENT.MINERAL, COMPONENT.POSITION)) {
      if ((this.world.getComponent<MineralComponent>(id, COMPONENT.MINERAL)?.amount ?? 0) <= 0) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      minerals.push({ x: pos.x, y: pos.y });
    }
    return {
      isWalkable: (x, y) => this.grid.isWalkable(x, y),
      isExplored,
      structures,
      minerals,
    };
  }

  // ── Building ─────────────────────────────────────────────

  /** Start crystallizing a `kind` structure on `tile`: it is paid now and grows for its build time. */
  startStructure(kind: CrystalBuildKind, tile: Vector2, placement: PlacementWorld): BuildResult {
    const hive = this.hive();
    if (hive === null) return { ok: false, reason: 'La colmena cayó: ya no se puede construir.' };
    const where = checkPlacement(kind, tile, placement);
    if (!where.ok) return where;
    const def = CRYSTAL_STRUCTURES[kind];
    if (!this.world.minerals.spend(def.cost)) return { ok: false, reason: `Faltan minerales: cuesta ${def.cost}.` };
    const x = Math.round(tile.x);
    const y = Math.round(tile.y);
    const id = createCrystalSpire(this.world, kind, x, y, hive, FactionId.PLAYER);
    this.world.addComponent<ConstructionComponent>(id, CRYSTAL_PLAYER_COMPONENT.CONSTRUCTION, { kind: 'build', elapsed: 0, total: def.buildTime });
    const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (health) health.current = Math.max(1, Math.round(health.max * CONSTRUCTION_START_HEALTH));
    const shield = this.world.getComponent<ShieldComponent>(id, COMPONENT.SHIELD);
    if (shield) shield.current = 0;
    if (unitForSpire(kind)) {
      this.world.addComponent<ProducerComponent>(id, CRYSTAL_PLAYER_COMPONENT.PRODUCER, { queue: [], progress: 0, rally: null, blocked: null });
    }
    emitAudio({ type: 'order', kind: 'move' });
    return { ok: true, id };
  }

  /** Añadir piso: one more floor on a finished spire (up to the maximum), paid now. */
  addFloor(spireId: EntityId): ActionResult {
    const spire = this.ownSpire(spireId);
    if (!spire || spire.kind === 'extractor') return { ok: false, reason: 'Solo las agujas de producción crecen hacia arriba.' };
    if (this.constructionOf(spireId)) return { ok: false, reason: 'La aguja todavía se está cristalizando.' };
    if (spire.floors >= CRYSTAL_MAX_FLOORS) return { ok: false, reason: `La aguja ya tiene ${CRYSTAL_MAX_FLOORS} pisos.` };
    if (!this.world.minerals.spend(CRYSTAL_FLOOR.cost)) return { ok: false, reason: `Faltan minerales: un piso cuesta ${CRYSTAL_FLOOR.cost}.` };
    this.world.addComponent<ConstructionComponent>(spireId, CRYSTAL_PLAYER_COMPONENT.CONSTRUCTION, { kind: 'floor', elapsed: 0, total: CRYSTAL_FLOOR.buildTime });
    return { ok: true };
  }

  /** Pay for one `kind` unit and put it in the spire's queue. */
  queueUnit(spireId: EntityId, kind: CrystalPlayerUnitKind): ActionResult {
    const spire = this.ownSpire(spireId);
    const producer = this.producerOf(spireId);
    if (!spire || !producer) return { ok: false, reason: 'Selecciona una aguja de producción.' };
    if (this.isBuilding(spireId)) return { ok: false, reason: 'La aguja todavía se está cristalizando.' };
    if (unitForSpire(spire.kind) !== kind) return { ok: false, reason: `Esta aguja no cristaliza esa unidad.` };
    if (producer.queue.length >= CRYSTAL_QUEUE_MAX) return { ok: false, reason: `La cola está llena (${CRYSTAL_QUEUE_MAX}).` };
    const cost = CRYSTAL_PLAYER_UNITS[kind].cost;
    if (!this.world.minerals.spend(cost)) return { ok: false, reason: `Faltan minerales: cuesta ${cost}.` };
    producer.queue.push(kind);
    return { ok: true };
  }

  /** Cancel the last unit in the queue, refunded in full. */
  cancelLast(spireId: EntityId): boolean {
    const producer = this.producerOf(spireId);
    const kind = producer?.queue.pop();
    if (!producer || kind === undefined) return false;
    if (producer.queue.length === 0) producer.progress = 0;
    this.world.minerals.deposit(CRYSTAL_PLAYER_UNITS[kind].cost);
    return true;
  }

  /** Where the spire's new units walk to */
  setRally(spireId: EntityId, tile: Vector2 | null): boolean {
    const producer = this.producerOf(spireId);
    if (!producer || ownerOf(this.world, spireId) !== FactionId.PLAYER) return false;
    producer.rally = tile ? { x: Math.round(tile.x), y: Math.round(tile.y) } : null;
    return true;
  }

  private ownSpire(id: EntityId): CrystalSpireComponent | null {
    if (ownerOf(this.world, id) !== FactionId.PLAYER) return null;
    return this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE) ?? null;
  }

  // ── Simulation ───────────────────────────────────────────

  private earn(dt: number): void {
    this.world.minerals.deposit(CRYSTAL_PLAYER_ECONOMY.hiveTrickle * dt);
    for (const id of this.structures()) {
      const spire = this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE)!;
      if (spire.kind !== 'extractor' || this.isBuilding(id)) continue;
      const at = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      this.world.minerals.deposit(this.drainNodes(at, CRYSTAL_PLAYER_ECONOMY.extractorRadius, CRYSTAL_PLAYER_ECONOMY.extractorRate * dt));
    }
  }

  /** Take up to `amount` ore from the nearest nodes within `radius`; returns what it got */
  private drainNodes(at: Vector2, radius: number, amount: number): number {
    let left = amount;
    const nodes = this.world.query(COMPONENT.MINERAL, COMPONENT.POSITION)
      .map((id) => ({ id, pos: this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)! }))
      .map((n) => ({ ...n, dist: Math.hypot(n.pos.x - at.x, n.pos.y - at.y) }))
      .filter((n) => n.dist <= radius)
      .sort((a, b) => a.dist - b.dist || a.id - b.id);
    for (const { id } of nodes) {
      if (left <= 0) break;
      const node = this.world.getComponent<MineralComponent>(id, COMPONENT.MINERAL)!;
      const take = Math.min(left, node.amount);
      node.amount -= take;
      left -= take;
      if (node.amount <= 0) this.world.destroyEntity(id);
    }
    return amount - left;
  }

  /** Structures and floors grow; their hull grows with them */
  private crystallize(dt: number): void {
    for (const id of this.structures()) {
      const c = this.constructionOf(id);
      if (!c) continue;
      const before = c.elapsed;
      c.elapsed = Math.min(c.total, c.elapsed + dt);
      const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
      if (c.kind === 'build' && health && c.total > 0) {
        health.current = Math.min(health.max, health.current + (health.max * (1 - CONSTRUCTION_START_HEALTH) * (c.elapsed - before)) / c.total);
      }
      if (c.elapsed < c.total) continue;
      this.world.removeComponent(id, CRYSTAL_PLAYER_COMPONENT.CONSTRUCTION);
      const spire = this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE)!;
      if (c.kind === 'floor') {
        addSpireFloor(this.world, id);
        this.world.pushNotification('success', `💎 Nuevo piso en ${SPIRE_NAME[spire.kind]}: piso ${spire.floors}`);
      } else {
        this.counters.structuresBuilt++;
        this.world.pushNotification('success', `💎 ${SPIRE_NAME[spire.kind]} cristalizada`);
      }
    }
  }

  private produce(hive: EntityId, dt: number): void {
    const supply = this.supply();
    let free = supply.cap - supply.used;
    for (const id of this.structures()) {
      const producer = this.producerOf(id);
      if (!producer || this.isBuilding(id)) continue;
      const spire = this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE)!;
      const step = stepQueue({ queue: producer.queue, progress: producer.progress }, dt, spire.floors, free);
      producer.queue = step.state.queue;
      producer.progress = step.state.progress;
      producer.blocked = step.blocked;
      if (!step.done) continue;
      free -= CRYSTAL_PLAYER_UNITS[step.done].supply;
      this.spawnUnit(id, hive, step.done, producer.rally);
    }
  }

  private spawnUnit(spireId: EntityId, hive: EntityId, kind: CrystalPlayerUnitKind, rally: Vector2 | null): void {
    const at = this.world.getComponent<PositionComponent>(spireId, COMPONENT.POSITION)!;
    const unit = createCrystalUnit(this.world, kind, at.x, at.y + 1.2, hive, FactionId.PLAYER);
    this.counters.unitsMade++;
    if (rally) issueMoveOrders(this.world, this.grid, [unit], rally);
  }

  /** The Hive keeps its bolt on the nearest hostile unit in range */
  private aimHive(hive: EntityId): void {
    const combat = this.world.getComponent<CombatComponent>(hive, COMPONENT.COMBAT);
    if (!combat) return;
    const at = this.world.getComponent<PositionComponent>(hive, COMPONENT.POSITION)!;
    const reach = CRYSTAL_HIVE_DEFENSE.range;
    const current = combat.targetEntityId;
    if (current !== null && isSurfaceEnemy(this.world, current)) {
      const pos = this.world.getComponent<PositionComponent>(current, COMPONENT.POSITION);
      if (pos && Math.hypot(pos.x - at.x, pos.y - at.y) <= reach) return;
    }
    let best: EntityId | null = null;
    let bestDist = Infinity;
    for (const store of HIVE_TARGET_STORES) {
      for (const id of this.world.query(store, COMPONENT.POSITION)) {
        if (!isSurfaceEnemy(this.world, id)) continue;
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        const dist = Math.hypot(pos.x - at.x, pos.y - at.y);
        if (dist <= reach && dist < bestDist) {
          best = id;
          bestDist = dist;
        }
      }
    }
    combat.targetEntityId = best;
  }
}
