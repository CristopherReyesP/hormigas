import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../shared/types';
import { findPath, type PathGrid } from '../../simulation/pathfinding/AStar';
import {
  AntRole,
  COMPONENT,
  Layer,
  isOreLoad,
  type AntComponent,
  type CarryingComponent,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type PathComponent,
  type PositionComponent,
} from '../components/components';
import { FactionId, ownerOf, relation } from '../factions/factions';
import {
  HUMAN_BUILDING_STATS,
  HUMAN_ECONOMY,
  HUMAN_RAID_AT,
  HUMAN_UNIT_STATS,
  humanIncome,
  humanRaidSize,
  humanSupplyCap,
  humanWaveSquad,
  nextBuildStep,
  pickBuildSlot,
  pickTrainee,
  pickTurretTarget,
  type HumanBuildingKind,
  type HumanUnitType,
  type TurretCandidate,
} from '../rival/humanBase';
import {
  HUMAN_COMPONENT,
  createHumanBuilding,
  createHumanUnit,
  type HumanBuildingComponent,
  type HumanUnitComponent,
} from '../rival/humanFactories';
import { ORDER_PATH_MAX_STEPS } from '../../shared/constants';
import type { DayPhase } from './DayNightSystem';

/** What the base reads from the day/night cycle (DayNightSystem, or a test clock). */
export interface HumanClock {
  getPhase(): DayPhase;
  getDayNumber(): number;
  getPhaseProgress(): number;
}

export interface HumanBaseOptions {
  /**
   * The base launches its own wave at every nightfall (on by default). The
   * real game turns it off: UndergroundInvasionSystem folds the base's troops
   * into each wave through launchRaid().
   */
  autoRaids?: boolean;
}

/** What the HUD and the info panel show about the base. */
export interface HumanBaseStatus {
  rations: number;
  supply: number;
  supplyCap: number;
  /** Build-order steps done so far */
  built: number;
  /** The building the builder is working on, if any */
  building: HumanBuildingKind | null;
}

interface BuildJob {
  kind: HumanBuildingKind;
  slot: Vector2;
  /** The frame once the builder has laid it down */
  buildingId: EntityId | null;
}

/** The builder starts work this close to its slot */
const BUILD_REACH = 1.5;
/** Troops appear on a small ring around the building that made them */
const SPAWN_RING = 2;
const SPAWN_SLOTS = 8;
/** Seconds between two builder route requests */
const BUILDER_REPATH = 1;

/**
 * The Humans' scripted brain (P9): passive rations from the command center
 * and its supply depots; a builder that raises the next building of the
 * build order (HUMAN_BUILD_ORDER, which unlocks by night); barracks that
 * train troops in parallel up to the supply cap; bunkers that shoot enemies
 * in range; a day raid on the player's miners and scouts; and, at nightfall,
 * the night wave. Deterministic: no randomness, game time only.
 */
export class HumanBaseSystem implements System {
  readonly name = 'HumanBaseSystem';
  readonly priority = 4.5; // after DayNight (4), before AntAI (5)

  private world: World;
  private grid: PathGrid;
  private clock: HumanClock;
  private autoRaids: boolean;
  private lastPhase: DayPhase;
  private rations: number = HUMAN_ECONOMY.startRations;
  private built = 0;
  private job: BuildJob | null = null;
  private trained = 0;
  private builderTimer = 0;
  private builderRepath = 0;
  private lastRaidDay = 0;
  private lastWaveNight = 0;
  private spawnCount = 0;
  private enemies: TurretCandidate[] = [];

  constructor(world: World, grid: PathGrid, clock: HumanClock, options: HumanBaseOptions = {}) {
    this.world = world;
    this.grid = grid;
    this.clock = clock;
    this.autoRaids = options.autoRaids ?? true;
    this.lastPhase = clock.getPhase();
  }

  /** The first command center still standing (the run has one) */
  private core(): EntityId | null {
    for (const id of this.world.query(HUMAN_COMPONENT.BUILDING, COMPONENT.POSITION)) {
      if (this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind === 'command_center') return id;
    }
    return null;
  }

