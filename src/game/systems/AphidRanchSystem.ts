import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { APHID_HONEYDEW_PER_TILE } from '../../shared/constants';

export type RanchStatus = 'sin-tiles' | 'asustados' | 'llena' | 'produciendo';

/**
 * The aphid ranch: aphids kept on AphidRanch tiles give honeydew, drop by
 * drop, with nothing brought in from the surface. It is slow and holds
 * little, so it never replaces foraging, but a colony shut in by a siege
 * can live on it and raise the ants it needs to break out. Invaders in the
 * nest scare the aphids: they give nothing until the nest is clear.
 */
export class AphidRanchSystem implements System {
  readonly name = 'AphidRanchSystem';
  readonly priority = 17; // with the fungus farm

  private world: World;
  private grid: UndergroundGrid;
  /** Invaders are inside the nest */
  private breached: () => boolean;
  private tickTimer = 0;
  private tiles = 0;
  private status: RanchStatus = 'sin-tiles';
  private lastRate = 0;
  private producedTotal = 0;
  private announced = false;

  constructor(world: World, grid: UndergroundGrid, breached: () => boolean = () => false) {
    this.world = world;
    this.grid = grid;
    this.breached = breached;
  }

  /** For the HUD: what the ranch is doing now, and why when it gives nothing */
  getStatus(): { tiles: number; rate: number; status: RanchStatus } {
    return { tiles: this.tiles, rate: this.lastRate, status: this.status };
  }

  update(dt: number): void {
    // Once a second is plenty for a trickle
    this.tickTimer += dt;
    if (this.tickTimer < 1) return;
    const elapsed = this.tickTimer;
    this.tickTimer = 0;

    const tiles = this.grid.getRanchTiles();
    this.tiles = tiles.length;
    this.lastRate = 0;
    if (tiles.length === 0) {
      this.status = 'sin-tiles';
      return;
    }
    if (this.breached()) {
      this.status = 'asustados';
      return;
    }
    let produced = 0;
    for (const t of tiles) produced += this.grid.depositFood(t.x, t.y, 'honeydew', APHID_HONEYDEW_PER_TILE * elapsed);
    if (produced <= 0) {
      this.status = 'llena';
      return;
    }
    this.status = 'produciendo';
    this.lastRate = produced / elapsed;
    this.producedTotal += produced;
    if (!this.announced && this.producedTotal >= 5) {
      this.announced = true;
      this.world.pushNotification('success', '🐛 ¡El establo de pulgones da melaza! Comida sin salir del nido');
    }
  }
}
