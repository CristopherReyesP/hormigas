// The player's Crystal Hive behind one seam (P10): GameManager builds this when
// the run's player race is the Crystal Hive and routes the race-specific parts
// through it (the start, build mode, production, waves, the HUD snapshot).

import type { World } from '../../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../../shared/types';
import type { PathGrid } from '../../../simulation/pathfinding/AStar';
import {
  COMPONENT,
  type CrystalSpireComponent,
  type CrystalUnitComponent,
} from '../../components/components';
import { FactionId, ownerOf } from '../../factions/factions';
import { CRYSTAL_MAX_FLOORS } from '../../rival/crystalRival';
import type { ObjectiveState } from '../../systems/ObjectiveSystem';
import { CrystalPlayerSystem, type ActionResult, type BuildResult } from './CrystalPlayerSystem';
import { CrystalPlayerUnitSystem } from './CrystalPlayerUnitSystem';
import { CrystalSurfaceWaveSystem, type WaveClock } from './CrystalSurfaceWaveSystem';
import { checkPlacement } from './crystalPlacement';
import { spawnCrystalPlayerBase } from './crystalPlayerSetup';
import { constructionProgress } from './crystalPlayerComponents';
import {
  CRYSTAL_FLOOR,
  CRYSTAL_NIGHT_MILESTONE,
  CRYSTAL_PLAYER_ECONOMY,
  CRYSTAL_STRUCTURES,
  productionTime,
  type CrystalBuildKind,
  type CrystalPlayerUnitKind,
} from './crystalPlayerRules';

/** What a click places while build mode is on */
export type CrystalBuildMode = CrystalBuildKind;

export interface CrystalSelectionInfo {
  entityId: EntityId;
  kind: 'hive' | 'spire' | 'unit';
  spireKind?: CrystalBuildKind;
  floors?: number;
  maxFloors?: number;
  /** Still crystallizing: a new structure, or a new floor */
  construction?: { kind: 'build' | 'floor'; progress: number; remaining: number };
  producer?: {
    queue: CrystalPlayerUnitKind[];
    /** 0..1 of the first unit */
    progress: number;
    /** Seconds left on the first unit */
    remaining: number;
    blocked: 'supply' | null;
    rally: Vector2 | null;
  };
}

/** The Crystal Hive's side of the HUD */
export interface CrystalPlayerSnapshot {
  minerals: number;
  /** Minerals per second right now: the Hive's trickle plus working extractors */
  income: number;
  supply: { used: number; cap: number };
  buildMode: CrystalBuildMode | null;
  units: { drones: number; sentinels: number };
  structures: { extractors: number; forges: number; prisms: number; growing: number };
  hiveHealth: { current: number; max: number } | null;
  hiveShield: { current: number; max: number } | null;
  /** The selected own Crystal structure or unit */
  selection: CrystalSelectionInfo | null;
  /** The selected own units by kind (a group or one) */
  selectedKinds: { drones: number; sentinels: number };
}

/** What the renderer draws for the Crystal Hive: the build ghost and the selected spire's rally point */
export interface CrystalOverlay {
  ghost: { x: number; y: number; kind: CrystalBuildKind; valid: boolean } | null;
  rally: { from: Vector2; to: Vector2 } | null;
}

export class CrystalPlayerController {
  readonly system: CrystalPlayerSystem;
  readonly units: CrystalPlayerUnitSystem;
  readonly waves: CrystalSurfaceWaveSystem;
  private world: World;
  private isExplored: (x: number, y: number) => boolean;
  private buildMode: CrystalBuildMode | null = null;
  private hover: Vector2 | null = null;

  constructor(world: World, grid: PathGrid, clock: WaveClock, isExplored: (x: number, y: number) => boolean) {
    this.world = world;
    this.isExplored = isExplored;
    this.system = new CrystalPlayerSystem(world, grid);
    this.units = new CrystalPlayerUnitSystem(world, grid);
    this.waves = new CrystalSurfaceWaveSystem(world, grid, clock);
    world.addSystem(this.system);
    world.addSystem(this.units);
    world.addSystem(this.waves);
  }

  /** The run's start: the Hive at (x, y), two drones and the mineral stock */
  spawnBase(x: number, y: number): EntityId {
    return spawnCrystalPlayerBase(this.world, x, y).hiveId;
  }

  hiveAlive(): boolean {
    return this.system.hive() !== null;
  }

  private milestoneReached = false;