  private factionOf(id: EntityId | null): FactionId {
    return (id !== null ? ownerOf(this.world, id) : null) ?? FactionId.RIVAL;
  }

  /** Where raids leave from, in tiles (null once the command center is gone) */
  raidOrigin(): Vector2 | null {
    const core = this.core();
    if (core === null) return null;
    const pos = this.world.getComponent<PositionComponent>(core, COMPONENT.POSITION)!;
    return { x: pos.x, y: pos.y };
  }

  getStatus(): HumanBaseStatus {
    const core = this.core();
    const faction = this.factionOf(core);
    return {
      rations: Math.floor(this.rations),
      supply: this.supplyUsed(faction),
      supplyCap: humanSupplyCap(this.finished('supply_depot', faction).length),
      built: this.built,
      building: this.job?.kind ?? null,
    };
  }

  update(dt: number): void {
    const phase = this.clock.getPhase();
    const nightfall = this.lastPhase !== 'night' && phase === 'night';
    this.lastPhase = phase;

    this.snapshotEnemies();
    this.aimTurrets();

    const core = this.core();
    if (core === null) return;
    const faction = this.factionOf(core);
    const day = this.clock.getDayNumber();

    this.rations += humanIncome(this.finished('supply_depot', faction).length) * dt;
    this.runBuilder(core, faction, day, dt);
    this.runBarracks(faction, day, dt);

    if (phase === 'day' && day > this.lastRaidDay && this.clock.getPhaseProgress() >= HUMAN_RAID_AT) {
      this.lastRaidDay = day;
      this.launchDayRaid(core, faction, day);
    }
    if (this.autoRaids && nightfall && this.lastWaveNight < day) {
      this.lastWaveNight = day;
      this.launchRaid(2 + day);
    }
  }

  // ── Turrets ──

  /** Surface units of every non-wildlife faction (each turret keeps only its enemies) */
  private snapshotEnemies(): void {
    this.enemies.length = 0;
    for (const store of [COMPONENT.ANT, COMPONENT.CRYSTAL_UNIT, HUMAN_COMPONENT.UNIT]) {
      for (const id of this.world.query(store, COMPONENT.POSITION, COMPONENT.HEALTH)) {
        const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
        if (layer && layer.layer !== Layer.Surface) continue;
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        this.enemies.push({ id, x: pos.x, y: pos.y });
      }
    }
  }

  /** Every finished turret takes the nearest enemy in range, keeping its target while it stays in range */
  private aimTurrets(): void {
    for (const id of this.world.query(HUMAN_COMPONENT.BUILDING, COMPONENT.COMBAT, COMPONENT.POSITION)) {
      const building = this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!;
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!;
      if (building.constructing > 0) {
        combat.targetEntityId = null;
        continue;
      }
      const own = this.factionOf(id);
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const foes = this.enemies.filter((e) => {
        const owner = ownerOf(this.world, e.id);
        return owner !== null && relation(own, owner) === 'enemy';
      });
      combat.targetEntityId = pickTurretTarget(pos, combat.attackRange, foes, combat.targetEntityId);
    }
  }

  // ── Buildings and the builder ──

  /** Finished buildings of `kind` owned by `faction` */
  private finished(kind: HumanBuildingKind, faction: FactionId): EntityId[] {
    return this.world.query(HUMAN_COMPONENT.BUILDING).filter((id) => {
      const b = this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!;
      return b.kind === kind && b.constructing <= 0 && this.factionOf(id) === faction;
    });
  }

  private unitsOf(faction: FactionId, type?: HumanUnitType): EntityId[] {
    return this.world.query(HUMAN_COMPONENT.UNIT).filter((id) => {
      if (this.factionOf(id) !== faction) return false;
      return type === undefined || this.world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type === type;
    });
  }

