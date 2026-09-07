import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import type { TransitSystem } from './TransitSystem';
import {
  COMPONENT,
  AntRole,
  AntState,
  Layer,
  type AntComponent,
  type PositionComponent,
  type LayerComponent,
  type PathComponent,
} from '../components/components';
import { EXCAVATION_TIME, MAX_DIG_JOBS } from '../../shared/constants';

interface DigJob {
  x: number;
  y: number;
  assignedTo: number | null;
}

export class ExcavationSystem implements System {
  readonly name = 'ExcavationSystem';
  readonly priority = 6;

  private jobs: DigJob[] = [];

  /** Tiles with a pending dig order — read by the minimap (already tracked here,
   *  so nothing has to rescan the grid for `designated`). */
  getJobTiles(): Array<{ x: number; y: number }> {
    return this.jobs.map((j) => ({ x: j.x, y: j.y }));
  }

  private world: World;
  private grid: UndergroundGrid;
  private transitSystem: TransitSystem;

  // Tiles actually CONNECTED to the colony (BFS flood from the entrance).
  // Adjacency alone lied: a job can touch a walkable tile that no ant can
  // reach, and workers ground against solid earth trying to get there.
  private reachable: Set<number> = new Set();
  private reachableTimer = 0;

  constructor(world: World, grid: UndergroundGrid, transitSystem: TransitSystem) {
    this.world = world;
    this.grid = grid;
    this.transitSystem = transitSystem;
  }

  /** Flood-fill walkable tiles from the entrance shaft (cheap: one pass, throttled) */
  private rebuildReachable(): void {
    this.reachable.clear();
    const W = this.grid.width;
    const startX = Math.floor(W / 2);
    const startY = 2;
    const startKey = startY * W + startX;
    if (!this.grid.isWalkable(startX, startY)) return;
    const stack = [startKey];
    this.reachable.add(startKey);
    while (stack.length > 0) {
      const key = stack.pop()!;
      const x = key % W;
      const y = Math.floor(key / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const nkey = ny * W + nx;
        if (!this.reachable.has(nkey) && this.grid.isWalkable(nx, ny)) {
          this.reachable.add(nkey);
          stack.push(nkey);
        }
      }
    }
  }

