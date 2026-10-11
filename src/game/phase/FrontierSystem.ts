import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../shared/types';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { TileBounds } from '../../simulation/world/frontier';
import { findPath } from '../../simulation/pathfinding/AStar';
import {
  COMPONENT,
  FoodType,
  Layer,
  BeetleState,
  type BeetleComponent,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type PathComponent,
  type PositionComponent,
} from '../components/components';
import { createFood } from '../entities/factories';
import { FactionId, ownerOf } from '../factions/factions';
import { floodFromNest } from '../run/craterSite';
import {
  FRONTIER_CREATURE_COMPONENT,
  FRONTIER_DEN_COMPONENT,
  FRONTIER_DEN_STATS,
  LEGION_QUEEN_CALL,
  createFrontierCreature,
  createFrontierDen,
  frontierCreatureOf,
  frontierDenOf,
  type FrontierCreatureComponent,
  type FrontierCreatureKind,
  type FrontierDenComponent,
} from './frontierCreatures';

/** How far a den's creatures stray from it before they turn back (tiles); mantises roam free */
const LEASH = { legionary: 9, legion_queen: 5, spider: 8 } as const;
/** A raider looks for prey this far around itself (tiles) */
const RAIDER_SIGHT = 6;
/** Seconds between two re-aims of a raider's route */
const RAIDER_REPATH = 1.5;
/** A* budget for a raider's march across the map */
const RAIDER_PATH_STEPS = 8000;
/** Seconds between two leash checks */
const LEASH_CHECK_SECONDS = 1;

/** What the outer ring gets when the frontier opens */
export const FRONTIER_CONTENT = {
  spiderLairs: 3,
  mantises: 2,
  /** Rich food clusters across the new ground */
  foodClusters: 12,
  giantMushrooms: 3,
} as const;

/** Where the colony is: raiders march on it */
export type ColonyTarget = () => Vector2 | null;

/**
 * Phase 2's wildlife beyond the wall: keeps each den's creatures alive, leashes
 * them to it, lets the Legionary Queen call her guard, and steers the
 * legionary columns the night waves send at the colony (launchRaid).
 * Idle until the frontier opens (populate).
 */
export class FrontierSystem implements System {
  readonly name = 'FrontierSystem';
  readonly priority = 51; // right after BeetleSpawnSystem (50), before movement

  private world: World;
  private grid: TileGrid;
  private colony: ColonyTarget;
  /** The frontier opened and its content was placed */
  active = false;
  /** The Legionary nest and Queen, once placed */
  legionNestId: EntityId | null = null;
  legionQueenId: EntityId | null = null;
  private leashTimer = 0;

  constructor(world: World, grid: TileGrid, colony: ColonyTarget) {
    this.world = world;
    this.grid = grid;
    this.colony = colony;
  }

  /** The Legionary nest still stands */
  legionNestAlive(): boolean {
    return this.legionNestId !== null && this.world.hasEntity(this.legionNestId);
  }

  /** The Legionary Queen still lives */
  legionQueenAlive(): boolean {
    return this.legionQueenId !== null && this.world.hasEntity(this.legionQueenId);
  }

  /** Phase 2's final goal: the Legionary nest destroyed and its Queen dead */
  legionDefeated(): boolean {
    return this.active && !this.legionNestAlive() && !this.legionQueenAlive();
  }