  /**
   * The endless run's milestone hook: at the dawn after night 7 the Hive is
   * rewarded once and play goes on. Returns true on the tick it fires.
   */
  checkNightMilestone(previousPhase: 'day' | 'night', phase: 'day' | 'night', dayNumber: number): boolean {
    if (this.milestoneReached || this.system.hive() === null) return false;
    if (!(previousPhase === 'night' && phase === 'day' && dayNumber >= CRYSTAL_NIGHT_MILESTONE.night + 1)) return false;
    this.milestoneReached = true;
    this.world.minerals.deposit(CRYSTAL_NIGHT_MILESTONE.reward);
    this.world.pushNotification('success', `💎 ¡Sobreviviste ${CRYSTAL_NIGHT_MILESTONE.night} noches! La colmena recibe ${CRYSTAL_NIGHT_MILESTONE.reward} minerales. Las oleadas siguen.`);
    return true;
  }

  // ── Build mode ───────────────────────────────────────────

  setBuildMode(mode: CrystalBuildMode | null): void {
    this.buildMode = mode;
  }

  getBuildMode(): CrystalBuildMode | null {
    return this.buildMode;
  }

  /** The pointer is over this tile: the ghost follows it */
  setHover(tile: Vector2 | null): void {
    this.hover = tile ? { x: Math.round(tile.x), y: Math.round(tile.y) } : null;
  }

  /** Place the armed structure on `tile`; on success build mode ends (Shift keeps it in a later pass) */
  tryPlace(tile: Vector2): BuildResult {
    const mode = this.buildMode;
    if (!mode) return { ok: false, reason: 'Elige primero qué construir.' };
    this.setHover(tile);
    const result = this.system.startStructure(mode, tile, this.system.placementWorld(this.isExplored));
    if (result.ok) this.buildMode = null;
    return result;
  }

  // ── Production ───────────────────────────────────────────

  queueUnit(spireId: EntityId, kind: CrystalPlayerUnitKind): ActionResult {
    return this.system.queueUnit(spireId, kind);
  }

  addFloor(spireId: EntityId): ActionResult {
    return this.system.addFloor(spireId);
  }

  cancelLast(spireId: EntityId): boolean {
    return this.system.cancelLast(spireId);
  }

  /** Rally the selected spire's units to `tile`; false when `spireId` is no own production spire */
  setRally(spireId: EntityId, tile: Vector2): boolean {
    return this.system.setRally(spireId, tile);
  }

  /** An own production spire (it has a queue) */
  isOwnProducer(id: EntityId): boolean {
    return this.system.producerOf(id) !== undefined && ownerOf(this.world, id) === FactionId.PLAYER;
  }

  // ── HUD ──────────────────────────────────────────────────

