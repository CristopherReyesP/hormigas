import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { FUNGUS_CONVERSION_PER_TILE, FUNGUS_YIELD } from '../../shared/constants';

export type FarmStatus = 'sin-tiles' | 'sin-hojas' | 'llena' | 'produciendo';

/**
 * Leafcutter-style fungus farming: tiles designated as FungusFarm slowly
 * convert stored LEAVES into MUSHROOMS (higher nutrition). More farm tiles
 * = faster conversion. Gives excavation a real economic purpose.
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

    // Leaves come from the pantry piles; mushrooms GROW ON THE FARM TILES.
    // Draining leaves frees pantry space, so the farm never deadlocks against
    // porters topping the pantry up — production is only bounded by farm size.
    const stored = this.grid.getPantryStored();
    if (stored.leaf <= 0) {
      this.setStatus('sin-hojas');
      return;
    }

    const farmSpace = this.grid.getFarmCapacity() - this.grid.getFarmStored();
    if (farmSpace <= 0) {
      this.setStatus('llena');
      return;
    }

    const leaves = Math.min(
      stored.leaf,
      farmTiles * FUNGUS_CONVERSION_PER_TILE * elapsed,
      farmSpace / FUNGUS_YIELD
    );

    const drained = this.grid.drainFoodOfType('leaf', leaves);
    if (drained <= 0) return;

    // Grow the mushrooms pile by pile across the farm tiles
    let toPlace = drained * FUNGUS_YIELD;
    while (toPlace > 1e-6) {
      const tile = this.grid.findFarmDepositTile();
      if (!tile) break;
      const accepted = this.grid.depositFood(tile.x, tile.y, 'mushroom', toPlace);
      if (accepted <= 0) break;
      toPlace -= accepted;
    }

    // No tile accepted the rest — undo the unconverted share as leaves so food
    // is conserved (the drained leaf piles just freed exactly that much space)
    if (toPlace > 1e-6) {
      let leavesBack = toPlace / FUNGUS_YIELD;
      while (leavesBack > 1e-6) {
        const tile = this.grid.findDepositTile('leaf');
        if (!tile) break;
        const accepted = this.grid.depositFood(tile.x, tile.y, 'leaf', leavesBack);
        if (accepted <= 0) break;
        leavesBack -= accepted;
      }
    }

    const produced = drained * FUNGUS_YIELD - toPlace;
    this.producedTotal += produced;
    this.status = 'produciendo';
    this.lastRate = produced / elapsed;

    if (!this.firstHarvestAnnounced && this.producedTotal >= 10) {
      this.world.pushNotification('success', '🍄 ¡La granja de hongos está produciendo! Hojas → hongos (más nutritivos)');
      this.firstHarvestAnnounced = true;
    }
  }
}
