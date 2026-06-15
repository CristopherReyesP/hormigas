import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import {
  COMPONENT,
  AntRole,
  Layer,
  type EggComponent,
  type EggQueueComponent,
  type PositionComponent,
  type LayerComponent,
  type QueenEntityComponent,
} from '../components/components';
import { createEgg, createAnt } from '../entities/factories';
import {
  EGG_INCUBATION_WORKER,
  EGG_INCUBATION_SOLDIER,
  EGG_INCUBATION_SCOUT,
  EGG_INCUBATION_NURSE,
  EGG_INCUBATION_DEFENDER,
  QUEEN_EGG_LAY_HUNGER_COST,
  QUEEN_MIN_HUNGER_TO_LAY,
} from '../../shared/constants';
import { TransitSystem } from './TransitSystem';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { ChamberType } from '../../simulation/world/types';

const ROLE_BIRTH_NAMES: Record<string, string> = {
  worker: 'una obrera',
  soldier: 'un soldado',
  scout: 'una exploradora',
  nurse: 'una nodriza',
  defender: 'una defensora',
};

export class EggIncubationSystem implements System {
  readonly name = 'EggIncubationSystem';
  readonly priority = 22;

  private world: World;
  private transitSystem: TransitSystem;
  private undergroundGrid: UndergroundGrid;
  private layingPausedAlerted = false;

  constructor(world: World, transitSystem: TransitSystem, undergroundGrid: UndergroundGrid) {
    this.world = world;
    this.transitSystem = transitSystem;
    this.undergroundGrid = undergroundGrid;
  }

  update(dt: number): void {
    // Process queen egg laying
    this.processQueenLaying(dt);
    // Process egg incubation
    this.processEggs(dt);
  }

  private processQueenLaying(dt: number): void {
    const queens = this.world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.EGG_QUEUE, COMPONENT.POSITION);

    for (const id of queens) {
      const eggQueue = this.world.getComponent<EggQueueComponent>(id, COMPONENT.EGG_QUEUE)!;

      if (eggQueue.queue.length === 0) {
        eggQueue.currentlyLaying = false;
        continue;
      }

      // A starving queen pauses laying until nurses feed her
      const queen = this.world.getComponent<QueenEntityComponent>(id, COMPONENT.QUEEN_ENTITY)!;
      if (queen.hunger < QUEEN_MIN_HUNGER_TO_LAY) {
        eggQueue.currentlyLaying = false;
        if (!this.layingPausedAlerted) {
          this.world.pushNotification('danger', '👑 La reina dejó de poner huevos — ¡está muriendo de hambre!');
          this.layingPausedAlerted = true;
        }
        continue;
      }
      this.layingPausedAlerted = false;

      if (!eggQueue.currentlyLaying) {
        eggQueue.currentlyLaying = true;
        eggQueue.queue[0].layTimer = eggQueue.queue[0].layTimerTotal;
      }

      const current = eggQueue.queue[0];
      current.layTimer -= dt;

      if (current.layTimer <= 0) {
        // Lay egg — spawn egg entity RIGHT NEXT to queen
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        const offsetX = (Math.random() - 0.5) * 1.5;
        const offsetY = (Math.random() - 0.5) * 1.5;
        const hatchTime = this.getIncubationTime(current.role);
        createEgg(this.world, pos.x + offsetX, pos.y + offsetY, current.role, hatchTime);
        queen.hunger = Math.max(0, queen.hunger - QUEEN_EGG_LAY_HUNGER_COST);

        eggQueue.queue.shift();
        eggQueue.currentlyLaying = false;
      }
    }
  }

  private processEggs(dt: number): void {
    const eggs = this.world.query(COMPONENT.EGG, COMPONENT.POSITION);

    for (const id of eggs) {
      const egg = this.world.getComponent<EggComponent>(id, COMPONENT.EGG)!;

      // Check if egg is in incubation area (positions are in tile coords for underground)
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const tileX = Math.floor(pos.x);
      const tileY = Math.floor(pos.y);
      const tile = this.undergroundGrid.getTile(tileX, tileY);
      const inIncubation = tile !== null && tile.chamberType === ChamberType.Incubation;

      // Eggs incubate just by being in the incubation area
      if (inIncubation) {
        egg.hatchTimer -= dt;

        if (egg.hatchTimer <= 0) {
          egg.hatchTimer = 0;

          // Incubation done, but a hungry larva can't hatch — it waits for a nurse
          if (egg.fedAmount < egg.requiredFood) {
            this.world.pushNotification(
              'warning',
              '🐛 Hay larvas con hambre — las nodrizas necesitan comida en la despensa',
              'larva-hungry',
              15000
            );
            continue;
          }

          // Hatch! Create ant at egg position
          const newAnt = createAnt(this.world, pos.x, pos.y, egg.role);

          // Set the new ant to underground layer
          const layer = this.world.getComponent<LayerComponent>(newAnt, COMPONENT.LAYER);
          if (layer) {
            layer.layer = Layer.Underground;
          }

          // Surface roles auto-transit up; nurses AND defenders live underground
          if (egg.role !== AntRole.Nurse && egg.role !== AntRole.Defender) {
            this.transitSystem.requestTransit(newAnt, 'exit');
          }

          this.world.pushNotification('success', `🐜 ¡Nació ${ROLE_BIRTH_NAMES[egg.role] ?? 'una hormiga'}!`);
          this.world.metrics.antsHatched++;

          // Destroy egg
          this.world.destroyEntity(id);
        }
      }
    }
  }

  private getIncubationTime(role: AntRole): number {
    switch (role) {
      case AntRole.Worker: return EGG_INCUBATION_WORKER;
      case AntRole.Soldier: return EGG_INCUBATION_SOLDIER;
      case AntRole.Scout: return EGG_INCUBATION_SCOUT;
      case AntRole.Nurse: return EGG_INCUBATION_NURSE;
      case AntRole.Defender: return EGG_INCUBATION_DEFENDER;
      default: return EGG_INCUBATION_WORKER;
    }
  }
}
