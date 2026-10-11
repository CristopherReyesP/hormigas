import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import type { TransitSystem } from './TransitSystem';
import { findPath } from '../../simulation/pathfinding/AStar';
import {
  COMPONENT,
  AntRole,
  AntState,
  Layer,
  type AntComponent,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type LayerValue,
  type PathComponent,
  type PlayerOrderComponent,
  type PositionComponent,
} from '../components/components';
import { FactionId, isHostileTo } from '../factions/factions';
import { HUMAN_COMPONENT } from '../rival/humanComponents';
import { dealDamage, pushWaveFx } from '../run/waveRuntime';
import { emitAudio } from '../../audio/events';
import { BOMBER_BURST, ROLE_STATS } from '../../shared/constants';

/** What a bomber goes for: every kind of enemy unit */
const PREY_STORES = [COMPONENT.BEETLE, COMPONENT.CRICKET, COMPONENT.CRYSTAL_UNIT, HUMAN_COMPONENT.UNIT] as const;
/** What its burst hurts: enemy units and the rivals' buildings */
const BURST_STORES = [...PREY_STORES, COMPONENT.CRYSTAL_HIVE, COMPONENT.CRYSTAL_SPIRE, HUMAN_COMPONENT.BUILDING] as const;
/** Seconds between two route refreshes while it runs at a moving enemy */
const CHASE_REPATH = 0.5;
/** Its post at home: a ring this far around the mound */
const POST_RADIUS = 4;

interface Prey {
  id: EntityId;
  x: number;
  y: number;
}

/**
 * Exploding ants (Colobopsis explodens): they keep a ring around the mound,
 * run at the first enemy that comes into sight and burst on it, hurting every
 * enemy within BOMBER_BURST.radius (and the rivals' buildings and the dens
 * there). When invaders are inside the
 * nest, the bombers up top go down after them. A player's order moves them
 * like any ant; one that walks into an enemy still bursts.
 */
export class BomberAISystem implements System {
  readonly name = 'BomberAISystem';
  readonly priority = 7; // with the defenders: after the surface AI, before movement

  private world: World;
  private surface: TileGrid;
  private underground: UndergroundGrid;
  private transit: TransitSystem;
  private repath = new Map<EntityId, number>();

  constructor(world: World, surface: TileGrid, underground: UndergroundGrid, transit: TransitSystem) {
    this.world = world;
    this.surface = surface;
    this.underground = underground;
    this.transit = transit;
  }

