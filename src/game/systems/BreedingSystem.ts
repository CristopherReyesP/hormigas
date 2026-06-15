import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import {
  COMPONENT,
  type QueenComponent,
  type NestComponent,
  type PositionComponent,
} from '../components/components';
import { createAnt } from '../entities/factories';

export class BreedingSystem implements System {
  readonly name = 'BreedingSystem';
  readonly priority = 20;
  private world: World;

  constructor(world: World) {
    this.world = world;
  }

  update(dt: number): void {
    const queens = this.world.query(COMPONENT.QUEEN, COMPONENT.NEST, COMPONENT.POSITION);

    for (const queenId of queens) {
      const queen = this.world.getComponent<QueenComponent>(queenId, COMPONENT.QUEEN)!;
      const nest = this.world.getComponent<NestComponent>(queenId, COMPONENT.NEST)!;
      const pos = this.world.getComponent<PositionComponent>(queenId, COMPONENT.POSITION)!;

      if (!queen.isBreeding) continue;

      // Count down the breed timer
      queen.breedTimer -= dt;

      if (queen.breedTimer <= 0) {
        // Breeding complete - spawn the ant near the nest
        const angle = Math.random() * Math.PI * 2;
        const dist = 1 + Math.random() * 2;
        const x = pos.x + Math.cos(angle) * dist;
        const y = pos.y + Math.sin(angle) * dist;

        createAnt(this.world, x, y, queen.breedRole);

        // Increment nest ant count
        nest.antCount++;

        // Reset breeding state
        queen.isBreeding = false;
        queen.breedTimer = 0;
      }
    }
  }
}