  /** A job is workable only if one of its walkable neighbors is colony-connected */
  private isJobReachable(job: DigJob): boolean {
    const W = this.grid.width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (this.reachable.has((job.y + dy) * W + (job.x + dx))) return true;
    }
    return false;
  }

  designateTile(x: number, y: number): boolean {
    if (this.jobs.length >= MAX_DIG_JOBS) return false;
    if (this.jobs.some(j => j.x === x && j.y === y)) return false;

    const success = this.grid.designate(x, y);
    if (success) {
      this.jobs.push({ x, y, assignedTo: null });
    }
    return success;
  }

  cancelDesignation(x: number, y: number): void {
    const idx = this.jobs.findIndex(j => j.x === x && j.y === y);
    if (idx !== -1) {
      const job = this.jobs[idx];
      // Un-designate in grid
      const tile = this.grid.getTile(x, y);
      if (tile) tile.designated = false;
      // If ant was assigned, reset its state
      if (job.assignedTo !== null && this.world.hasEntity(job.assignedTo)) {
        const ant = this.world.getComponent<AntComponent>(job.assignedTo, COMPONENT.ANT);
        if (ant && (ant.state === AntState.GoingToDigSite || ant.state === AntState.Excavating)) {
          ant.state = AntState.Idle;
          ant.stateTimer = 0;
        }
      }
      this.jobs.splice(idx, 1);
    }
  }

  getPendingJobCount(): number {
    return this.jobs.length;
  }

  update(dt: number): void {
    // Refresh colony connectivity twice a second while there's digging to do
    // (each completed tile can open new reachable frontiers)
    this.reachableTimer -= dt;
    if (this.jobs.length > 0 && this.reachableTimer <= 0) {
      this.reachableTimer = 0.5;
      this.rebuildReachable();
    }

    // Remove completed jobs (tile no longer designated)
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const job = this.jobs[i];
      const tile = this.grid.getTile(job.x, job.y);
      if (!tile || !tile.designated) {
        this.jobs.splice(i, 1);
        continue;
      }

      // Unassign zombie jobs: the assigned worker died, left the layer, or was diverted
      if (job.assignedTo !== null) {
        const alive = this.world.hasEntity(job.assignedTo);
        const worker = alive ? this.world.getComponent<AntComponent>(job.assignedTo, COMPONENT.ANT) : null;
        const workerLayer = alive ? this.world.getComponent<LayerComponent>(job.assignedTo, COMPONENT.LAYER) : null;
        const stillOnJob = !!worker && !!workerLayer &&
          workerLayer.layer === Layer.Underground &&
          (worker.state === AntState.GoingToDigSite || worker.state === AntState.Excavating);
        if (!stillOnJob) job.assignedTo = null;
      }
    }

    // Find idle underground workers and assign them dig jobs
    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.LAYER);

    for (const id of ants) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role !== AntRole.Worker) continue;

      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Underground) continue;

      // Handle ants already digging
      if (ant.state === AntState.Excavating) {
        this.handleExcavating(id, ant, dt);
        continue;
      }

      if (ant.state === AntState.GoingToDigSite) {
        this.handleGoingToDigSite(id, ant, dt);
        continue;
      }

      // Only assign idle/searching workers not already in transit
      if (ant.state !== AntState.Idle && ant.state !== AntState.Searching) continue;
      if (this.transitSystem.isInTransit(id)) continue;

      // Find unassigned job
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      let nearestJob: DigJob | null = null;
      let nearestDist = Infinity;

      for (const job of this.jobs) {
        if (job.assignedTo !== null) continue;
        // Only COLONY-CONNECTED jobs: an adjacent-walkable tile that no tunnel
        // reaches is a trap — workers used to grind against earth to get there
        if (!this.isJobReachable(job)) continue;
        const dx = job.x - pos.x;
        const dy = job.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestJob = job;
        }
      }

      if (nearestJob) {
        // Assign ONLY with a real route (no straight-line fallback through earth)
        const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
        const adjacent = this.findAdjacentWalkable(nearestJob.x, nearestJob.y);
        const alreadyThere = nearestDist < 1.8;
        const route = !alreadyThere && adjacent
          ? this.grid.findPath(pos.x, pos.y, adjacent.x + 0.5, adjacent.y + 0.5)
          : null;
        if (alreadyThere || (route && route.length > 0)) {
          nearestJob.assignedTo = id;
          ant.state = AntState.GoingToDigSite;
          ant.stateTimer = 0;
          if (path && route) {
            path.waypoints = route;
            path.currentIndex = 0;
          }
        }
        // No route from THIS worker → leave the job unassigned; another ant
        // (or the next connectivity refresh) will pick it up
      }
    }

    // Recruit surface workers ONLY to cover the real deficit — never more than the
    // reachable unassigned jobs need (previously this sent 2 workers PER FRAME and
    // vacuumed the whole surface workforce underground)
    const reachableUnassigned = this.jobs.filter(
      j => j.assignedTo === null && this.isJobReachable(j)
    );
    if (reachableUnassigned.length > 0) {
      // Count the workforce already underground or on its way down
      let availableWorkforce = 0;
      const idleSurfaceWorkers: number[] = [];

      for (const id of ants) {
        const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
        if (ant.role !== AntRole.Worker) continue;

        const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
        const inTransit = this.transitSystem.isInTransit(id);

        if (layer.layer === Layer.Underground && !inTransit) {
          availableWorkforce++;
        } else if (layer.layer === Layer.Surface) {
          if (inTransit) {
            availableWorkforce++; // already heading down
          } else if (ant.state === AntState.Idle || ant.state === AntState.Searching) {
            idleSurfaceWorkers.push(id);
          }
        }
      }

      const desired = Math.min(4, this.jobs.length);
      const deficit = desired - availableWorkforce;
      const toSend = Math.min(2, deficit, idleSurfaceWorkers.length);
      for (let i = 0; i < toSend; i++) {
        this.transitSystem.requestTransit(idleSurfaceWorkers[i], 'enter');
      }
    }

    // Send idle underground workers back to surface if no reachable unassigned jobs remain
    if (reachableUnassigned.length === 0) {
      for (const id of ants) {
        const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
        if (ant.role !== AntRole.Worker) continue;

        const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
        if (layer.layer !== Layer.Underground) continue;

        if ((ant.state === AntState.Idle || ant.state === AntState.Searching) && !this.transitSystem.isInTransit(id)) {
          this.transitSystem.requestTransit(id, 'exit');
        }
      }
    }
  }

  private handleGoingToDigSite(id: number, ant: AntComponent, dt: number): void {
    const job = this.jobs.find(j => j.assignedTo === id);
    if (!job) {
      ant.state = AntState.Idle;
      return;
    }

    // Give up after 20s — site is unreachable; release the job so it can be retried
    // when the player digs a path closer (a stuck worker held the job hostage forever)
    ant.stateTimer += dt;
    if (ant.stateTimer > 20) {
      job.assignedTo = null;
      ant.state = AntState.Idle;
      ant.stateTimer = 0;
      return;
    }

    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const dx = job.x - pos.x;
    const dy = job.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1.8) {
      // Close enough — start excavating (queen 'dig' upgrade shortens the job)
      ant.state = AntState.Excavating;
      ant.stateTimer = EXCAVATION_TIME / this.world.upgrades.digSpeedMult;
    } else {
      // Re-path if MovementSystem cleared the route (blocked). If NO route
      // exists, release the job immediately — never walk a straight line
      // through solid earth (that was the wall-grinding bug)
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
      if (path && path.waypoints.length === 0) {
        const adjacent = this.findAdjacentWalkable(job.x, job.y);
        const route = adjacent
          ? this.grid.findPath(pos.x, pos.y, adjacent.x + 0.5, adjacent.y + 0.5)
          : null;
        if (route && route.length > 0) {
          path.waypoints = route;
          path.currentIndex = 0;
        } else {
          job.assignedTo = null;
          ant.state = AntState.Idle;
          ant.stateTimer = 0;
        }
      }
    }
  }

  private handleExcavating(id: number, ant: AntComponent, dt: number): void {
    const job = this.jobs.find(j => j.assignedTo === id);
    if (!job) {
      ant.state = AntState.Idle;
      return;
    }

    ant.stateTimer -= dt;

    if (ant.stateTimer <= 0) {
      // Complete excavation. Compare entrance COUNT rather than just checking
      // the row: digging beside an existing shaft widens it, it does not open a
      // second one, and the player should not be told otherwise.
      const entrancesBefore = this.grid.getEntrances().length;
      this.grid.excavate(job.x, job.y);
      this.world.metrics.tilesExcavated++;

      const entrancesAfter = this.grid.getEntrances().length;
      if (entrancesAfter > entrancesBefore) {
        this.world.pushNotification(
          'warning',
          `🕳️ Nueva entrada abierta (${entrancesAfter} en total) — más flujo de forrajeo, pero otro frente por donde entran las oleadas`
        );
      }

      // Remove job
      const idx = this.jobs.indexOf(job);
      if (idx !== -1) this.jobs.splice(idx, 1);

      ant.state = AntState.Idle;
      ant.stateTimer = 0;

      if (this.jobs.length === 0) {
        this.world.pushNotification('success', '⛏️ Excavación completada — los obreros vuelven a la superficie');
      }
    }
  }

  private findAdjacentWalkable(x: number, y: number): { x: number; y: number } | null {
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.grid.isWalkable(nx, ny)) {
        return { x: nx, y: ny };
      }
    }
    return null;
  }
}
