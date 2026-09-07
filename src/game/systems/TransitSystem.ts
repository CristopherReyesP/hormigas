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
} from '../components/components';
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
}

export class TransitSystem implements System {
  readonly name = 'TransitSystem';
  readonly priority = 11;

  private transitQueue: TransitRequest[] = [];

  /** Round-robin cursor for surface -> underground arrivals. Spreading arrivals
   *  across entrances is the point of digging extra ones: with a single shaft
   *  every ant pops out on the same tiles and the crowding cap does the rest. */
  private enterRotation = 0;

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

  isInTransit(entityId: number): boolean {
    return this.transitQueue.some(t => t.entityId === entityId);
  }

  update(dt: number): void {
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
