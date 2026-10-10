import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../shared/types';
import { findPath, type PathGrid } from '../../simulation/pathfinding/AStar';
import {
  AntState,
  COMPONENT,
  CrystalUnitState,
  Layer,
  type AntComponent,
  type CrystalSpireComponent,
  type CrystalUnitComponent,
  type HealthComponent,
  type LayerComponent,
  type MineralComponent,
  type PathComponent,
  type PositionComponent,
} from '../components/components';
import { FactionId, nearestEnemyBase, ownerOf, relation } from '../factions/factions';
import { addSpireFloor, createCrystalSpire, createCrystalUnit } from '../rival/crystalFactories';
import {
  CRYSTAL_ECONOMY,
  CRYSTAL_MAX_FLOORS,
  CRYSTAL_QUEEN_POWERS,
  CRYSTAL_UNIT_STATS,
  RAID_AT_DAY_REMAINING,
  SPIRE_PRODUCTION,
  nextBuildAction,
  pickExpansionSite,
  raidSize,
  rivalGarrisonCap,
  spireInterval,
  type BuildAction,
  type RivalBuildState,
} from '../rival/crystalRival';
import { combatVfxFor } from '../vfx/CombatVfx';
import { ORDER_PATH_MAX_STEPS } from '../../shared/constants';
import type { NightClock } from './CrystalHiveSystem';
import { SPIRE_NAME } from '../rival/crystalNames';

/** What the rival reads from the day/night cycle (DayNightSystem, or a test clock). */
export interface RivalClock extends NightClock {
  getPhaseRemaining(): number;
}

/** Spires stand on a ring around the hive, one slot after another */
const SPIRE_RING = 4.5;
const SPIRE_SLOTS = 6;
/** Mineral nodes this close together belong to one field */
const FIELD_LINK = 5;
/** A field whose center is this close to the hive is the crater's own */
const HOME_FIELD_RADIUS = 8;

export interface CrystalRivalSnapshot {
  bank: number;
  /** Build-order steps done / total */
  built: number;
  spires: number;
  garrison: number;
  queenSpawned: boolean;
}

/**
 * The full Crystal Hive rival (P5): on top of the hive core's own drones
 * (CrystalHiveSystem), it
 * - banks minerals: meteor energy plus extractors draining nearby nodes;
 * - grows its base by the scripted, night-gated build order: extractors on
 *   the crater field and expansions, drone forges and Sentinel prisms, and
 *   extra floors on them;
 * - crystallizes units from its spires while the bank pays and the garrison
 *   has room (a broken spire stops its production);
 * - once a day raids the player's miners and fields, siphoning ore;
 * - brings the Crystal Queen on the boss night (launchQueen) and fires her pulse.
 * Deterministic: game time only, no randomness.
 */
export class CrystalRivalSystem implements System {
  readonly name = 'CrystalRivalSystem';
  readonly priority = 4.6; // after the hive core (4.5), before AntAI (5)

  private world: World;
  private grid: PathGrid;
  private clock: RivalClock;
  private bank: number = CRYSTAL_ECONOMY.startBank;
  private buildIndex = 0;
  private spireSlot = 0;
  private lastRaidDay = 0;
  private queenSpawned = false;
  private pulseTimers = new Map<EntityId, number>();

  constructor(world: World, grid: PathGrid, clock: RivalClock) {
    this.world = world;
    this.grid = grid;
    this.clock = clock;
  }

  snapshot(): CrystalRivalSnapshot {
    const hive = this.hive();
    return {
      bank: Math.floor(this.bank),
      built: this.buildIndex,
      spires: hive === null ? 0 : this.spiresOf(hive).length,
      garrison: hive === null ? 0 : this.garrisonOf(hive).length,
      queenSpawned: this.queenSpawned,
    };
  }