  snapshot(selected: EntityId | null, selectedUnits: readonly EntityId[]): CrystalPlayerSnapshot {
    const structures = { extractors: 0, forges: 0, prisms: 0, growing: 0 };
    let working = 0;
    for (const id of this.system.structures()) {
      const spire = this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE)!;
      const growing = this.system.constructionOf(id)?.kind === 'build';
      if (growing) structures.growing++;
      else if (spire.kind === 'extractor') {
        structures.extractors++;
        working++;
      } else if (spire.kind === 'forge') structures.forges++;
      else structures.prisms++;
    }
    const units = { drones: 0, sentinels: 0 };
    for (const id of this.system.units()) {
      const kind = this.world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!.kind;
      if (kind === 'drone') units.drones++;
      else if (kind === 'sentinel') units.sentinels++;
    }
    const selectedKinds = { drones: 0, sentinels: 0 };
    for (const id of selectedUnits) {
      const kind = this.world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)?.kind;
      if (kind === 'drone') selectedKinds.drones++;
      else if (kind === 'sentinel') selectedKinds.sentinels++;
    }
    const hive = this.system.hive();
    const health = hive !== null ? this.world.getComponent<{ current: number; max: number }>(hive, COMPONENT.HEALTH) : undefined;
    const shield = hive !== null ? this.world.getComponent<{ current: number; max: number }>(hive, COMPONENT.SHIELD) : undefined;
    return {
      minerals: Math.floor(this.world.minerals.stored),
      income: hive === null ? 0 : CRYSTAL_PLAYER_ECONOMY.hiveTrickle + working * CRYSTAL_PLAYER_ECONOMY.extractorRate,
      supply: this.system.supply(),
      buildMode: this.buildMode,
      units,
      structures,
      hiveHealth: health ? { current: health.current, max: health.max } : null,
      hiveShield: shield ? { current: shield.current, max: shield.max } : null,
      selection: selected === null ? null : this.selectionInfo(selected),
      selectedKinds,
    };
  }

  private selectionInfo(id: EntityId): CrystalSelectionInfo | null {
    if (ownerOf(this.world, id) !== FactionId.PLAYER) return null;
    if (this.world.getComponent(id, COMPONENT.CRYSTAL_HIVE)) return { entityId: id, kind: 'hive' };
    if (this.world.getComponent(id, COMPONENT.CRYSTAL_UNIT)) return { entityId: id, kind: 'unit' };
    const spire = this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE);
    if (!spire) return null;
    const info: CrystalSelectionInfo = { entityId: id, kind: 'spire', spireKind: spire.kind, floors: spire.floors, maxFloors: CRYSTAL_MAX_FLOORS };
    const c = this.system.constructionOf(id);
    if (c) info.construction = { kind: c.kind, progress: constructionProgress(c), remaining: Math.max(0, c.total - c.elapsed) };
    const producer = this.system.producerOf(id);
    if (producer) {
      const head = producer.queue[0];
      const total = head ? productionTime(head, spire.floors) : 0;
      info.producer = {
        queue: [...producer.queue],
        progress: head ? Math.min(1, producer.progress / total) : 0,
        remaining: head ? Math.max(0, total - producer.progress) : 0,
        blocked: producer.blocked,
        rally: producer.rally ? { ...producer.rally } : null,
      };
    }
    return info;
  }

  /** The Crystal Hive's milestones: they teach the build, then point at the win */
  objective(): ObjectiveState {
    const stats = this.system.stats();
    const snap = this.snapshot(null, []);
    const floors = this.system.structures().some((id) => (this.world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE)?.floors ?? 1) > 1);
    const steps: Array<{ title: string; description: string; progress: number; target: number }> = [
      {
        title: '💎 Extraer cristal',
        description: `Levanta un Extractor (${CRYSTAL_STRUCTURES.extractor.cost} minerales) junto a un yacimiento: explora con tus drones para encontrarlo`,
        progress: snap.structures.extractors,
        target: 1,
      },
      {
        title: '🗼 Primera aguja',
        description: `Levanta una Aguja de drones (${CRYSTAL_STRUCTURES.forge.cost}) cerca de la colmena`,
        progress: snap.structures.forges + snap.structures.prisms,
        target: 1,
      },
      {
        title: '🔷 Ejército de cristal',
        description: 'Selecciona la aguja y cristaliza 4 unidades',
        progress: stats.unitsMade,
        target: 4,
      },
      {
        title: '🏙️ Crecer hacia arriba',
        description: `Añade un piso a una aguja (${CRYSTAL_FLOOR.cost}): produce más rápido y da más suministro`,
        progress: floors ? 1 : 0,
        target: 1,
      },
    ];
    const done = steps.filter((s) => s.progress >= s.target).length;
    const current = steps.find((s) => s.progress < s.target);
    if (!current) {
      return {
        title: '👑 La colmena prevalece',
        description: 'Resiste las oleadas (la séptima noche trae una recompensa) o destruye el núcleo rival',
        progress: done,
        target: steps.length,
        completedCount: done,
        totalCount: steps.length,
      };
    }
    return { ...current, progress: Math.min(current.progress, current.target), completedCount: done, totalCount: steps.length };
  }

  /** The build ghost and the selected spire's rally line, for the renderer */
  overlay(selected: EntityId | null): CrystalOverlay {
    let ghost: CrystalOverlay['ghost'] = null;
    if (this.buildMode && this.hover) {
      const valid = checkPlacement(this.buildMode, this.hover, this.system.placementWorld(this.isExplored)).ok
        && this.world.minerals.stored >= CRYSTAL_STRUCTURES[this.buildMode].cost;
      ghost = { x: this.hover.x, y: this.hover.y, kind: this.buildMode, valid };
    }
    let rally: CrystalOverlay['rally'] = null;
    if (selected !== null) {
      const to = this.system.producerOf(selected)?.rally;
      const from = this.world.getComponent<Vector2>(selected, COMPONENT.POSITION);
      if (to && from) rally = { from: { x: from.x, y: from.y }, to: { ...to } };
    }
    return { ghost, rally };
  }
}