  update(dt: number): void {
    const bombers: EntityId[] = [];
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.PATH)) {
      if (this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!.role === AntRole.Bomber) bombers.push(id);
    }
    for (const id of this.repath.keys()) if (!this.world.hasEntity(id)) this.repath.delete(id);
    if (bombers.length === 0) return;

    const prey = { [Layer.Surface]: [] as Prey[], [Layer.Underground]: [] as Prey[] };
    for (const store of PREY_STORES) {
      for (const id of this.world.query(store, COMPONENT.POSITION, COMPONENT.HEALTH)) {
        if (!isHostileTo(this.world, FactionId.PLAYER, id)) continue;
        if ((this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!.current) <= 0) continue;
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        prey[this.layerOf(id)].push({ id, x: pos.x, y: pos.y });
      }
    }
    const nest = this.nestPos();

    for (const id of bombers) {
      if (this.transit.isInTransit(id)) continue;
      const layer = this.layerOf(id);
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
      const near = this.nearest(prey[layer], pos, Infinity);

      // Close enough to one: it bursts, whatever it was doing
      if (near && near.dist <= BOMBER_BURST.trigger) {
        this.burst(id, pos, layer);
        continue;
      }
      // Under the player's orders: the order moves it (AntAISystem)
      if (this.world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER)) continue;

      const vision = ROLE_STATS.bomber.visionRange;
      const target = near && near.dist <= vision ? near.prey : null;
      const timer = (this.repath.get(id) ?? 0) - dt;
      this.repath.set(id, timer);

      if (target) {
        ant.state = AntState.ChasingEnemy;
        const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
        if (combat) combat.targetEntityId = target.id;
        if (timer <= 0 || path.currentIndex >= path.waypoints.length) {
          this.repath.set(id, CHASE_REPATH);
          this.route(id, pos, path, layer, target.x, target.y);
        }
        continue;
      }

      if (layer === Layer.Underground) {
        // The nest is breached: hunt the invaders below. Else back up to the mound
        if (prey[Layer.Underground].length > 0) {
          const any = this.nearest(prey[Layer.Underground], pos, Infinity)!;
          ant.state = AntState.ChasingEnemy;
          if (timer <= 0 || path.currentIndex >= path.waypoints.length) {
            this.repath.set(id, CHASE_REPATH);
            this.route(id, pos, path, layer, any.prey.x, any.prey.y);
          }
        } else {
          ant.state = AntState.Idle;
          this.transit.requestTransit(id, 'exit');
        }
        continue;
      }

      // On the surface with nothing in sight: down after invaders inside, else hold the post
      if (prey[Layer.Underground].length > 0) {
        this.transit.requestTransit(id, 'enter');
        continue;
      }
      if (!nest) continue;
      ant.state = AntState.PatrollingNest;
      const angle = ((id * 2.399) % (Math.PI * 2));
      const postX = nest.x + Math.cos(angle) * POST_RADIUS;
      const postY = nest.y + Math.sin(angle) * POST_RADIUS;
      if (Math.hypot(postX - pos.x, postY - pos.y) > 1 && path.currentIndex >= path.waypoints.length && timer <= 0) {
        this.repath.set(id, 2);
        this.route(id, pos, path, layer, postX, postY);
      }
    }
  }

  /** The burst: a blast ring and every enemy within BOMBER_BURST.radius hurt, and the bomber is gone */
  private burst(id: EntityId, pos: PositionComponent, layer: LayerValue): void {
    pushWaveFx(this.world, { kind: 'blast', x: pos.x, y: pos.y, layer, radius: BOMBER_BURST.radius, life: 0.6 });
    emitAudio({ type: 'waveFx', kind: 'explode', at: { x: pos.x, y: pos.y, layer } });
    for (const store of BURST_STORES) {
      for (const other of this.world.query(store, COMPONENT.POSITION, COMPONENT.HEALTH)) {
        if (!isHostileTo(this.world, FactionId.PLAYER, other)) continue;
        if (this.layerOf(other) !== layer) continue;
        const at = this.world.getComponent<PositionComponent>(other, COMPONENT.POSITION)!;
        if (Math.hypot(at.x - pos.x, at.y - pos.y) > BOMBER_BURST.radius) continue;
        dealDamage(this.world, other, BOMBER_BURST.damage);
      }
    }
    const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (health) dealDamage(this.world, id, health.current + 1);
    this.repath.delete(id);
  }

  private route(id: EntityId, pos: PositionComponent, path: PathComponent, layer: string, tx: number, ty: number): void {
    const route = layer === Layer.Underground
      ? this.underground.findPath(pos.x, pos.y, tx, ty)
      : findPath(this.surface, { x: Math.round(pos.x), y: Math.round(pos.y) }, { x: Math.round(tx), y: Math.round(ty) }, 3000);
    path.waypoints = route && route.length > 0 ? route : [{ x: tx, y: ty }];
    path.currentIndex = 0;
    void id;
  }

  private nearest(list: readonly Prey[], pos: PositionComponent, max: number): { prey: Prey; dist: number } | null {
    let best: Prey | null = null;
    let bestDist = max;
    for (const p of list) {
      const d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best ? { prey: best, dist: bestDist } : null;
  }

  private layerOf(id: EntityId): LayerValue {
    return this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface;
  }

  private nestPos(): PositionComponent | null {
    const nests = this.world.query(COMPONENT.NEST, COMPONENT.POSITION);
    return nests.length > 0 ? this.world.getComponent<PositionComponent>(nests[0], COMPONENT.POSITION)! : null;
  }
}