  update(dt: number): void {
    this.queenPulses(dt);
    const hive = this.hive();
    if (hive === null) return;
    const day = this.clock.getDayNumber();

    this.earn(hive, dt);
    this.build(hive, day);
    this.produce(hive, day, dt);
    this.siphon(dt);

    if (this.clock.getPhase() === 'day' && this.clock.getPhaseRemaining() <= RAID_AT_DAY_REMAINING && this.lastRaidDay < day) {
      this.lastRaidDay = day;
      this.raid(hive, day);
    }
  }

  // ── Economy ──────────────────────────────────────────────

  private earn(hive: EntityId, dt: number): void {
    this.bank += CRYSTAL_ECONOMY.passiveIncome * dt;
    for (const id of this.spiresOf(hive)) {
      const spire = this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE)!;
      if (spire.kind !== 'extractor') continue;
      const at = this.posOf(id)!;
      this.bank += this.drainNodes(at, CRYSTAL_ECONOMY.extractorRadius, CRYSTAL_ECONOMY.extractorRate * dt);
    }
  }

  /** Take up to `amount` ore from the nearest nodes within `radius`; returns what it got */
  private drainNodes(at: Vector2, radius: number, amount: number): number {
    let left = amount;
    const nodes = this.world.query(COMPONENT.MINERAL, COMPONENT.POSITION)
      .map((id) => ({ id, pos: this.posOf(id)! }))
      .filter((n) => Math.hypot(n.pos.x - at.x, n.pos.y - at.y) <= radius)
      .sort((a, b) => Math.hypot(a.pos.x - at.x, a.pos.y - at.y) - Math.hypot(b.pos.x - at.x, b.pos.y - at.y) || a.id - b.id);
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

  /** Raiders parked on a player field drain it into the hive's bank */
  private siphon(dt: number): void {
    for (const id of this.world.query(COMPONENT.CRYSTAL_UNIT, COMPONENT.POSITION)) {
      const unit = this.world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!;
      if (unit.state !== CrystalUnitState.Raiding || unit.raidTimer === undefined) continue;
      this.bank += this.drainNodes(this.posOf(id)!, CRYSTAL_ECONOMY.raidSiphonRadius, CRYSTAL_ECONOMY.raidSiphonRate * dt);
    }
  }

  // ── Build order ──────────────────────────────────────────

  private build(hive: EntityId, day: number): void {
    const standing = this.spiresOf(hive).map((id) => {
      const s = this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE)!;
      return { kind: s.kind, floors: s.floors };
    });
    const state: RivalBuildState = { next: this.buildIndex, bank: this.bank };
    const step = nextBuildAction(state, day, standing);
    if (!step.action) return;
    if (!this.carryOut(hive, step.action)) {
      // No ground for it (no free field left): skip the step, keep the minerals
      this.buildIndex = step.state.next;
      return;
    }
    this.buildIndex = step.state.next;
    this.bank = step.state.bank;
  }

  private carryOut(hive: EntityId, action: BuildAction): boolean {
    const owner = ownerOf(this.world, hive) ?? FactionId.RIVAL;
    if (action.type === 'floor') {
      const target = this.spiresOf(hive).find((id) => {
        const s = this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE)!;
        return s.kind === action.kind && s.floors < CRYSTAL_MAX_FLOORS;
      });
      if (target === undefined) return false;
      addSpireFloor(this.world, target);
      const floors = this.world.getComponent<CrystalSpireComponent>(target, COMPONENT.CRYSTAL_SPIRE)!.floors;
      this.world.pushNotification('warning', `💎 La Colmena de Cristal sube un piso: ${SPIRE_NAME[action.kind]} (piso ${floors})`);
      return true;
    }
    const at = action.kind === 'extractor' ? this.extractorSite(hive, action.site ?? 'crater') : this.ringSlot(hive);
    if (!at) return false;
    createCrystalSpire(this.world, action.kind, at.x, at.y, hive, owner);
    if (action.kind === 'extractor' && action.site === 'expansion') {
      this.world.pushNotification('warning', '💎 La Colmena de Cristal se expande: un extractor drena otro campo de minerales');
    } else {
      this.world.pushNotification('warning', `💎 La Colmena de Cristal levanta: ${SPIRE_NAME[action.kind]}`);
    }
    return true;
  }

  /** The next free, walkable slot on the ring around the hive */
  private ringSlot(hive: EntityId): Vector2 {
    const at = this.posOf(hive)!;
    for (let tries = 0; tries < SPIRE_SLOTS * 2; tries++) {
      const slot = this.spireSlot++;
      const ring = SPIRE_RING + Math.floor(slot / SPIRE_SLOTS) * 2;
      const angle = ((slot % SPIRE_SLOTS) / SPIRE_SLOTS) * Math.PI * 2 + Math.PI / SPIRE_SLOTS;
      const x = Math.round(at.x + Math.cos(angle) * ring);
      const y = Math.round(at.y + Math.sin(angle) * ring);
      if (this.grid.isWalkable(x, y)) return { x, y };
    }
    return { x: Math.round(at.x), y: Math.round(at.y + SPIRE_RING) };
  }

  /** Mineral fields on the map: nodes grouped by distance, each with a center */
  private fields(): Array<{ center: Vector2; nodes: Vector2[] }> {
    const fields: Array<{ center: Vector2; nodes: Vector2[] }> = [];
    const ids = [...this.world.query(COMPONENT.MINERAL, COMPONENT.POSITION)].sort((a, b) => a - b);
    for (const id of ids) {
      const pos = this.posOf(id)!;
      const field = fields.find((f) => f.nodes.some((n) => Math.hypot(n.x - pos.x, n.y - pos.y) <= FIELD_LINK));
      if (field) field.nodes.push({ x: pos.x, y: pos.y });
      else fields.push({ center: { x: 0, y: 0 }, nodes: [{ x: pos.x, y: pos.y }] });
    }
    for (const f of fields) {
      f.center = {
        x: Math.round(f.nodes.reduce((s, n) => s + n.x, 0) / f.nodes.length),
        y: Math.round(f.nodes.reduce((s, n) => s + n.y, 0) / f.nodes.length),
      };
    }
    return fields;
  }

  /** The crater's own field (beside the hive), or the nearest field it does not hold yet */
  private extractorSite(hive: EntityId, site: 'crater' | 'expansion'): Vector2 | null {
    const at = this.posOf(hive)!;
    const fields = this.fields();
    if (site === 'crater') {
      const nodes = fields.flatMap((f) => f.nodes).filter((n) => Math.hypot(n.x - at.x, n.y - at.y) <= HOME_FIELD_RADIUS);
      if (nodes.length === 0) return this.ringSlot(hive);
      nodes.sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
      return this.besideNode(nodes[0], at);
    }
    const extractors = this.spiresOf(hive)
      .filter((id) => this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE)!.kind === 'extractor')
      .map((id) => this.posOf(id)!);
    const free = fields
      .filter((f) => Math.hypot(f.center.x - at.x, f.center.y - at.y) > HOME_FIELD_RADIUS)
      .filter((f) => !extractors.some((e) => Math.hypot(e.x - f.center.x, e.y - f.center.y) <= CRYSTAL_ECONOMY.extractorRadius + 1))
      .map((f) => f.center);
    const pick = pickExpansionSite(at, free, []);
    return pick ? this.besideNode(pick, at) : null;
  }

  /** A walkable tile one step from `node` toward `toward` */
  private besideNode(node: Vector2, toward: Vector2): Vector2 {
    const d = Math.hypot(toward.x - node.x, toward.y - node.y) || 1;
    const x = Math.round(node.x + (toward.x - node.x) / d);
    const y = Math.round(node.y + (toward.y - node.y) / d);
    return this.grid.isWalkable(x, y) ? { x, y } : { x: Math.round(node.x), y: Math.round(node.y) };
  }

  // ── Production ───────────────────────────────────────────

  private produce(hive: EntityId, day: number, dt: number): void {
    const cap = rivalGarrisonCap(day);
    let garrison = this.garrisonOf(hive).length;
    for (const id of this.spiresOf(hive)) {
      const spire = this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE)!;
      const unit = SPIRE_PRODUCTION[spire.kind].unit;
      if (!unit) continue;
      spire.productionTimer = Math.max(0, spire.productionTimer - dt);
      if (spire.productionTimer > 0) continue;
      const cost = CRYSTAL_UNIT_STATS[unit].cost;
      if (garrison >= cap || this.bank < cost) continue; // waits, ready, until both allow
      this.bank -= cost;
      const at = this.posOf(id)!;
      createCrystalUnit(this.world, unit, at.x, at.y + 1, hive, ownerOf(this.world, hive) ?? FactionId.RIVAL);
      spire.productionTimer = spireInterval(spire.kind, spire.floors);
      garrison++;
    }
  }

  // ── Raids ────────────────────────────────────────────────

  private raid(hive: EntityId, day: number): void {
    const garrison = this.garrisonOf(hive);
    const size = raidSize(day, garrison.length);
    if (size === 0) return;
    const target = this.raidTarget(hive);
    if (!target) return;
    const raiders = garrison.slice(0, size);
    this.sendOut(raiders, target, CrystalUnitState.Raiding);
    this.world.pushNotification(
      'danger',
      raiders.length === 1
        ? '💎 Una incursión de cristal va hacia tus minas'
        : `💎 Incursión de cristal: ${raiders.length} unidades van hacia tus minas`,
    );
  }

  /** The player's miner nearest the hive; else the player's nearest mineral field outside the crater */
  private raidTarget(hive: EntityId): Vector2 | null {
    const at = this.posOf(hive)!;
    const owner = ownerOf(this.world, hive) ?? FactionId.RIVAL;
    let best: Vector2 | null = null;
    let bestDist = Infinity;
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.POSITION)) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.state !== AntState.Mining || !this.onSurface(id)) continue;
      const faction = ownerOf(this.world, id);
      if (faction === null || relation(owner, faction) !== 'enemy') continue;
      const pos = this.posOf(id)!;
      const dist = Math.hypot(pos.x - at.x, pos.y - at.y);
      if (dist < bestDist) {
        best = { x: Math.round(pos.x), y: Math.round(pos.y) };
        bestDist = dist;
      }
    }
    if (best) return best;
    const nest = this.enemyNest(hive);
    if (!nest) return null;
    const fields = this.fields().filter((f) => Math.hypot(f.center.x - at.x, f.center.y - at.y) > HOME_FIELD_RADIUS);
    return pickExpansionSite(nest, fields.map((f) => f.center), []);
  }

  private sendOut(units: readonly EntityId[], goal: Vector2, state: CrystalUnitState): void {
    const first = units.length > 0 ? this.posOf(units[0]) : null;
    const route = first ? findPath(this.grid, { x: Math.round(first.x), y: Math.round(first.y) }, goal, ORDER_PATH_MAX_STEPS) : null;
    for (const id of units) {
      const unit = this.world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!;
      unit.state = state;
      unit.goal = { x: goal.x, y: goal.y };
      unit.raidTimer = undefined;
      unit.repathTimer = 0;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
      if (path && route) {
        path.waypoints = route.map((p) => ({ x: p.x, y: p.y }));
        path.currentIndex = 0;
      }
    }
  }

  // ── The Crystal Queen ────────────────────────────────────

  /** The boss night: the Crystal Queen leaves the hive for the player's nest. Once per run. */
  launchQueen(): EntityId | null {
    const hive = this.hive();
    if (hive === null || this.queenSpawned) return null;
    const target = this.enemyNest(hive);
    if (!target) return null;
    this.queenSpawned = true;
    const at = this.posOf(hive)!;
    const queen = createCrystalUnit(this.world, 'queen', at.x, at.y + 2, hive, ownerOf(this.world, hive) ?? FactionId.RIVAL);
    this.sendOut([queen], target, CrystalUnitState.Assaulting);
    this.pulseTimers.set(queen, CRYSTAL_QUEEN_POWERS.pulseCooldown);
    combatVfxFor(this.world).crystalPulse(at.x, at.y, Layer.Surface);
    this.world.pushNotification('danger', '👑 ¡La Reina de Cristal despierta y marcha hacia tu nido! Su aura recarga los escudos de su escolta');
    return queen;
  }

  /** Each living Crystal Queen pulses: enemy units around her take a hit */
  private queenPulses(dt: number): void {
    for (const [queen, timer] of this.pulseTimers) {
      if (!this.world.hasEntity(queen)) {
        this.pulseTimers.delete(queen);
        continue;
      }
      const next = timer - dt;
      if (next > 0) {
        this.pulseTimers.set(queen, next);
        continue;
      }
      const at = this.posOf(queen)!;
      const victims = this.enemyAntsNear(queen, at, CRYSTAL_QUEEN_POWERS.pulseRadius);
      if (victims.length === 0) {
        this.pulseTimers.set(queen, 0); // charged: fires as soon as someone comes close
        continue;
      }
      this.pulseTimers.set(queen, CRYSTAL_QUEEN_POWERS.pulseCooldown);
      const vfx = combatVfxFor(this.world);
      vfx.crystalPulse(at.x, at.y, Layer.Surface);
      for (const id of victims) {
        const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
        health.current -= CRYSTAL_QUEEN_POWERS.pulseDamage;
        if (health.current > 0) continue;
        const pos = this.posOf(id)!;
        vfx.death(pos.x, pos.y, Layer.Surface, 'ant', 0);
        this.world.destroyEntity(id);
      }
    }
  }

  private enemyAntsNear(queen: EntityId, at: Vector2, radius: number): EntityId[] {
    const owner = ownerOf(this.world, queen) ?? FactionId.RIVAL;
    const out: EntityId[] = [];
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.HEALTH)) {
      if (!this.onSurface(id)) continue;
      const faction = ownerOf(this.world, id);
      if (faction === null || relation(owner, faction) !== 'enemy') continue;
      const pos = this.posOf(id)!;
      if (Math.hypot(pos.x - at.x, pos.y - at.y) <= radius) out.push(id);
    }
    return out;
  }

  // ── Lookups ──────────────────────────────────────────────

  /** The rival's hive (a Crystal player's own Hive is never run by this AI) */
  private hive(): EntityId | null {
    return this.world.query(COMPONENT.CRYSTAL_HIVE, COMPONENT.POSITION).find((id) => ownerOf(this.world, id) !== FactionId.PLAYER) ?? null;
  }

  private spiresOf(hive: EntityId): EntityId[] {
    return this.world.query(COMPONENT.CRYSTAL_SPIRE).filter(
      (id) => this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE)!.hiveId === hive,
    );
  }

  /** Idle units at home, oldest first */
  private garrisonOf(hive: EntityId): EntityId[] {
    return this.world.query(COMPONENT.CRYSTAL_UNIT).filter((id) => {
      const unit = this.world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!;
      return unit.hiveId === hive && unit.state === CrystalUnitState.Guarding && unit.kind !== 'queen';
    }).sort((a, b) => a - b);
  }

  /** The closest enemy base core: a nest, or a Crystal player's Hive */
  private enemyNest(hive: EntityId): Vector2 | null {
    return nearestEnemyBase(this.world, ownerOf(this.world, hive) ?? FactionId.RIVAL, this.posOf(hive)!);
  }

  private posOf(id: EntityId): PositionComponent | undefined {
    return this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
  }

  private onSurface(id: EntityId): boolean {
    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
    return !layer || layer.layer === Layer.Surface;
  }
}
