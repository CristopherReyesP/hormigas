import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../shared/types';
import { findPath, type PathGrid } from '../../simulation/pathfinding/AStar';
import {
  COMPONENT,
  CrystalUnitState,
  type CrystalHiveComponent,
  type CrystalUnitComponent,
  type PathComponent,
  type PositionComponent,
} from '../components/components';
import { createCrystalDrone } from '../entities/factories';
import { FactionId, nearestEnemyBase, ownerOf } from '../factions/factions';
import { CRYSTAL_HIVE_STATS, crystalWaveSize, planCrystalWave, stepHiveProduction } from '../rival/crystalHive';
import { ORDER_PATH_MAX_STEPS } from '../../shared/constants';
import type { DayPhase } from './DayNightSystem';

/** What the hive reads from the day/night cycle (DayNightSystem, or a test clock). */
export interface NightClock {
  getPhase(): DayPhase;
  getDayNumber(): number;
}

export interface CrystalHiveOptions {
  /**
   * The hive launches its own wave at every nightfall, sized by crystalWaveSize
   * (on by default). The real game turns it off: UndergroundInvasionSystem
   * folds the hive's drones into each wave through launchRaid().
   */
  autoRaids?: boolean;
}

/** Drones crystallize on a small ring around the hive, one slot after another. */
const SPAWN_RING = 2;
const SPAWN_SLOTS = 8;

/**
 * The Crystal Hive's scripted brain (P5-lite): each hive crystallizes drones
 * on a fixed clock up to its garrison cap, and at every nightfall sends a wave
 * sized by the night number at the nearest enemy nest. The garrison leaves
 * first; the hive crystallizes the rest on the spot, so every wave is full.
 * Deterministic: no randomness, game time only.
 */
export class CrystalHiveSystem implements System {
  readonly name = 'CrystalHiveSystem';
  readonly priority = 4.5; // after DayNight (4), before AntAI (5)

  private world: World;
  private grid: PathGrid;
  private clock: NightClock;
  private lastPhase: DayPhase;
  private spawnCount = 0;
  private autoRaids: boolean;

  constructor(world: World, grid: PathGrid, clock: NightClock, options: CrystalHiveOptions = {}) {
    this.world = world;
    this.grid = grid;
    this.clock = clock;
    this.lastPhase = clock.getPhase();
    this.autoRaids = options.autoRaids ?? true;
  }

  /** The first hive still standing (the run has one) */
  private firstHive(): EntityId | null {
    const hives = this.world.query(COMPONENT.CRYSTAL_HIVE, COMPONENT.POSITION);
    return hives.length > 0 ? hives[0] : null;
  }

  /** Send `count` drones from the hive at the nearest enemy nest now; returns the drones sent */
  launchRaid(count: number): EntityId[] {
    const hiveId = this.firstHive();
    return hiveId === null ? [] : this.launchWave(hiveId, count);
  }

  /** Where raids leave from, in tiles (null once the hive is gone) */
  raidOrigin(): Vector2 | null {
    const hiveId = this.firstHive();
    if (hiveId === null) return null;
    const pos = this.world.getComponent<PositionComponent>(hiveId, COMPONENT.POSITION)!;
    return { x: pos.x, y: pos.y };
  }

  update(dt: number): void {
    const phase = this.clock.getPhase();
    const nightfall = this.lastPhase !== 'night' && phase === 'night';
    this.lastPhase = phase;

    for (const hiveId of this.world.query(COMPONENT.CRYSTAL_HIVE, COMPONENT.POSITION)) {
      const hive = this.world.getComponent<CrystalHiveComponent>(hiveId, COMPONENT.CRYSTAL_HIVE)!;
      const garrison = this.garrisonOf(hiveId);
      const step = stepHiveProduction(hive.productionTimer, dt, garrison.length, CRYSTAL_HIVE_STATS.garrisonCap);
      hive.productionTimer = step.timer;
      if (step.spawn) this.crystallize(hiveId);

      const night = this.clock.getDayNumber();
      if (this.autoRaids && nightfall && hive.lastWaveNight < night) {
        hive.lastWaveNight = night;
        this.launchWave(hiveId, crystalWaveSize(night));
      }
    }
  }

  /** Idle drones at home, oldest first */
  private garrisonOf(hiveId: EntityId): EntityId[] {
    const out: EntityId[] = [];
    for (const id of this.world.query(COMPONENT.CRYSTAL_UNIT)) {
      const unit = this.world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!;
      if (unit.hiveId === hiveId && unit.state === CrystalUnitState.Guarding) out.push(id);
    }
    return out.sort((a, b) => a - b);
  }

  private crystallize(hiveId: EntityId): EntityId {
    const at = this.world.getComponent<PositionComponent>(hiveId, COMPONENT.POSITION)!;
    const slot = this.spawnSlot(at);
    return createCrystalDrone(this.world, slot.x, slot.y, hiveId, ownerOf(this.world, hiveId) ?? FactionId.RIVAL);
  }

  /** The next walkable tile on the ring around the hive (the hive tile itself when none is) */
  private spawnSlot(at: PositionComponent): Vector2 {
    for (let tries = 0; tries < SPAWN_SLOTS; tries++) {
      const angle = ((this.spawnCount++ % SPAWN_SLOTS) / SPAWN_SLOTS) * Math.PI * 2;
      const x = Math.round(at.x + Math.cos(angle) * SPAWN_RING);
      const y = Math.round(at.y + Math.sin(angle) * SPAWN_RING);
      if (this.grid.isWalkable(x, y)) return { x, y };
    }
    return { x: at.x, y: at.y };
  }

  private launchWave(hiveId: EntityId, size: number): EntityId[] {
    const target = this.enemyNestOf(hiveId);
    if (!target) return [];
    const plan = planCrystalWave(size, this.garrisonOf(hiveId));
    const wave = [...plan.sent];
    for (let i = 0; i < plan.crystallize; i++) wave.push(this.crystallize(hiveId));
    if (wave.length === 0) return [];

    // One shared route from the hive: every drone starts within a few tiles of it
    const hivePos = this.world.getComponent<PositionComponent>(hiveId, COMPONENT.POSITION)!;
    const route = findPath(this.grid, hivePos, target, ORDER_PATH_MAX_STEPS);
    for (const id of wave) {
      const unit = this.world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!;
      unit.state = CrystalUnitState.Assaulting;
      unit.goal = { x: target.x, y: target.y };
      unit.repathTimer = 0;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
      if (path && route) {
        path.waypoints = route.map((p) => ({ x: p.x, y: p.y }));
        path.currentIndex = 0;
      }
    }
    this.world.pushNotification(
      'danger',
      wave.length === 1
        ? '💎 Un dron de cristal sale de la Colmena hacia tu nido'
        : `💎 La Colmena de Cristal lanza una oleada: ${wave.length} drones van hacia tu nido`,
    );
    return wave;
  }

  /** The closest nest of a faction this hive is at war with, as a tile */
  private enemyNestOf(hiveId: EntityId): Vector2 | null {
    const owner = ownerOf(this.world, hiveId) ?? FactionId.RIVAL;
    return nearestEnemyBase(this.world, owner, this.world.getComponent<PositionComponent>(hiveId, COMPONENT.POSITION)!);
  }
}