  private supplyUsed(faction: FactionId): number {
    let used = 0;
    for (const id of this.unitsOf(faction)) {
      used += HUMAN_UNIT_STATS[this.world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type].supply;
    }
    for (const id of this.world.query(HUMAN_COMPONENT.BUILDING)) {
      const training = this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.training;
      if (training && this.factionOf(id) === faction) used += HUMAN_UNIT_STATS[training].supply;
    }
    return used;
  }

  private runBuilder(core: EntityId, faction: FactionId, day: number, dt: number): void {
    const builders = this.unitsOf(faction, 'builder').sort((a, b) => a - b);
    if (builders.length === 0) {
      // The command center trains a new builder once the old one is gone
      this.builderTimer += dt;
      if (this.builderTimer >= HUMAN_ECONOMY.builderRespawn && this.rations >= HUMAN_UNIT_STATS.builder.cost) {
        this.rations -= HUMAN_UNIT_STATS.builder.cost;
        this.builderTimer = 0;
        this.spawnNear(core, 'builder', faction, core);
      }
      return;
    }
    this.builderTimer = 0;
    const builder = builders[0];
    const unit = this.world.getComponent<HumanUnitComponent>(builder, HUMAN_COMPONENT.UNIT)!;
    if (!this.job) {
      const step = nextBuildStep(this.built, day);
      if (!step || this.rations < HUMAN_BUILDING_STATS[step.kind].cost) return;
      const corePos = this.world.getComponent<PositionComponent>(core, COMPONENT.POSITION)!;
      const slot = pickBuildSlot(step.kind, tile(corePos), this.enemyNest(core) ?? tile(corePos), this.takenTiles(), (x, y) => this.grid.isWalkable(x, y));
      if (!slot) {
        this.built++; // no room left for it: the script moves on
        return;
      }
      this.rations -= HUMAN_BUILDING_STATS[step.kind].cost;
      this.job = { kind: step.kind, slot, buildingId: null };
      unit.state = 'building';
      unit.goal = { ...slot };
      this.builderRepath = 0;
    }
    this.work(builder, unit, faction, dt);
  }

  /** The builder walks to the job's slot, lays the frame down and raises it */
  private work(builder: EntityId, unit: HumanUnitComponent, faction: FactionId, dt: number): void {
    const job = this.job!;
    const pos = this.world.getComponent<PositionComponent>(builder, COMPONENT.POSITION)!;
    const path = this.world.getComponent<PathComponent>(builder, COMPONENT.PATH)!;
    unit.state = 'building';
    unit.goal = { ...job.slot };
    if (Math.hypot(job.slot.x - pos.x, job.slot.y - pos.y) > BUILD_REACH) {
      this.builderRepath = Math.max(0, this.builderRepath - dt);
      if (path.currentIndex >= path.waypoints.length && this.builderRepath <= 0) {
        this.builderRepath = BUILDER_REPATH;
        this.route(pos, path, job.slot);
      }
      return;
    }
    path.waypoints = [];
    path.currentIndex = 0;
    if (job.buildingId === null) {
      job.buildingId = createHumanBuilding(this.world, job.kind, job.slot.x, job.slot.y, faction, true);
    }
    if (!this.world.hasEntity(job.buildingId)) {
      this.finishJob(unit); // the frame was destroyed: that step is lost
      return;
    }
    const building = this.world.getComponent<HumanBuildingComponent>(job.buildingId, HUMAN_COMPONENT.BUILDING)!;
    const health = this.world.getComponent<HealthComponent>(job.buildingId, COMPONENT.HEALTH)!;
    const stats = HUMAN_BUILDING_STATS[job.kind];
    const step = Math.min(dt, building.constructing);
    building.constructing = Math.max(0, building.constructing - dt);
    health.current = Math.min(health.max, health.current + (health.max * 0.9 * step) / stats.buildTime);
    if (building.constructing <= 0) {
      this.finishJob(unit);
      this.world.pushNotification('warning', `🏗️ Los humanos terminaron ${BUILT_LABEL[job.kind]}`);
    }
  }

  private finishJob(unit: HumanUnitComponent): void {
    this.job = null;
    this.built++;
    unit.state = 'guarding';
    unit.goal = null;
  }