  /** The new ground's tiles reachable from `home`, at least `depth` tiles out from the old wall */
  private newGround(oldZone: TileBounds, home: Vector2, depth: number): Vector2[] {
    const { width, height } = this.grid;
    const reach = floodFromNest({ width, height, nest: { x: Math.round(home.x), y: Math.round(home.y) }, isWalkable: (x, y) => this.grid.isWalkable(x, y) });
    const out: Vector2[] = [];
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        if (!reach[y * width + x]) continue;
        const dx = Math.max(oldZone.x0 - x, 0, x - oldZone.x1);
        const dy = Math.max(oldZone.y0 - y, 0, y - oldZone.y1);
        if (Math.max(dx, dy) >= depth) out.push({ x, y });
      }
    }
    return out;
  }

  /**
   * Where Phase 2's meteor shower strikes: `count` clearings on the new ground
   * (a walkable disc of `clearRadius`), spread around the map and far apart.
   */
  impactSites(oldZone: TileBounds, home: Vector2, count: number, clearRadius: number, rng: () => number = Math.random): Vector2[] {
    const ground = this.newGround(oldZone, home, 5);
    const clear = (p: Vector2) => {
      for (let dy = -clearRadius; dy <= clearRadius; dy++) {
        for (let dx = -clearRadius; dx <= clearRadius; dx++) {
          if (dx * dx + dy * dy <= clearRadius * clearRadius && !this.grid.isWalkable(p.x + dx, p.y + dy)) return false;
        }
      }
      return true;
    };
    const sites: Vector2[] = [];
    for (let i = 0; i < count && ground.length > 0; i++) {
      // Of a few random clearings, the one farthest from home and from the impacts so far
      let best: Vector2 | null = null;
      let bestScore = -Infinity;
      for (let attempt = 0; attempt < 80; attempt++) {
        const p = ground[Math.floor(rng() * ground.length)];
        if (!clear(p)) continue;
        const apart = sites.reduce((m, q) => Math.min(m, Math.hypot(q.x - p.x, q.y - p.y)), Infinity);
        if (apart < 20) continue;
        const score = Math.min(apart, 80) + Math.hypot(p.x - home.x, p.y - home.y) * 0.5;
        if (score > bestScore) { best = p; bestScore = score; }
      }
      if (best) sites.push(best);
    }
    return sites;
  }

  /**
   * The frontier just opened: place the Legionary nest and its Queen, the
   * spider lairs, the mantises and the rich food on the new ground (the
   * outer ring outside `oldZone`), all reachable from `home`.
   */
  populate(oldZone: TileBounds, home: Vector2, rng: () => number = Math.random, avoid: readonly Vector2[] = []): void {
    if (this.active) return;
    this.active = true;
    // Ring tiles reachable from home, at least 4 tiles out from the old wall
    const deep = this.newGround(oldZone, home, 4);
    if (deep.length === 0) return;
    // The meteor impacts (the rival's new bases) keep their ground
    const taken: Vector2[] = [...avoid];
    const far = (p: Vector2, d: number) => taken.every((t) => Math.hypot(t.x - p.x, t.y - p.y) >= d);
    const pick = (minApart: number, prefer?: (p: Vector2) => number): Vector2 | null => {
      let best: Vector2 | null = null;
      let bestScore = -Infinity;
      for (let i = 0; i < 60; i++) {
        const p = deep[Math.floor(rng() * deep.length)];
        if (!far(p, minApart)) continue;
        const score = prefer ? prefer(p) : 0;
        if (score > bestScore) { best = p; bestScore = score; }
        if (!prefer) break;
      }
      if (best) taken.push(best);
      return best;
    };
    const fromHome = (p: Vector2) => Math.hypot(p.x - home.x, p.y - home.y);

    // The Legionary nest: as far from home as the new ground allows
    const nestAt = pick(avoid.length > 0 ? 16 : 0, fromHome);
    if (nestAt) {
      this.legionNestId = createFrontierDen(this.world, 'legion_nest', nestAt.x, nestAt.y);
      this.legionQueenId = createFrontierCreature(this.world, 'legion_queen', nestAt.x + 1, nestAt.y + 1, this.legionNestId);
      for (let i = 0; i < 6; i++) this.spawnAround(this.legionNestId, 'legionary');
    }
    for (let i = 0; i < FRONTIER_CONTENT.spiderLairs; i++) {
      const at = pick(18);
      if (!at) continue;
      const lair = createFrontierDen(this.world, 'spider_lair', at.x, at.y);
      for (let k = 0; k < FRONTIER_DEN_STATS.spider_lair.keep; k++) this.spawnAround(lair, 'spider');
    }
    for (let i = 0; i < FRONTIER_CONTENT.mantises; i++) {
      const at = pick(14);
      if (at) createFrontierCreature(this.world, 'mantis', at.x, at.y, null);
    }
    // Rich new ground: big leaf piles and mushroom groves, and giant mushrooms
    for (let i = 0; i < FRONTIER_CONTENT.foodClusters; i++) {
      const at = pick(6);
      if (!at) continue;
      const mushroom = rng() < 0.4;
      for (let j = 0; j < 6; j++) {
        const fx = at.x + Math.floor(rng() * 5) - 2;
        const fy = at.y + Math.floor(rng() * 5) - 2;
        if (!this.grid.isWalkable(fx, fy)) continue;
        createFood(this.world, fx, fy, mushroom ? 80 + Math.floor(rng() * 80) : 150 + Math.floor(rng() * 150), mushroom ? FoodType.Mushroom : FoodType.Leaf);
      }
    }
    for (let i = 0; i < FRONTIER_CONTENT.giantMushrooms; i++) {
      const at = pick(10);
      if (at) createFood(this.world, at.x, at.y, 700 + Math.floor(rng() * 300), FoodType.GiantMushroom);
    }
  }

  /** Where the legionary columns leave from (the nest), or null once it fell */
  raidOrigin(): Vector2 | null {
    if (!this.legionNestAlive()) return null;
    const pos = this.world.getComponent<PositionComponent>(this.legionNestId!, COMPONENT.POSITION);
    return pos ? { x: Math.round(pos.x), y: Math.round(pos.y) } : null;
  }

  /** A night wave's legionary column: up to `count` raiders leave the nest; none once it fell */
  launchRaid(count: number): EntityId[] {
    const origin = this.raidOrigin();
    if (!origin) return [];
    const sent: EntityId[] = [];
    for (let i = 0; i < count; i++) {
      const at = this.freeTileNear(origin, 3);
      if (!at) break;
      const id = createFrontierCreature(this.world, 'legionary', at.x, at.y, null);
      frontierCreatureOf(this.world, id)!.raider = true;
      sent.push(id);
    }
    return sent;
  }

  update(dt: number): void {
    if (!this.active) return;
    for (const id of this.world.query(FRONTIER_DEN_COMPONENT, COMPONENT.POSITION)) this.tendDen(id, frontierDenOf(this.world, id)!, dt);
    this.leashTimer -= dt;
    const leash = this.leashTimer <= 0;
    if (leash) this.leashTimer = LEASH_CHECK_SECONDS;
    let prey: Array<{ id: EntityId; pos: PositionComponent }> | null = null;
    for (const id of this.world.query(FRONTIER_CREATURE_COMPONENT, COMPONENT.POSITION)) {
      const creature = frontierCreatureOf(this.world, id)!;
      if (creature.raider) {
        prey ??= this.surfacePrey();
        this.steerRaider(id, creature, prey, dt);
        continue;
      }
      if (creature.kind === 'legion_queen') this.queenCall(id, creature, dt);
      if (leash) this.leashHome(id, creature);
    }
  }

  /** Keep the den's creatures alive: one more leaves it every spawnCooldown s while it is short */
  private tendDen(id: EntityId, den: FrontierDenComponent, dt: number): void {
    den.members = den.members.filter((m) => this.world.hasEntity(m));
    if (den.members.length >= den.keep) return;
    den.spawnTimer -= dt;
    if (den.spawnTimer > 0) return;
    den.spawnTimer = FRONTIER_DEN_STATS[den.kind].spawnCooldown;
    this.spawnAround(id, FRONTIER_DEN_STATS[den.kind].creature);
  }

  private spawnAround(denId: EntityId, kind: FrontierCreatureKind): EntityId | null {
    const pos = this.world.getComponent<PositionComponent>(denId, COMPONENT.POSITION);
    if (!pos) return null;
    const at = this.freeTileNear({ x: Math.round(pos.x), y: Math.round(pos.y) }, 3);
    return at ? createFrontierCreature(this.world, kind, at.x, at.y, denId) : null;
  }

  private freeTileNear(center: Vector2, radius: number): Vector2 | null {
    for (let attempt = 0; attempt < 16; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const d = 1 + Math.random() * radius;
      const x = Math.round(center.x + Math.cos(a) * d);
      const y = Math.round(center.y + Math.sin(a) * d);
      if (this.grid.isWalkable(x, y)) return { x, y };
    }
    return this.grid.isWalkable(center.x, center.y) ? { ...center } : null;
  }

  /** A den's creature that strayed too far while roaming walks back to it */
  private leashHome(id: EntityId, creature: FrontierCreatureComponent): void {
    if (creature.kind === 'mantis') return;
    const beetle = this.world.getComponent<BeetleComponent>(id, COMPONENT.BEETLE);
    if (!beetle || beetle.state !== BeetleState.Roaming || beetle.denEntityId === null) return;
    const home = this.world.getComponent<PositionComponent>(beetle.denEntityId, COMPONENT.POSITION);
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
    if (!home || !pos) return;
    if (Math.hypot(home.x - pos.x, home.y - pos.y) <= LEASH[creature.kind]) return;
    const route = findPath(this.grid, { x: Math.round(pos.x), y: Math.round(pos.y) }, { x: Math.round(home.x), y: Math.round(home.y) });
    const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
    if (!route || !path) return;
    path.waypoints = route;
    path.currentIndex = 0;
    beetle.stateTimer = 0; // the roaming walk keeps this route instead of picking a new one
  }

  /** In a fight, the Queen calls legionaries to her side every LEGION_QUEEN_CALL.cooldown s */
  private queenCall(id: EntityId, creature: FrontierCreatureComponent, dt: number): void {
    creature.abilityTimer -= dt;
    if (creature.abilityTimer > 0) return;
    const beetle = this.world.getComponent<BeetleComponent>(id, COMPONENT.BEETLE);
    const fighting = beetle && (beetle.state === BeetleState.Attacking || beetle.state === BeetleState.ChasingAnt);
    if (!fighting) return;
    creature.abilityTimer = LEGION_QUEEN_CALL.cooldown;
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const home = this.legionNestAlive() ? this.legionNestId : null;
    for (let i = 0; i < LEGION_QUEEN_CALL.count; i++) {
      const at = this.freeTileNear({ x: Math.round(pos.x), y: Math.round(pos.y) }, 2);
      if (at) createFrontierCreature(this.world, 'legionary', at.x, at.y, home);
    }
    this.world.pushNotification('danger', '👑 ¡La Reina Legionaria llama a su guardia!');
  }

  /** The player's living units on the surface: what raiders hunt */
  private surfacePrey(): Array<{ id: EntityId; pos: PositionComponent }> {
    const out: Array<{ id: EntityId; pos: PositionComponent }> = [];
    for (const id of this.world.query(COMPONENT.HEALTH, COMPONENT.POSITION)) {
      if (ownerOf(this.world, id) !== FactionId.PLAYER) continue;
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      if (layer && layer.layer !== Layer.Surface) continue;
      const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
      if (health.current <= 0) continue;
      out.push({ id, pos: this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)! });
    }
    return out;
  }

  /**
   * A raider of a legionary column: bite the nearest of the player's units in
   * sight, else march on the colony and swarm around it.
   */
  private steerRaider(id: EntityId, creature: FrontierCreatureComponent, prey: ReadonlyArray<{ id: EntityId; pos: PositionComponent }>, dt: number): void {
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (!path || !combat) return;
    creature.repath -= dt;
    let target: { id: EntityId; pos: PositionComponent } | null = null;
    let best = RAIDER_SIGHT;
    for (const p of prey) {
      const d = Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y);
      if (d < best) { best = d; target = p; }
    }
    if (target && best <= combat.attackRange + 0.2) {
      combat.targetEntityId = target.id;
      path.waypoints = [];
      path.currentIndex = 0;
      return;
    }
    combat.targetEntityId = null;
    if (creature.repath > 0 && path.currentIndex < path.waypoints.length) return;
    creature.repath = RAIDER_REPATH;
    const goal = target ? { x: target.pos.x, y: target.pos.y } : this.colony();
    if (!goal) return;
    const start = { x: Math.round(pos.x), y: Math.round(pos.y) };
    if (!target && Math.hypot(goal.x - pos.x, goal.y - pos.y) < 3) {
      // At the colony with nothing in sight: mill about the nest
      const a = Math.random() * Math.PI * 2;
      const wander = { x: Math.round(goal.x + Math.cos(a) * 3), y: Math.round(goal.y + Math.sin(a) * 3) };
      if (this.grid.isWalkable(wander.x, wander.y)) {
        path.waypoints = [wander];
        path.currentIndex = 0;
      }
      return;
    }
    const route = findPath(this.grid, start, { x: Math.round(goal.x), y: Math.round(goal.y) }, RAIDER_PATH_STEPS);
    if (route && route.length > 0) {
      path.waypoints = route;
      path.currentIndex = 0;
    }
  }
}
