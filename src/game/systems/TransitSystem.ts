import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import {
  COMPONENT,
  AntRole,
  Layer,
  type PositionComponent,
  type LayerComponent,
  type AntComponent,
  type PathComponent,
  type HealthComponent,
} from '../components/components';
import { FactionId, isHostileTo } from '../factions/factions';
import { hasPlayerOrder } from './helpers/playerOrders';
import { WORLD_WIDTH, WORLD_HEIGHT, TRANSIT_DURATION } from '../../shared/constants';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';

export interface TransitRequest {
  entityId: number;
  direction: 'enter' | 'exit';
  timer: number;
  phase: 'walking' | 'transitioning';
  /** Which entrance this ant is using. Pinned at request time so the walk
   *  target can't drift to a different shaft mid-journey. */
  entranceX: number;
  entranceY: number;
  /** Seconds this ant has waited at the top of the shaft for the entrance to be safe */
  held?: number;
}

/**
 * The exit gate: with an enemy by the entrance, ants no longer walk out one
 * by one into its jaws. Workers and scouts wait at the top of the shaft;
 * soldiers gather there and sortie together. Ants under a player order and
 * the exploding ants go out as asked.
 */
export const EXIT_GATE = {
  /** An enemy within this many tiles of the entrance closes the gate */
  radius: 10,
  /** Soldiers waiting at the shaft sortie once they are this many */
  sortieSize: 4,
  /** ...or, two or more, once the first has waited this long (s) */
  sortieWait: 12,
  /** Nobody is kept below longer than this (s): the colony must not starve behind a siege */
  maxWait: 40,
  /** Seconds between two looks outside */
  lookEvery: 0.5,
} as const;

export class TransitSystem implements System {
  readonly name = 'TransitSystem';
  readonly priority = 11;

  private transitQueue: TransitRequest[] = [];

  /** Round-robin cursor for surface -> underground arrivals. Spreading arrivals
   *  across entrances is the point of digging extra ones: with a single shaft
   *  every ant pops out on the same tiles and the crowding cap does the rest. */
  private enterRotation = 0;

  /** An enemy stands by the entrance (refreshed every EXIT_GATE.lookEvery s) */
  private threatened = false;
  private lookTimer = 0;
  /** Invaders inside the nest: waiting soldiers are handed back to its defense */
  private nestBreached: (() => boolean) | null = null;

  private world: World;
  private grid: UndergroundGrid;

  constructor(world: World, grid: UndergroundGrid) {
    this.world = world;
    this.grid = grid;
  }

  requestTransit(entityId: number, direction: 'enter' | 'exit'): void {
    // Nurses and defenders live underground — they never exit
    const ant = this.world.getComponent<AntComponent>(entityId, COMPONENT.ANT);
    if (ant && (ant.role === AntRole.Nurse || ant.role === AntRole.Defender) && direction === 'exit') return;

    // Don't double-queue
    if (this.transitQueue.some(t => t.entityId === entityId)) return;

    if (direction === 'exit') {
      // Walk to the CLOSEST entrance, not a fixed one — that shorter walk is
      // half the value of digging a second shaft.
      const pos = this.world.getComponent<PositionComponent>(entityId, COMPONENT.POSITION);
      const pathComp = this.world.getComponent<PathComponent>(entityId, COMPONENT.PATH);
      if (!pos) return;

      const entrance = this.grid.findNearestEntrance(pos.x, pos.y);
      if (!entrance) return; // nest fully sealed — nobody can leave

      if (pathComp) {
        const route = this.grid.findPath(pos.x, pos.y, entrance.x, entrance.y);
        if (route && route.length > 0) {
          pathComp.waypoints = route;
          pathComp.currentIndex = 0;
        }
      }
      this.transitQueue.push({
        entityId,
        direction,
        timer: TRANSIT_DURATION,
        phase: 'walking',
        entranceX: entrance.x,
        entranceY: entrance.y,
      });
    } else {
      const entrance = this.nextEnterEntrance();
      if (!entrance) return;
      this.transitQueue.push({
        entityId,
        direction,
        timer: TRANSIT_DURATION,
        phase: 'transitioning',
        entranceX: entrance.x,
        entranceY: entrance.y,
      });
    }
  }

