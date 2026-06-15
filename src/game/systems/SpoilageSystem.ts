import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, type NestComponent } from '../components/components';
import { SURFACE_SPOILAGE_RATE } from '../../shared/constants';

/**
 * Food left at the surface nest slowly rots; the underground pantry keeps
 * it fresh. Storing underground is a strategic choice, not just flavor.
 */
export class SpoilageSystem implements System {
  readonly name = 'SpoilageSystem';
  readonly priority = 32;

  private world: World;
  private alerted = false;

  constructor(world: World) {
    this.world = world;
  }

  update(dt: number): void {
    const nests = this.world.query(COMPONENT.NEST);
    if (nests.length === 0) return;

    const nest = this.world.getComponent<NestComponent>(nests[0], COMPONENT.NEST)!;
    if (nest.foodStored <= 0) return;

    const loss = nest.foodStored * SURFACE_SPOILAGE_RATE * dt;
    const ratio = (nest.foodStored - loss) / nest.foodStored;

    nest.foodStored = Math.max(0, nest.foodStored - loss);
    // Typed stores shrink proportionally so the implicit leaf amount stays consistent
    nest.mushroomStored = Math.max(0, (nest.mushroomStored || 0) * ratio);
    nest.meatStored = Math.max(0, (nest.meatStored || 0) * ratio);

    // One-time hint the first time a meaningful pile is rotting on the surface
    if (!this.alerted && nest.foodStored > 150) {
      this.world.pushNotification('info', '🥀 La comida en superficie se pudre lentamente — bajo tierra se conserva fresca');
      this.alerted = true;
    }
  }
}
