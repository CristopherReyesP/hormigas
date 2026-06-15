import type { World } from '../engine/ecs/World';
import type { WalkableGrid } from '../simulation/world/WalkableGrid';
import type { TileGrid } from '../simulation/world/TileGrid';
import type { UndergroundGrid } from '../simulation/world/UndergroundGrid';
import { COMPONENT, Layer, type LayerComponent } from './components/components';
import type { EntityId } from '../shared/types';

export class LayerManager {
  private surfaceGrid: TileGrid;
  private undergroundGrid: UndergroundGrid;
  private world: World;

  constructor(surfaceGrid: TileGrid, undergroundGrid: UndergroundGrid, world: World) {
    this.surfaceGrid = surfaceGrid;
    this.undergroundGrid = undergroundGrid;
    this.world = world;
  }

  getGridForEntity(entityId: EntityId): WalkableGrid {
    const layer = this.world.getComponent<LayerComponent>(entityId, COMPONENT.LAYER);
    if (layer?.layer === Layer.Underground) {
      return this.undergroundGrid;
    }
    return this.surfaceGrid;
  }

  getSurfaceGrid(): TileGrid {
    return this.surfaceGrid;
  }

  getUndergroundGrid(): UndergroundGrid {
    return this.undergroundGrid;
  }
}
