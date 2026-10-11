import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { CreepGrid } from '../../simulation/world/CreepGrid';
import type { TileGrid } from '../../simulation/world/TileGrid';
import { TerrainType } from '../../simulation/world/types';
import { COMPONENT, Layer, type HealthComponent, type LayerComponent, type PositionComponent } from '../components/components';
import {
  CREEP_ANTS_PER_RADIUS,
  CREEP_BASE_RADIUS,
  CREEP_DECAY_STEP,
  CREEP_GROW_STEP,
  CREEP_HEAL_PER_SECOND,
  CREEP_MAX_RADIUS,
  CREEP_SOLID,
  CREEP_UPDATE_SECONDS,
} from '../../shared/constants';

/** Reach of the carpet around a nest for a colony of `ants` living ants */
export function creepRadius(ants: number): number {
  return Math.min(CREEP_MAX_RADIUS, CREEP_BASE_RADIUS + Math.floor(ants / CREEP_ANTS_PER_RADIUS));
}

/** Reach scale (about 0.8-1.2) by direction from the nest: lobes, so the carpet reads as a blob, not a circle */
function edgeWobble(dx: number, dy: number): number {
  const a = Math.atan2(dy, dx);
  return 1 + 0.12 * Math.sin(3 * a + 0.7) + 0.08 * Math.sin(5 * a + 2.1);
}

/**
 * The Swarm's mycelium creep, StarCraft style: a living carpet spreads tile by
 * tile from every nest, reaching farther as the colony grows, and recedes when
 * the nest falls. Colony ants on it run faster (MovementSystem) and heal here.
 */
export class CreepSystem implements System {
  readonly name = 'CreepSystem';
  readonly priority = 32; // after RegenerationSystem (31)

  private world: World;
  private grid: TileGrid;
  private creep: CreepGrid;
  private timer = 0;
  private prev: Uint8Array;

  constructor(world: World, grid: TileGrid, creep: CreepGrid) {
    this.world = world;
    this.grid = grid;
    this.creep = creep;
    this.prev = new Uint8Array(creep.coverage.length);
  }

  update(dt: number): void {
    this.heal(dt);
    this.timer += dt;
    if (this.timer < CREEP_UPDATE_SECONDS) return;
    this.timer -= CREEP_UPDATE_SECONDS;
    this.spread();
  }

  /** Grow the carpet to its full reach at once (a loaded save, a test) */
  settle(): void {
    for (let i = 0; i < 64; i++) this.spread();
  }

  private spread(): void {
    const nests: Array<{ x: number; y: number }> = [];
    for (const id of this.world.query(COMPONENT.NEST, COMPONENT.POSITION)) {
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      nests.push({ x: Math.round(pos.x), y: Math.round(pos.y) });
    }
    const radius = creepRadius(this.world.query(COMPONENT.ANT).length);

    const { width, height, coverage } = this.creep;
    // Spread reads last update's carpet, so it advances one ring per update in every direction
    this.prev.set(coverage);
    const prev = this.prev;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const tile = this.grid.getTile(x, y);
        let reach = false;
        let source = false;
        if (tile && tile.walkable && tile.terrain !== TerrainType.Water) {
          for (const nest of nests) {
            const dx = x - nest.x;
            const dy = y - nest.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= 1.5) source = true;
            if (dist <= radius * edgeWobble(dx, dy)) reach = true;
          }
        }
        const current = prev[idx];
        if (reach) {
          const fed = source
            || (x > 0 && prev[idx - 1] >= CREEP_SOLID)
            || (x < width - 1 && prev[idx + 1] >= CREEP_SOLID)
            || (y > 0 && prev[idx - width] >= CREEP_SOLID)
            || (y < height - 1 && prev[idx + width] >= CREEP_SOLID);
          if (fed && current < 255) coverage[idx] = Math.min(255, current + CREEP_GROW_STEP);
        } else if (current > 0) {
          coverage[idx] = Math.max(0, current - CREEP_DECAY_STEP);
        }
      }
    }
  }

  /** Colony ants (and the queen) standing on surface creep mend their wounds */
  private heal(dt: number): void {
    const amount = CREEP_HEAL_PER_SECOND * dt;
    for (const store of [COMPONENT.ANT, COMPONENT.QUEEN_ENTITY]) {
      for (const id of this.world.query(store, COMPONENT.HEALTH, COMPONENT.POSITION)) {
        const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
        if (layer && layer.layer !== Layer.Surface) continue;
        const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
        if (health.current <= 0 || health.current >= health.max) continue;
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        if (!this.creep.isCreepAt(pos.x, pos.y)) continue;
        health.current = Math.min(health.max, health.current + amount);
      }
    }
  }
}