  /** Next entrance in rotation for an arriving ant */
  private nextEnterEntrance(): { x: number; y: number } | null {
    const entrances = this.grid.getEntrances();
    if (entrances.length === 0) return null;
    const pick = entrances[this.enterRotation % entrances.length];
    this.enterRotation = (this.enterRotation + 1) % entrances.length;
    return pick;
  }

  /** Tell the gate how to know the nest is breached (its waiting soldiers then defend it) */
  setNestBreached(check: () => boolean): void {
    this.nestBreached = check;
  }

  /** Ants waiting below for the entrance to be safe (the HUD and tests read it) */
  heldCount(): number {
    let n = 0;
    for (const t of this.transitQueue) if (t.held !== undefined) n++;
    return n;
  }

  /** Is an enemy of the colony standing by the entrance, on the surface */
  private enemyAtEntrance(): boolean {
    const cx = Math.floor(WORLD_WIDTH / 2);
    const cy = Math.floor(WORLD_HEIGHT / 2);
    for (const id of this.world.query(COMPONENT.COMBAT, COMPONENT.POSITION)) {
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      if (Math.abs(pos.x - cx) > EXIT_GATE.radius || Math.abs(pos.y - cy) > EXIT_GATE.radius) continue;
      if (Math.hypot(pos.x - cx, pos.y - cy) > EXIT_GATE.radius) continue;
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      if (layer && layer.layer !== Layer.Surface) continue;
      const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
      if (health && health.current <= 0) continue;
      if (isHostileTo(this.world, FactionId.PLAYER, id)) return true;
    }
    return false;
  }

