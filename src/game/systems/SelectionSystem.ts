import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  type SelectableComponent,
  type PositionComponent,
} from '../components/components';

export class SelectionSystem implements System {
  readonly name = 'SelectionSystem';
  readonly priority = 100; // run late
  private world: World;
  private selectedEntityId: EntityId | null = null;

  constructor(world: World) {
    this.world = world;
  }

  update(_dt: number): void {
    // This system doesn't do anything per-tick
    // Selection is handled via the selectAt method called from UI
  }

  selectAt(tileX: number, tileY: number): void {
    const selectables = this.world.query(COMPONENT.SELECTABLE, COMPONENT.POSITION);

    // Deselect all first
    for (const id of selectables) {
      const selectable = this.world.getComponent<SelectableComponent>(id, COMPONENT.SELECTABLE)!;
      selectable.selected = false;
    }

    this.selectedEntityId = null;

    // Find nearest entity within 2 tiles
    let nearest: EntityId | null = null;
    let nearestDist = 2; // max selection range

    for (const id of selectables) {
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const dx = pos.x - tileX;
      const dy = pos.y - tileY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = id;
      }
    }

    // Select the nearest
    if (nearest !== null) {
      const selectable = this.world.getComponent<SelectableComponent>(nearest, COMPONENT.SELECTABLE)!;
      selectable.selected = true;
      this.selectedEntityId = nearest;
    }
  }

  getSelectedEntityId(): EntityId | null {
    return this.selectedEntityId;
  }

  clearSelection(): void {
    const selectables = this.world.query(COMPONENT.SELECTABLE);
    for (const id of selectables) {
      const selectable = this.world.getComponent<SelectableComponent>(id, COMPONENT.SELECTABLE)!;
      selectable.selected = false;
    }
    this.selectedEntityId = null;
  }
}
