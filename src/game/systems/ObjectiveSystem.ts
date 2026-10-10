import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import {
  COMPONENT,
  AntRole,
  type AntComponent,
} from '../components/components';
import { BREED_COST_WORKER } from '../../shared/constants';

export interface ObjectiveDef {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: (world: World, grid: UndergroundGrid) => number;
}

export interface ObjectiveState {
  title: string;
  description: string;
  progress: number;
  target: number;
  completedCount: number;
  totalCount: number;
}

function countAnts(world: World, role?: AntRole): number {
  const ants = world.query(COMPONENT.ANT);
  if (!role) return ants.length;
  let count = 0;
  for (const id of ants) {
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    if (ant.role === role) count++;
  }
  return count;
}

function storageTotal(_world: World, grid: UndergroundGrid): number {
  return Math.floor(grid.getPantryStored().total);
}

/**
 * Sequential colony milestones — a progression curve, not a checklist.
 * Copy is neutral Spanish; "A" is the Criar obrera key of the command card
 * (the first key of the breed row; the broodKeys test in commands.test.ts pins it).
 */
export const OBJECTIVES: readonly ObjectiveDef[] = [
  {
    id: 'cria-primera',
    title: '🥚 Primera generación',
    description: `Cría tu primera hormiga: pulsa A (Criar obrera) cuando la despensa tenga ${BREED_COST_WORKER} de comida`,
    target: 1,
    progress: (w) => w.metrics.antsHatched,
  },
  {
    id: 'poblacion-15',
    title: '🐜 Colonia creciente',
    description: 'Haz crecer la colonia hasta 15 hormigas',
    target: 15,
    progress: (w) => countAnts(w),
  },
  {
    id: 'despensa-100',
    title: '🍖 Despensa abastecida',
    description: 'Acumula 100 de comida en la despensa subterránea',
    target: 100,
    progress: storageTotal,
  },
  {
    id: 'excavacion-5',
    title: '⛏️ Expansión',
    description: 'Excava 5 casillas para ampliar el hormiguero',
    target: 5,
    progress: (w) => w.metrics.tilesExcavated,
  },
  {
    id: 'ejercito-5',
    title: '⚔️ Ejército en pie',
    description: 'Forma un ejército de 5 soldados',
    target: 5,
    progress: (w) => countAnts(w, AntRole.Soldier),
  },
  {
    id: 'nido-1',
    title: '💥 Contraataque',
    description: 'Destruye una guarida enemiga con una oleada de ataque',
    target: 1,
    progress: (w) => w.metrics.densDestroyed,
  },
  {
    id: 'poblacion-30',
    title: '🏛️ Imperio',
    description: 'Haz crecer la colonia hasta 30 hormigas',
    target: 30,
    progress: (w) => countAnts(w),
  },
  {
    id: 'nidos-3',
    title: '👑 Dominio total',
    description: 'Destruye 3 guaridas enemigas',
    target: 3,
    progress: (w) => w.metrics.densDestroyed,
  },
];

export class ObjectiveSystem implements System {
  readonly name = 'ObjectiveSystem';
  readonly priority = 40;

  private world: World;
  private grid: UndergroundGrid;
  private currentIndex = 0;
  private checkTimer = 0;
  private allDoneAnnounced = false;

  constructor(world: World, grid: UndergroundGrid) {
    this.world = world;
    this.grid = grid;
  }

  update(dt: number): void {
    // Objectives don't need per-frame precision — check once per second
    this.checkTimer += dt;
    if (this.checkTimer < 1) return;
    this.checkTimer = 0;

    if (this.currentIndex >= OBJECTIVES.length) {
      if (!this.allDoneAnnounced) {
        this.world.pushNotification('success', '🏆 ¡Todos los objetivos cumplidos! La colonia domina el territorio');
        this.allDoneAnnounced = true;
      }
      return;
    }

    const current = OBJECTIVES[this.currentIndex];
    if (current.progress(this.world, this.grid) >= current.target) {
      this.world.pushNotification('success', `🏆 Objetivo cumplido: ${current.title}`);
      this.currentIndex++;
    }
  }

  getState(): ObjectiveState | null {
    if (this.currentIndex >= OBJECTIVES.length) return null;
    const current = OBJECTIVES[this.currentIndex];
    return {
      title: current.title,
      description: current.description,
      progress: Math.min(current.target, current.progress(this.world, this.grid)),
      target: current.target,
      completedCount: this.currentIndex,
      totalCount: OBJECTIVES.length,
    };
  }

  getCompletedCount(): number {
    return this.currentIndex;
  }

  getTotalCount(): number {
    return OBJECTIVES.length;
  }
}