  /** Tiles taken by buildings, standing or framed */
  private takenTiles(): Vector2[] {
    const out: Vector2[] = [];
    for (const id of this.world.query(HUMAN_COMPONENT.BUILDING, COMPONENT.POSITION)) {
      out.push(tile(this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!));
    }
    if (this.job) out.push(this.job.slot);
    return out;
  }

  // ── Production ──

  /**
   * Every finished barracks trains in parallel, as long as rations and supply
   * allow. Rations for the next unlocked building come first: the build order
   * is never starved by training.
   */
  private runBarracks(faction: FactionId, day: number, dt: number): void {
    const cap = humanSupplyCap(this.finished('supply_depot', faction).length);
    const pending = this.job ? null : nextBuildStep(this.built, day);
    const reserve = pending ? HUMAN_BUILDING_STATS[pending.kind].cost : 0;
    for (const id of this.finished('barracks', faction).sort((a, b) => a - b)) {
      const barracks = this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!;
      if (barracks.training) {
        barracks.trainTimer = Math.max(0, barracks.trainTimer - dt);
        if (barracks.trainTimer > 0) continue;
        const core = this.core();
        this.spawnNear(id, barracks.training, faction, core);
        barracks.training = null;
      }
      const next = pickTrainee(day, this.trained);
      const stats = HUMAN_UNIT_STATS[next];
      if (this.rations - reserve < stats.cost || this.supplyUsed(faction) + stats.supply > cap) continue;
      this.rations -= stats.cost;
      this.trained++;
      barracks.training = next;
      barracks.trainTimer = stats.trainTime;
    }
  }

  private spawnNear(sourceId: EntityId, type: HumanUnitType, faction: FactionId, baseId: EntityId | null): EntityId {
    const at = this.world.getComponent<PositionComponent>(sourceId, COMPONENT.POSITION)!;
    const slot = this.spawnSlot(at);
    return createHumanUnit(this.world, type, slot.x, slot.y, baseId, faction);
  }

  /** The next walkable tile on the ring around a building (its own tile when none is) */
  private spawnSlot(at: PositionComponent): Vector2 {
    for (let tries = 0; tries < SPAWN_SLOTS; tries++) {
      const angle = ((this.spawnCount++ % SPAWN_SLOTS) / SPAWN_SLOTS) * Math.PI * 2;
      const x = Math.round(at.x + Math.cos(angle) * SPAWN_RING);
      const y = Math.round(at.y + Math.sin(angle) * SPAWN_RING);
      if (this.grid.isWalkable(x, y)) return { x, y };
    }
    return { x: at.x, y: at.y };
  }

  // ── Attacks ──

  /** Idle troops at home of `type`, oldest first */
  private garrison(faction: FactionId, type?: HumanUnitType): EntityId[] {
    return this.unitsOf(faction, type).filter((id) => {
      const unit = this.world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!;
      return unit.type !== 'builder' && unit.state === 'guarding';
    }).sort((a, b) => a - b);
  }

  /**
   * The night wave: `count` troops (humanWaveSquad: soldiers, marksmen from
   * night 2, tanks from night 5) march on the nearest enemy nest. The
   * garrison goes first; the command center calls up the rest on the spot,
   * so a wave always has its full size. Returns the troops sent.
   */
  launchRaid(count: number): EntityId[] {
    const core = this.core();
    if (core === null) return [];
    const target = this.enemyNest(core);
    if (!target) return [];
    const faction = this.factionOf(core);
    const night = this.clock.getDayNumber();
    const wave: EntityId[] = [];
    const used = new Set<EntityId>();
    for (const type of humanWaveSquad(night, count)) {
      const ready = this.garrison(faction, type).find((id) => !used.has(id));
      const id = ready ?? this.spawnNear(core, type, faction, core);
      used.add(id);
      wave.push(id);
    }
    if (wave.length === 0) return [];
    this.sendOut(wave, core, target, 'assaulting');
    this.world.pushNotification(
      'danger',
      `🪖 Los humanos lanzan un asalto: ${wave.length} ${wave.length === 1 ? 'tropa va' : 'tropas van'} hacia tu nido`,
    );
    return wave;
  }

