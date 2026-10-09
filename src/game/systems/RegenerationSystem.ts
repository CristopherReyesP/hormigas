import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, type HealthComponent } from '../components/components';

/** Passive healing from the regenerative_tissue mutation: every colony ant, on any layer. */
export class RegenerationSystem implements System {
  readonly name = 'RegenerationSystem';
  readonly priority = 31; // after HungerSystem (30)

  private world: World;

  constructor(world: World) {
    this.world = world;
  }

  update(dt: number): void {
    const rate = this.world.runModifiers.regenHpPerSecond;
    if (rate <= 0) return;
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.HEALTH)) {
      const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
      if (health.current > 0 && health.current < health.max) {
        health.current = Math.min(health.max, health.current + rate * dt);
      }
    }
  }
}
