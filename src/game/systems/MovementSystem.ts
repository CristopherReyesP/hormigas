import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { WalkableGrid } from '../../simulation/world/WalkableGrid';
import type { GlobalModifiers } from '../events/GlobalModifiers';
import { COMPONENT, Layer, type PositionComponent, type PathComponent, type RoleStatsComponent, type CarryingComponent, type FacingComponent, type LayerComponent } from '../components/components';
import { ANT_SPEED, MAX_ANTS_PER_TILE_UNDERGROUND, UNDERGROUND_WIDTH, CROWD_SQUEEZE_SECONDS } from '../../shared/constants';

export class MovementSystem implements System {
  readonly name = 'MovementSystem';
  readonly priority = 10;
  private world: World;
  private surfaceGrid: WalkableGrid;
  private undergroundGrid: WalkableGrid;
  private modifiers: GlobalModifiers;
  // Crowd-blocked time per ant — after CROWD_SQUEEZE_SECONDS it pushes through
  // anyway (ants physically squeeze past each other; a cap must throttle flow,
  // never freeze it — two-way single-file traffic deadlocks without this valve)
  private blockedTime: Map<number, number> = new Map();

  constructor(world: World, surfaceGrid: WalkableGrid, modifiers: GlobalModifiers, undergroundGrid?: WalkableGrid) {
    this.world = world;
    this.surfaceGrid = surfaceGrid;
    this.undergroundGrid = undergroundGrid ?? surfaceGrid;
    this.modifiers = modifiers;
  }

  /**
   * Coordinate conventions differ per layer:
   * - Surface: integer positions are tile centers → Math.round maps position to tile.
   * - Underground: tile (x,y) spans [x, x+1) and centers are x+0.5 → Math.floor maps position to tile.
   * Using round underground put entities "inside the wall" whenever they stood at a tile center.
   */
  private resolveLayer(id: number): { grid: WalkableGrid; underground: boolean } {
    const layerComp = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
    if (layerComp && layerComp.layer === Layer.Underground) {
      return { grid: this.undergroundGrid, underground: true };
    }
    return { grid: this.surfaceGrid, underground: false };
  }