  /** The day raid: a few garrison troops hunt the player's miners and scouts on the surface */
  private launchDayRaid(core: EntityId, faction: FactionId, day: number): void {
    const size = humanRaidSize(day);
    if (size <= 0) return;
    const corePos = this.world.getComponent<PositionComponent>(core, COMPONENT.POSITION)!;
    const prey = this.raidPrey(faction, corePos);
    if (!prey) return;
    const squad = this.garrison(faction).filter((id) => this.world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type !== 'tank').slice(0, size);
    if (squad.length === 0) return;
    this.sendOut(squad, core, prey, 'raiding');
    this.world.pushNotification('warning', `🪖 Una patrulla humana (${squad.length}) sale a cazar a tus obreras y exploradoras`);
  }

  /**
   * Where the raid goes: the enemy miner (a worker carrying ore) nearest the
   * base, else the nearest worker or scout on the surface, else nowhere.
   */
  private raidPrey(faction: FactionId, from: PositionComponent): Vector2 | null {
    let miner: { at: Vector2; d: number } | null = null;
    let other: { at: Vector2; d: number } | null = null;
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.POSITION)) {
      const owner = ownerOf(this.world, id);
      if (owner === null || relation(faction, owner) !== 'enemy') continue;
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      if (layer && layer.layer !== Layer.Surface) continue;
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role !== AntRole.Worker && ant.role !== AntRole.Scout) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const d = Math.hypot(pos.x - from.x, pos.y - from.y);
      const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
      const entry = { at: tile(pos), d };
      if (isOreLoad(carrying?.resourceType)) {
        if (!miner || d < miner.d) miner = entry;
      } else if (!other || d < other.d) {
        other = entry;
      }
    }
    return (miner ?? other)?.at ?? null;
  }

  private sendOut(units: readonly EntityId[], core: EntityId, goal: Vector2, state: 'assaulting' | 'raiding'): void {
    const from = this.world.getComponent<PositionComponent>(core, COMPONENT.POSITION)!;
    // One shared route from the base: every trooper starts within a few tiles of it
    const route = findPath(this.grid, tile(from), goal, ORDER_PATH_MAX_STEPS);
    for (const id of units) {
      const unit = this.world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!;
      unit.state = state;
      unit.goal = { x: goal.x, y: goal.y };
      unit.raidTimer = 0;
      unit.repathTimer = 0;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
      if (path && route) {
        path.waypoints = route.map((p) => ({ x: p.x, y: p.y }));
        path.currentIndex = 0;
      }
    }
  }

  /** The closest nest of a faction the base is at war with, as a tile */
  private enemyNest(core: EntityId): Vector2 | null {
    const owner = this.factionOf(core);
    const at = this.world.getComponent<PositionComponent>(core, COMPONENT.POSITION)!;
    let best: Vector2 | null = null;
    let bestDist = Infinity;
    for (const id of this.world.query(COMPONENT.NEST, COMPONENT.POSITION)) {
      const nestOwner = ownerOf(this.world, id);
      if (nestOwner === null || relation(owner, nestOwner) !== 'enemy') continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const dist = Math.hypot(pos.x - at.x, pos.y - at.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = tile(pos);
      }
    }
    return best;
  }

  private route(pos: PositionComponent, path: PathComponent, goal: Vector2): boolean {
    const route = findPath(this.grid, tile(pos), tile(goal), ORDER_PATH_MAX_STEPS);
    if (!route || route.length === 0) return false;
    path.waypoints = route;
    path.currentIndex = 0;
    return true;
  }
}

const BUILT_LABEL: Record<HumanBuildingKind, string> = {
  command_center: 'un Centro de Mando',
  barracks: 'un cuartel',
  bunker: 'un búnker',
  supply_depot: 'un depósito de suministros',
};

function tile(pos: { x: number; y: number }): Vector2 {
  return { x: Math.round(pos.x), y: Math.round(pos.y) };
}
