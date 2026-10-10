import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../shared/types';
import { findPath, type PathGrid } from '../../simulation/pathfinding/AStar';
import {
  COMPONENT,
  CrystalUnitState,
  Layer,
  type CombatComponent,
  type CrystalUnitComponent,
  type LayerComponent,
  type PathComponent,
  type PositionComponent,
  type RoleStatsComponent,
} from '../components/components';
import { FactionId, ownerOf, relation } from '../factions/factions';
import { CRYSTAL_DRONE_STATS, CRYSTAL_HIVE_STATS } from '../rival/crystalHive';
import { CRYSTAL_ECONOMY } from '../rival/crystalRival';
import { ORDER_PATH_MAX_STEPS } from '../../shared/constants';

/** Seconds between two route requests while chasing a moving enemy */
const CHASE_REPATH_INTERVAL = 0.7;
/** Seconds to wait before retrying when no route to the goal exists */
const NO_ROUTE_RETRY = 2;
/** An assaulting drone counts as arrived this close to its goal */
const GOAL_ARRIVED = 1.5;

interface Prey {
  id: EntityId;
  x: number;
  y: number;
  faction: FactionId;
}

/**
 * Drives Crystal units. Crystal units are not ants, so they get their own
 * small brain: fight the nearest enemy-faction unit in sight, otherwise march
 * (Assaulting: attack-move to the goal) or keep near the hive (Guarding).
 * Crystal units fight only factions they are at war with; wildlife is left
 * alone, so beetles and crickets behave as before.
 */
export class CrystalUnitAISystem implements System {
  readonly name = 'CrystalUnitAISystem';
  readonly priority = 6; // after AntAI (5), before Combat (7)

  private world: World;
  private grid: PathGrid;
  private prey: Prey[] = [];

  constructor(world: World, grid: PathGrid) {
    this.world = world;
    this.grid = grid;
  }

  update(dt: number): void {
    const units = this.world.query(COMPONENT.CRYSTAL_UNIT, COMPONENT.POSITION, COMPONENT.PATH);
    if (units.length === 0) return;
    this.snapshotPrey();

    for (const id of units) {
      if (!this.onSurface(id)) continue;
      const unit = this.world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
      unit.repathTimer = Math.max(0, unit.repathTimer - dt);
      if (unit.hiveId !== null && !this.world.hasEntity(unit.hiveId)) unit.hiveId = null;

      const target = this.pickTarget(id, pos);
      if (target) {
        this.engage(unit, pos, path, combat, target);
        continue;
      }
      if (combat) combat.targetEntityId = null;

      if (unit.state === CrystalUnitState.Assaulting && unit.goal) {
        this.march(unit, pos, path, unit.goal);
      } else if (unit.state === CrystalUnitState.Raiding && unit.goal) {
        this.raid(unit, pos, path, unit.goal, dt);
      } else {
        this.guard(unit, pos, path);
      }
    }
  }

  /** Surface units of every non-wildlife faction; each drone keeps only its enemies */
  private snapshotPrey(): void {
    this.prey.length = 0;
    for (const store of [COMPONENT.ANT, COMPONENT.CRYSTAL_UNIT]) {
      for (const id of this.world.query(store, COMPONENT.POSITION, COMPONENT.HEALTH)) {
        if (!this.onSurface(id)) continue;
        const faction = ownerOf(this.world, id);
        if (faction === null || faction === FactionId.WILDLIFE) continue;
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        this.prey.push({ id, x: pos.x, y: pos.y, faction });
      }
    }
  }

  private onSurface(id: EntityId): boolean {
    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
    return !layer || layer.layer === Layer.Surface;
  }

