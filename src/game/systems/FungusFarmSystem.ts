import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { FUNGUS_CONVERSION_PER_TILE, FUNGUS_YIELD } from '../../shared/constants';

export type FarmStatus = 'sin-tiles' | 'sin-hojas' | 'sin-abono' | 'llena' | 'produciendo';

/**
 * Leafcutter-style fungus farming: gardener ants carry LEAVES from the pantry
 * onto the FungusFarm tiles as mulch, and the fungus on each tile turns its
 * mulch into MUSHROOMS (higher nutrition). More tended tiles = more growth.
 */
export class FungusFarmSystem implements System {
  readonly name = 'FungusFarmSystem';
  readonly priority = 17;

  private world: World;
  private grid: UndergroundGrid;
  private tickTimer = 0;
  private farmTileCount = 0;
  private producedTotal = 0;
  private firstHarvestAnnounced = false;
  private status: FarmStatus = 'sin-tiles';
  private lastRate = 0; // mushrooms/s produced in the last conversion window

  private setStatus(status: FarmStatus): void {
    this.status = status;
    if (status !== 'produciendo') this.lastRate = 0;
  }

  constructor(world: World, grid: UndergroundGrid) {
    this.world = world;
    this.grid = grid;
  }

  /** For UI: number of designated farm tiles */
  getFarmTileCount(): number {
    return this.farmTileCount;
  }

  /** Player-facing state: what the farm is doing right now, and why if stalled */
  getStatus(): { tiles: number; rate: number; status: FarmStatus } {
    return { tiles: this.farmTileCount, rate: this.lastRate, status: this.status };
  }

  update(dt: number): void {
    // Recount farm tiles + convert once per second — no need for per-frame work
    this.tickTimer += dt;
    if (this.tickTimer < 1) return;
    const elapsed = this.tickTimer;
    this.tickTimer = 0;

    const farmTiles = this.grid.getFarmTiles().length;
    this.farmTileCount = farmTiles;
    if (farmTiles === 0) {
      this.setStatus('sin-tiles');
      return;
    }

    // The fungus grows on the leaf MULCH gardener ants lay on each farm tile
    // (see farmTending): every mulched tile grows its own mushrooms in
    // parallel, so the whole field visibly ripens while it is tended.
    const cap = this.grid.getPantryTileCapacity();
    let drained = 0;
    let anyRoom = false;
    for (const t of this.grid.getFarmTiles()) {
      const grown = t.food?.type === 'mushroom' ? t.food.amount : 0;
      const room = cap - grown;
      if (room <= 1e-6) continue;
      anyRoom = true;
      const mulch = this.grid.getFarmMulch(t.x, t.y);
      if (mulch <= 0) continue;
      const leaves = this.grid.takeFarmMulch(t.x, t.y, Math.min(mulch, FUNGUS_CONVERSION_PER_TILE * elapsed, room / FUNGUS_YIELD));
      drained += leaves;
      this.grid.depositFood(t.x, t.y, 'mushroom', leaves * FUNGUS_YIELD);
    }

    if (!anyRoom) {
      this.setStatus('llena');
      return;
    }
    if (drained <= 0) {
      this.setStatus(this.grid.getPantryStored().leaf > 0 ? 'sin-abono' : 'sin-hojas');
      return;
    }

    const produced = drained * FUNGUS_YIELD;
    this.producedTotal += produced;
    this.status = 'produciendo';
    this.lastRate = produced / elapsed;

    if (!this.firstHarvestAnnounced && this.producedTotal >= 10) {
      this.world.pushNotification('success', '🍄 ¡La granja de hongos está produciendo! Hojas → hongos (más nutritivos)');
      this.firstHarvestAnnounced = true;
    }
  }
}
