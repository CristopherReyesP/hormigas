import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../shared/types';
import type { TileGrid } from '../../simulation/world/TileGrid';
import { randomEdgeTile } from '../../simulation/world/frontier';
import { findPath } from '../../simulation/pathfinding/AStar';
import {
  COMPONENT,
  Layer,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type PathComponent,
  type PositionComponent,
  type RoleStatsComponent,
} from '../components/components';
import { FactionId, ownerOf } from '../factions/factions';
import { ANT_SPEED } from '../../shared/constants';
import {
  FRONTIER_CREATURE_COMPONENT,
  FRONTIER_CREATURE_STATS,
  createFrontierCreature,
  frontierCreatureOf,
  type FrontierCreatureComponent,
} from './frontierCreatures';

/** What a day clock tells the hunters */
export interface HuntClock {
  getDayNumber(): number;
}

/**
 * The alien tarantula: it wants nothing but ants. It ignores food and dens,
 * senses the colony's ants from far off, stalks the nearest one and, once
 * close, pounces at triple speed. Every kill heals it (it feeds).
 * - Phase 1: the first one comes on day TARANTULA.firstDay, then up to
 *   `phase1Max` roam at once, a new one every `spawnEvery` s.
 * - Phase 2 (`setPhase2`): up to `phase2Max`, coming faster.
 */
export const TARANTULA = {
  firstDay: 3,
  phase1Max: 1,
  /** From this day Phase 1 allows a second one */
  secondFromDay: 6,
  phase2Max: 4,
  /** Seconds between two arrivals while short of the cap */
  spawnEvery: 120,
  phase2SpawnEvery: 70,
  /** It senses ants this far (tiles); beyond that it roams toward the colony */
  senseRange: 30,
  /** It pounces once the prey is this close (tiles) */
  pounceRange: 4.5,
  pounceSeconds: 0.7,
  pounceSpeedMult: 3,
  pounceCooldown: 6,
  /** Share of its max health a kill gives back */
  feedHeal: 0.2,
  /** Seconds between two re-aims of its route */
  repath: 1,
} as const;

const PATH_STEPS = 6000;

export class TarantulaSystem implements System {
  readonly name = 'TarantulaSystem';
  readonly priority = 52; // after FrontierSystem (51), before movement

  private world: World;
  private grid: TileGrid;
  private clock: HuntClock;
  /** Where the colony lives: the hunter heads there when no ant is in sense range */
  private colony: () => Vector2 | null;
  spawnTimer = 30;
  phase2 = false;
  /** Prey each hunter is on, to heal it when that prey dies */
  private prey = new Map<EntityId, EntityId>();

  constructor(world: World, grid: TileGrid, clock: HuntClock, colony: () => Vector2 | null) {
    this.world = world;
    this.grid = grid;
    this.clock = clock;
    this.colony = colony;
  }

  setPhase2(): void {
    this.phase2 = true;
    this.spawnTimer = Math.min(this.spawnTimer, 20);
  }

  /** How many may roam at once now */
  cap(): number {
    if (this.phase2) return TARANTULA.phase2Max;
    const day = this.clock.getDayNumber();
    if (day < TARANTULA.firstDay) return 0;
    return day >= TARANTULA.secondFromDay ? TARANTULA.phase1Max + 1 : TARANTULA.phase1Max;
  }

  hunters(): EntityId[] {
    return this.world.query(FRONTIER_CREATURE_COMPONENT).filter((id) => frontierCreatureOf(this.world, id)!.kind === 'tarantula');
  }

  /** A tarantula crawls in at the edge of the area the run plays on */
  spawn(): EntityId | null {
    for (let attempt = 0; attempt < 20; attempt++) {
      const at = randomEdgeTile(this.grid.bounds, Math.floor(Math.random() * 4), Math.random, 2);
      if (!this.grid.isWalkable(at.x, at.y)) continue;
      const id = createFrontierCreature(this.world, 'tarantula', at.x, at.y, null);
      this.world.pushNotification('danger', '🕷️ ¡Una tarántula alienígena caza en el territorio! Solo quiere hormigas: protege a tus obreras');
      return id;
    }
    return null;
  }

