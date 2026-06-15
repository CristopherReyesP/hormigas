import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { COMPONENT, Layer, type PositionComponent, type RoleStatsComponent, type LayerComponent } from '../components/components';
import { FOG_REVEAL_MULTIPLIER } from '../../shared/constants';

const DEFAULT_VISION_RANGE = 10;

export class FogOfWarSystem implements System {
  readonly name = 'FogOfWarSystem';
  readonly priority = 12;

  private world: World;
  private visibilityGrid: VisibilityGrid;
  private tickCounter = 0;

  constructor(world: World, visibilityGrid: VisibilityGrid) {
    this.world = world;
    this.visibilityGrid = visibilityGrid;
  }

  update(_dt: number): void {
    // Reveal sweeps cost O(ants × vision²) — every other tick is imperceptible
    // (fog brightness lags one frame at most) and halves the bill at 400+ ants
    this.tickCounter++;
    if (this.tickCounter % 2 !== 0) return;

    this.visibilityGrid.resetBrightness();

    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION);

    for (const id of ants) {
      // Skip underground entities — they don't reveal surface fog
      const layerComp = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      if (layerComp && layerComp.layer === Layer.Underground) continue;

      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const roleStats = this.world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
      const visionRange = roleStats ? roleStats.visionRange : DEFAULT_VISION_RANGE;

      // Fog reveal uses a fraction of combat vision — ants detect enemies far but map terrain slower
      const revealRange = Math.ceil(visionRange * FOG_REVEAL_MULTIPLIER);

      this.visibilityGrid.revealCircle(
        Math.round(pos.x),
        Math.round(pos.y),
        revealRange
      );
    }
  }
}