  /** Keep the current enemy while it is alive and within the leash, else the nearest one in sight */
  private pickTarget(id: EntityId, pos: PositionComponent): Prey | null {
    const own = ownerOf(this.world, id) ?? FactionId.RIVAL;
    const vision = this.world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS)?.visionRange ?? CRYSTAL_DRONE_STATS.visionRange;
    const current = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)?.targetEntityId ?? null;
    let best: Prey | null = null;
    let bestDist = Infinity;
    for (const prey of this.prey) {
      if (relation(own, prey.faction) !== 'enemy') continue;
      const dist = Math.hypot(prey.x - pos.x, prey.y - pos.y);
      if (prey.id === current && dist <= CRYSTAL_DRONE_STATS.leashRange) return prey;
      if (dist <= vision && (dist < bestDist || (dist === bestDist && best !== null && prey.id < best.id))) {
        best = prey;
        bestDist = dist;
      }
    }
    return best;
  }

  /** Close in and bite; CombatSystem lands the hit once in range */
  private engage(
    unit: CrystalUnitComponent,
    pos: PositionComponent,
    path: PathComponent,
    combat: CombatComponent | undefined,
    target: Prey,
  ): void {
    const dist = Math.hypot(target.x - pos.x, target.y - pos.y);
    const range = combat?.attackRange ?? CRYSTAL_DRONE_STATS.attackRange;
    if (combat) combat.targetEntityId = target.id;
    if (dist <= range) {
      path.waypoints = [];
      path.currentIndex = 0;
      return;
    }
    const pathDone = path.currentIndex >= path.waypoints.length;
    if (unit.repathTimer > 0 && !pathDone) return;
    unit.repathTimer = CHASE_REPATH_INTERVAL;
    this.route(pos, path, { x: target.x, y: target.y });
  }

  /** Attack-move: head for the goal; the fights on the way happen in update() */
  private march(unit: CrystalUnitComponent, pos: PositionComponent, path: PathComponent, goal: Vector2): void {
    if (Math.hypot(goal.x - pos.x, goal.y - pos.y) <= GOAL_ARRIVED) {
      path.waypoints = [];
      path.currentIndex = 0;
      return;
    }
    const routeEnd = path.waypoints[path.waypoints.length - 1];
    const onCourse = path.currentIndex < path.waypoints.length && routeEnd !== undefined
      && Math.round(routeEnd.x) === Math.round(goal.x) && Math.round(routeEnd.y) === Math.round(goal.y);
    if (onCourse || unit.repathTimer > 0) return;
    unit.repathTimer = this.route(pos, path, goal) ? 0 : NO_ROUTE_RETRY;
  }

  /**
   * Harass: attack-move to the player's field, stay there a while (the hive
   * siphons the field while `raidTimer` runs), then head home to guard.
   */
  private raid(unit: CrystalUnitComponent, pos: PositionComponent, path: PathComponent, goal: Vector2, dt: number): void {
    if (unit.raidTimer === undefined) {
      if (Math.hypot(goal.x - pos.x, goal.y - pos.y) > GOAL_ARRIVED + 1) {
        this.march(unit, pos, path, goal);
        return;
      }
      unit.raidTimer = CRYSTAL_ECONOMY.raidSiphonSeconds;
      path.waypoints = [];
      path.currentIndex = 0;
    }
    unit.raidTimer -= dt;
    if (unit.raidTimer > 0) return;
    unit.state = CrystalUnitState.Guarding;
    unit.goal = null;
    unit.raidTimer = undefined;
    unit.repathTimer = 0;
  }

  /** At home: drift back when it strays past the guard radius */
  private guard(unit: CrystalUnitComponent, pos: PositionComponent, path: PathComponent): void {
    if (unit.hiveId === null) return;
    const hive = this.world.getComponent<PositionComponent>(unit.hiveId, COMPONENT.POSITION);
    if (!hive) return;
    const away = Math.hypot(hive.x - pos.x, hive.y - pos.y);
    if (away <= CRYSTAL_HIVE_STATS.guardRadius) {
      // Close enough: stop any leftover chase route here
      if (path.currentIndex < path.waypoints.length) {
        const end = path.waypoints[path.waypoints.length - 1];
        if (Math.hypot(end.x - hive.x, end.y - hive.y) > CRYSTAL_HIVE_STATS.guardRadius) {
          path.waypoints = [];
          path.currentIndex = 0;
        }
      }
      return;
    }
    if (path.currentIndex < path.waypoints.length || unit.repathTimer > 0) return;
    unit.repathTimer = this.route(pos, path, { x: hive.x, y: hive.y }) ? 0 : NO_ROUTE_RETRY;
  }

  private route(pos: PositionComponent, path: PathComponent, goal: Vector2): boolean {
    const route = findPath(
      this.grid,
      { x: Math.round(pos.x), y: Math.round(pos.y) },
      { x: Math.round(goal.x), y: Math.round(goal.y) },
      ORDER_PATH_MAX_STEPS,
    );
    if (!route || route.length === 0) return false;
    path.waypoints = route;
    path.currentIndex = 0;
    return true;
  }
}