  update(dt: number): void {
    const hunters = this.hunters();
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.phase2 ? TARANTULA.phase2SpawnEvery : TARANTULA.spawnEvery;
      if (hunters.length < this.cap()) {
        const born = this.spawn();
        if (born !== null) hunters.push(born);
      }
    }
    if (hunters.length === 0) return;
    const ants = this.antPrey();
    for (const id of hunters) this.hunt(id, frontierCreatureOf(this.world, id)!, ants, dt);
  }

  /** The player's ants on the surface (the only thing it eats); other races' units when there are no ants */
  private antPrey(): Array<{ id: EntityId; pos: PositionComponent }> {
    const out: Array<{ id: EntityId; pos: PositionComponent }> = [];
    const collect = (ids: readonly EntityId[], playerOnly: boolean) => {
      for (const id of ids) {
        if (playerOnly && ownerOf(this.world, id) !== FactionId.PLAYER) continue;
        const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
        if (layer && layer.layer !== Layer.Surface) continue;
        const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
        if (health && health.current <= 0) continue;
        out.push({ id, pos: this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)! });
      }
    };
    collect(this.world.query(COMPONENT.ANT, COMPONENT.POSITION), false);
    // A Human or Crystal player has no ants: it hunts their units instead
    if (out.length === 0) collect(this.world.query(COMPONENT.HEALTH, COMPONENT.POSITION, COMPONENT.COMBAT), true);
    return out;
  }

  private hunt(id: EntityId, me: FrontierCreatureComponent, ants: ReadonlyArray<{ id: EntityId; pos: PositionComponent }>, dt: number): void {
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    const role = this.world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
    if (!path || !combat) return;

    // It fed: the prey it was on is gone
    const last = this.prey.get(id);
    if (last !== undefined && !this.world.hasEntity(last)) {
      this.prey.delete(id);
      const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
      if (health) health.current = Math.min(health.max, health.current + health.max * TARANTULA.feedHeal);
    }

    // The pounce: a short burst at triple speed
    me.abilityTimer = Math.max(0, me.abilityTimer - dt);
    const baseSpeed = FRONTIER_CREATURE_STATS.tarantula.speed / ANT_SPEED;
    if (me.pounce !== undefined) {
      me.pounce -= dt;
      if (me.pounce <= 0) me.pounce = undefined;
    }
    if (role) role.speedMultiplier = me.pounce !== undefined ? baseSpeed * TARANTULA.pounceSpeedMult : baseSpeed;

    let target: { id: EntityId; pos: PositionComponent } | null = null;
    let best: number = TARANTULA.senseRange;
    for (const a of ants) {
      const d = Math.hypot(a.pos.x - pos.x, a.pos.y - pos.y);
      if (d < best) { best = d; target = a; }
    }
    if (target && best <= combat.attackRange + 0.2) {
      combat.targetEntityId = target.id;
      this.prey.set(id, target.id);
      path.waypoints = [];
      path.currentIndex = 0;
      return;
    }
    combat.targetEntityId = null;
    if (target && best <= TARANTULA.pounceRange && me.abilityTimer <= 0 && me.pounce === undefined) {
      me.pounce = TARANTULA.pounceSeconds;
      me.abilityTimer = TARANTULA.pounceCooldown;
      path.waypoints = [{ x: target.pos.x, y: target.pos.y }];
      path.currentIndex = 0;
      return;
    }
    me.repath -= dt;
    if (me.repath > 0 && path.currentIndex < path.waypoints.length) return;
    me.repath = TARANTULA.repath;
    const goal = target ? { x: target.pos.x, y: target.pos.y } : this.colony();
    if (!goal) return;
    const route = findPath(this.grid, { x: Math.round(pos.x), y: Math.round(pos.y) }, { x: Math.round(goal.x), y: Math.round(goal.y) }, PATH_STEPS);
    if (route && route.length > 0) {
      path.waypoints = route;
      path.currentIndex = 0;
    }
  }
}