  /**
   * The gate, once per tick: which of the ants ready to step out stay below.
   * Returns the ids to keep; soldiers handed back to a breached nest are
   * dropped from the queue here.
   */
  private holdBack(dt: number): Set<number> {
    const keep = new Set<number>();
    const ready = this.transitQueue.filter((t) => t.direction === 'exit' && t.phase === 'transitioning' && t.timer - dt <= 0);
    if (ready.length === 0) return keep;
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTimer = EXIT_GATE.lookEvery;
      this.threatened = this.enemyAtEntrance();
    }
    if (!this.threatened) {
      for (const t of ready) t.held = undefined;
      return keep;
    }
    const soldiers: TransitRequest[] = [];
    for (const t of ready) {
      const ant = this.world.getComponent<AntComponent>(t.entityId, COMPONENT.ANT);
      // Only the colony's ants wait; the player's orders and the exploding ants go out as asked
      if (!ant || ant.role === AntRole.Bomber || hasPlayerOrder(this.world, t.entityId)) continue;
      t.held = (t.held ?? 0) + dt;
      if (t.held >= EXIT_GATE.maxWait) continue;
      if (ant.role === AntRole.Soldier) soldiers.push(t);
      else keep.add(t.entityId);
    }
    if (soldiers.length > 0 && this.nestBreached?.()) {
      // Invaders below: the soldiers at the shaft go back to the nest's defense
      for (const t of soldiers) this.transitQueue.splice(this.transitQueue.indexOf(t), 1);
    } else {
      const longest = soldiers.reduce((most, t) => Math.max(most, t.held ?? 0), 0);
      const sortie = soldiers.length >= EXIT_GATE.sortieSize || (soldiers.length >= 2 && longest >= EXIT_GATE.sortieWait);
      if (!sortie) for (const t of soldiers) keep.add(t.entityId);
    }
    if (keep.size > 0) {
      this.world.pushNotification('warning', '🚪 Enemigo en la entrada: las obreras esperan dentro y los soldados salen en grupo', 'exit-gate', 45000);
    }
    return keep;
  }

  isInTransit(entityId: number): boolean {
    return this.transitQueue.some(t => t.entityId === entityId);
  }

  /** True while the ant is on its way UP (walking to a shaft or riding it) */
  isExiting(entityId: number): boolean {
    return this.transitQueue.some(t => t.entityId === entityId && t.direction === 'exit');
  }

  /** Call off a pending exit so an idle ant still below can take work there
   *  instead. Ants riding down from the surface are never recalled. */
  cancelExit(entityId: number): boolean {
    const idx = this.transitQueue.findIndex(t => t.entityId === entityId && t.direction === 'exit');
    if (idx === -1) return false;
    this.transitQueue.splice(idx, 1);
    return true;
  }

  /** Call off a ride down the shaft (a player order wants the ant on the surface).
   *  Exits are left alone: the ant is already below and on its way up. */
  cancelEnter(entityId: number): boolean {
    const idx = this.transitQueue.findIndex(t => t.entityId === entityId && t.direction === 'enter');
    if (idx === -1) return false;
    this.transitQueue.splice(idx, 1);
    return true;
  }

  update(dt: number): void {
    const keep = this.holdBack(dt);
    for (let i = this.transitQueue.length - 1; i >= 0; i--) {
      const transit = this.transitQueue[i];

      if (!this.world.hasEntity(transit.entityId)) {
        this.transitQueue.splice(i, 1);
        continue;
      }

      if (transit.phase === 'walking') {
        // Wait for entity to reach the underground entrance before transitioning
        const pos = this.world.getComponent<PositionComponent>(transit.entityId, COMPONENT.POSITION);
        if (!pos) { this.transitQueue.splice(i, 1); continue; }

        const entranceX = transit.entranceX;
        const entranceY = transit.entranceY;
        const dx = (entranceX + 0.5) - pos.x;
        const dy = (entranceY + 0.5) - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1.5) {
          // Reached entrance — start the transition countdown
          transit.phase = 'transitioning';
          transit.timer = TRANSIT_DURATION;
        } else {
          // Re-set path using BFS if MovementSystem cleared it
          const pathComp = this.world.getComponent<PathComponent>(transit.entityId, COMPONENT.PATH);
          if (pathComp && pathComp.waypoints.length === 0) {
            const route = this.grid.findPath(pos.x, pos.y, entranceX, entranceY);
            if (route && route.length > 0) {
              pathComp.waypoints = route;
              pathComp.currentIndex = 0;
            }
          }
        }
        continue;
      }

      transit.timer -= dt;
      // The gate: an enemy by the entrance, this one waits at the top of the shaft
      if (keep.has(transit.entityId)) continue;

      if (transit.timer <= 0) {
        this.completeTransit(transit);
        this.transitQueue.splice(i, 1);
      }
    }
  }

  private completeTransit(transit: TransitRequest): void {
    const layer = this.world.getComponent<LayerComponent>(transit.entityId, COMPONENT.LAYER);
    const pos = this.world.getComponent<PositionComponent>(transit.entityId, COMPONENT.POSITION);
    if (!layer || !pos) return;

    if (transit.direction === 'enter') {
      // Surface → Underground
      layer.layer = Layer.Underground;
      // Drop in at the entrance assigned by the rotation — tile CENTER is +0.5
      pos.x = transit.entranceX + 0.5;
      pos.y = transit.entranceY + 0.5;
      pos.prevX = pos.x;
      pos.prevY = pos.y;
    } else {
      // Underground → Surface
      layer.layer = Layer.Surface;
      // Place at nest position (surface center)
      pos.x = Math.floor(WORLD_WIDTH / 2);
      pos.y = Math.floor(WORLD_HEIGHT / 2);
      pos.prevX = pos.x;
      pos.prevY = pos.y;
    }
  }
}
