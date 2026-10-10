import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../shared/types';
import { findPath, type PathGrid } from '../../simulation/pathfinding/AStar';
import {
  COMPONENT,
  Layer,
  type CombatComponent,
  type LayerComponent,
  type PathComponent,
  type PositionComponent,
} from '../components/components';
import { FactionId, ownerOf, relation } from '../factions/factions';
import { HUMAN_RAID_SECONDS, HUMAN_UNIT_STATS } from '../rival/humanBase';
import { HUMAN_COMPONENT, type HumanUnitComponent } from '../rival/humanComponents';
import { ORDER_PATH_MAX_STEPS } from '../../shared/constants';

/** Seconds between two route requests while closing in on a moving enemy */
const CHASE_REPATH_INTERVAL = 0.8;
/** Seconds to wait before retrying when no route to the goal exists */
const NO_ROUTE_RETRY = 2;
/** A marching unit counts as arrived this close to its goal */
const GOAL_ARRIVED = 2;
/** Seconds an assault waits at the enemy nest with nothing to shoot before it heads home */
const ASSAULT_LINGER = 20;
/** Garrison troops keep within this many tiles of the command center */
export const HUMAN_GUARD_RADIUS = 5;

interface Prey {
  id: EntityId;
  x: number;
  y: number;
  faction: FactionId;
}

/**
 * Drives Human troops. Humans shoot from range: a unit with an enemy in sight
 * walks only until the enemy is within its weapon range, then stops and
 * fires (CombatSystem lands the shots). Without one it marches (night wave),
 * hunts (day raid), heads home after a raid, or keeps near the command
 * center. Like the Crystal units, they fight only factions they are at war
 * with. The builder is HumanBaseSystem's.
 */
export class HumanUnitAISystem implements System {
  readonly name = 'HumanUnitAISystem';
  readonly priority = 6; // after AntAI (5), before Combat (7)

  private world: World;
  private grid: PathGrid;
  private prey: Prey[] = [];

  constructor(world: World, grid: PathGrid) {
    this.world = world;
    this.grid = grid;
  }

  update(dt: number): void {
    const units = this.world.query(HUMAN_COMPONENT.UNIT, COMPONENT.POSITION, COMPONENT.PATH);
    if (units.length === 0) return;
    this.snapshotPrey();

    for (const id of units) {
      if (!this.onSurface(id)) continue;
      const unit = this.world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!;
      if (unit.type === 'builder') continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
      unit.repathTimer = Math.max(0, unit.repathTimer - dt);
      if (unit.baseId !== null && !this.world.hasEntity(unit.baseId)) unit.baseId = null;
      if (unit.state === 'raiding') unit.raidTimer += dt;

      const target = this.pickTarget(id, unit, pos);
      if (target) {
        this.engage(unit, pos, path, combat, target);
        continue;
      }
      if (combat) combat.targetEntityId = null;

      if (unit.state === 'assaulting' && unit.goal) {
        const arrived = Math.hypot(unit.goal.x - pos.x, unit.goal.y - pos.y) <= GOAL_ARRIVED;
        unit.raidTimer = arrived ? unit.raidTimer + dt : 0;
        if (unit.raidTimer >= ASSAULT_LINGER) this.headHome(unit, path);
        else this.march(unit, pos, path, unit.goal);
      } else if (unit.state === 'raiding' && unit.goal) {
        const arrived = Math.hypot(unit.goal.x - pos.x, unit.goal.y - pos.y) <= GOAL_ARRIVED;
        if (arrived || unit.raidTimer >= HUMAN_RAID_SECONDS) this.headHome(unit, path);
        else this.march(unit, pos, path, unit.goal);
      } else if (unit.state === 'returning') {
        this.goHome(unit, pos, path);
      } else {
        this.guard(unit, pos, path);
      }
    }
  }

  /** Surface units (and Crystal structures) of every non-wildlife faction; each unit keeps only its enemies */
  private snapshotPrey(): void {
    this.prey.length = 0;
    for (const store of [COMPONENT.ANT, COMPONENT.CRYSTAL_UNIT, HUMAN_COMPONENT.UNIT, COMPONENT.CRYSTAL_HIVE, COMPONENT.CRYSTAL_SPIRE]) {
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
  private pickTarget(id: EntityId, unit: HumanUnitComponent, pos: PositionComponent): Prey | null {
    const own = ownerOf(this.world, id) ?? FactionId.RIVAL;
    const stats = HUMAN_UNIT_STATS[unit.type];
    const current = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)?.targetEntityId ?? null;
    let best: Prey | null = null;
    let bestDist = Infinity;
    for (const prey of this.prey) {
      if (relation(own, prey.faction) !== 'enemy') continue;
      const dist = Math.hypot(prey.x - pos.x, prey.y - pos.y);
      if (prey.id === current && dist <= stats.leashRange) return prey;
      if (dist <= stats.visionRange && (dist < bestDist || (dist === bestDist && best !== null && prey.id < best.id))) {
        best = prey;
        bestDist = dist;
      }
    }
    return best;
  }

  /** Close in until the enemy is within weapon range, then stand and fire */
  private engage(
    unit: HumanUnitComponent,
    pos: PositionComponent,
    path: PathComponent,
    combat: CombatComponent | undefined,
    target: Prey,
  ): void {
    if (!combat) return;
    combat.targetEntityId = target.id;
    const dist = Math.hypot(target.x - pos.x, target.y - pos.y);
    if (dist <= combat.attackRange) {
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
  private march(unit: HumanUnitComponent, pos: PositionComponent, path: PathComponent, goal: Vector2): void {
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

  private headHome(unit: HumanUnitComponent, path: PathComponent): void {
    unit.state = 'returning';
    unit.goal = null;
    unit.raidTimer = 0;
    unit.repathTimer = 0;
    path.waypoints = [];
    path.currentIndex = 0;
  }

  private homeOf(unit: HumanUnitComponent): PositionComponent | null {
    return unit.baseId === null ? null : this.world.getComponent<PositionComponent>(unit.baseId, COMPONENT.POSITION) ?? null;
  }

  /** After a raid: walk back, then stand guard */
  private goHome(unit: HumanUnitComponent, pos: PositionComponent, path: PathComponent): void {
    const home = this.homeOf(unit);
    if (!home || Math.hypot(home.x - pos.x, home.y - pos.y) <= HUMAN_GUARD_RADIUS) {
      unit.state = 'guarding';
      return;
    }
    this.march(unit, pos, path, { x: home.x, y: home.y });
  }

  /** At home: drift back when it strays past the guard radius */
  private guard(unit: HumanUnitComponent, pos: PositionComponent, path: PathComponent): void {
    const home = this.homeOf(unit);
    if (!home) return;
    if (Math.hypot(home.x - pos.x, home.y - pos.y) <= HUMAN_GUARD_RADIUS) {
      if (path.currentIndex < path.waypoints.length) {
        const end = path.waypoints[path.waypoints.length - 1];
        if (Math.hypot(end.x - home.x, end.y - home.y) > HUMAN_GUARD_RADIUS) {
          path.waypoints = [];
          path.currentIndex = 0;
        }
      }
      return;
    }
    if (path.currentIndex < path.waypoints.length || unit.repathTimer > 0) return;
    unit.repathTimer = this.route(pos, path, { x: home.x, y: home.y }) ? 0 : NO_ROUTE_RETRY;
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