  update(dt: number): void {
    const entities = this.world.query(COMPONENT.POSITION, COMPONENT.PATH);

    // Underground crowding map: ANTS per tile (the queen has no ANT component,
    // so she is exempt — she always fits, and never gets walled in by workers).
    // Corridor width becomes strategy: a 1-wide tunnel only fits so many ants.
    const occupancy = new Map<number, number>();
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.LAYER)) {
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Underground) continue;
      const p = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const key = Math.floor(p.y) * UNDERGROUND_WIDTH + Math.floor(p.x);
      occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
    }

    for (const id of entities) {
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!;

      // Save previous position for interpolation
      pos.prevX = pos.x;
      pos.prevY = pos.y;

      if (path.waypoints.length === 0 || path.currentIndex >= path.waypoints.length) {
        continue;
      }

      const { grid, underground } = this.resolveLayer(id);
      const toTile = underground ? Math.floor : Math.round;
      const target = path.waypoints[path.currentIndex];
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 0.1) {
        pos.x = target.x;
        pos.y = target.y;
        path.currentIndex++;
      } else {
        // Apply role-based speed multiplier and carry penalty
        const roleStats = this.world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
        let speedMultiplier = roleStats ? roleStats.speedMultiplier : 1.0;
        const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
        if (carrying && carrying.amount > 0 && roleStats) {
          speedMultiplier *= roleStats.carrySpeedPenalty;
        }

        const speed = ANT_SPEED * speedMultiplier * this.modifiers.movementSpeedMultiplier * dt;
        const moveX = (dx / distance) * Math.min(speed, distance);
        const moveY = (dy / distance) * Math.min(speed, distance);

        const newX = pos.x + moveX;
        const newY = pos.y + moveY;

        // Crowding: an underground ANT entering a DIFFERENT tile that's already
        // at capacity waits (path kept — it retries). Two safety valves keep
        // traffic ALIVE: (1) the entrance shaft area is exempt — it's the one
        // choke point every ant must cross, teleports inject there, and two-way
        // flow would gridlock it; (2) an ant blocked too long SQUEEZES past.
        if (underground && this.world.getComponent(id, COMPONENT.ANT)) {
          const entranceX = Math.floor(UNDERGROUND_WIDTH / 2);
          const nearEntrance =
            Math.abs(newX - (entranceX + 0.5)) <= 2.5 && newY <= 5.5;
          const fromKey = Math.floor(pos.y) * UNDERGROUND_WIDTH + Math.floor(pos.x);
          const toKey = Math.floor(newY) * UNDERGROUND_WIDTH + Math.floor(newX);
          if (!nearEntrance && toKey !== fromKey && (occupancy.get(toKey) ?? 0) >= MAX_ANTS_PER_TILE_UNDERGROUND) {
            const waited = (this.blockedTime.get(id) ?? 0) + dt;
            if (waited < CROWD_SQUEEZE_SECONDS) {
              this.blockedTime.set(id, waited);
              continue; // stand still, keep the path, try again
            }
            // Waited long enough — squeeze past (fall through and move)
            this.blockedTime.delete(id);
          } else {
            this.blockedTime.delete(id);
          }
          if (toKey !== fromKey) {
            occupancy.set(toKey, (occupancy.get(toKey) ?? 0) + 1);
            occupancy.set(fromKey, Math.max(0, (occupancy.get(fromKey) ?? 1) - 1));
          }
        }

        const currentTileWalkable = grid.isWalkable(toTile(pos.x), toTile(pos.y));
        const newTileWalkable = grid.isWalkable(toTile(newX), toTile(newY));

        let moved: boolean;

        if (newTileWalkable) {
          pos.x = newX;
          pos.y = newY;
          moved = true;
        } else if (!currentTileWalkable) {
          // Escape mode — on non-walkable tile, allow movement to escape
          pos.x = newX;
          pos.y = newY;
          moved = true;
        } else {
          // Wall sliding — try each axis independently
          const canSlideX = Math.abs(moveX) > 0.001 &&
            grid.isWalkable(toTile(newX), toTile(pos.y));
          const canSlideY = Math.abs(moveY) > 0.001 &&
            grid.isWalkable(toTile(pos.x), toTile(newY));

          if (canSlideX) {
            pos.x = newX;
            moved = true;
          } else if (canSlideY) {
            pos.y = newY;
            moved = true;
          } else {
            // Completely blocked — nudge toward nearest walkable tile center
            moved = this.nudgeTowardWalkable(pos, speed, grid, underground);
            // Clear path so AntAI can reassign (go home, repath, etc.)
            path.waypoints = [];
            path.currentIndex = 0;
          }
        }

        if (moved) {
          const actualDx = pos.x - pos.prevX;
          const actualDy = pos.y - pos.prevY;
          if (Math.abs(actualDx) > 0.001 || Math.abs(actualDy) > 0.001) {
            const facing = this.world.getComponent<FacingComponent>(id, COMPONENT.FACING);
            if (facing) {
              facing.angle = Math.atan2(actualDy, actualDx);
              facing.legPhase += dt * 15;
            }
          }
        }
      }
    }
  }

  /** Smoothly nudge entity toward the nearest walkable tile center */
  private nudgeTowardWalkable(pos: PositionComponent, speed: number, grid: WalkableGrid, underground: boolean): boolean {
    const toTile = underground ? Math.floor : Math.round;
    const cx = toTile(pos.x);
    const cy = toTile(pos.y);

    let tx = cx;
    let ty = cy;

    if (!grid.isWalkable(cx, cy)) {
      // Find nearest walkable neighbor
      const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
      let best: { x: number; y: number } | null = null;
      let bestDist = Infinity;
      for (const [ddx, ddy] of dirs) {
        const nx = cx + ddx;
        const ny = cy + ddy;
        if (grid.isWalkable(nx, ny)) {
          const d = (pos.x - nx) ** 2 + (pos.y - ny) ** 2;
          if (d < bestDist) {
            bestDist = d;
            best = { x: nx, y: ny };
          }
        }
      }
      if (!best) return false;
      tx = best.x;
      ty = best.y;
    }

    // Underground tile centers sit at +0.5 (corner-anchored tiles)
    const centerOffset = underground ? 0.5 : 0;
    const ndx = tx + centerOffset - pos.x;
    const ndy = ty + centerOffset - pos.y;
    const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
    if (ndist < 0.05) return false;

    const nudge = Math.min(speed, ndist);
    pos.x += (ndx / ndist) * nudge;
    pos.y += (ndy / ndist) * nudge;
    return true;
  }
}
