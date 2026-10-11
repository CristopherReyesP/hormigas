import type { AntMarks } from '../../engine/renderer/sprites/antMarks';
import { ADDITIVE_STATS, MULTIPLIER_STATS, MUTATION_DEFINITIONS, type MutationId, type RunStat } from './MutationDefinitions';
import { colonyMarks } from './mutationMarks';

export type { RunStat } from './MutationDefinitions';

const RUN_STATS: readonly RunStat[] = [...MULTIPLIER_STATS, ...ADDITIVE_STATS];

/** Separate from transient event modifiers; one instance belongs to each run. */
export class RunModifiers implements Record<RunStat, number> {
  soldierDamageMult = 1;
  soldierSpeedMult = 1;
  soldierMaxHealthMult = 1;
  soldierCostBonus = 0;
  movementSpeedMult = 1;
  carryingSpeedMult = 1;
  workerCarryMult = 1;
  hungerDecayMult = 1;
  maxHungerMult = 1;
  regenHpPerSecond = 0;
  digSpeedMult = 1;
  undergroundDamageMult = 1;
  meatDropMult = 1;
  foodSpawnMult = 1;
  extraInvadersPerWave = 0;
  scoutVisionMult = 1;
  flankingBonusMult = 1;
  antMaxHealthMult = 1;
  antDamageMult = 1;
  incubationSpeedMult = 1;
  antVisionMult = 1;
  queenDamageTakenMult = 1;
  defenderDamageMult = 1;
  defenderMaxHealthMult = 1;
  private readonly appliedMutations: MutationId[] = [];
  private marks: AntMarks | null = null;

  /** Adds one stack of every effect; refuses (false, no change) at maxStacks. */
  apply(id: MutationId): boolean {
    const definition = MUTATION_DEFINITIONS[id];
    if (this.getStacks(id) >= definition.maxStacks) return false;
    for (const effect of definition.effects) {
      if (effect.operation === 'add') this[effect.stat] += effect.value;
      else this[effect.stat] *= effect.value;
    }
    this.appliedMutations.push(id);
    this.marks = null;
    return true;
  }

  getStacks(id: MutationId): number {
    return this.appliedMutations.filter(applied => applied === id).length;
  }

  getAppliedMutations(): MutationId[] {
    return [...this.appliedMutations];
  }

  /** The marks these mutations leave on the ants; the same object until the next pick, so renderers can compare by identity. */
  getColonyMarks(): AntMarks {
    this.marks ??= colonyMarks(this.appliedMutations);
    return this.marks;
  }

  snapshot(): Record<RunStat, number> {
    return Object.fromEntries(RUN_STATS.map(stat => [stat, this[stat]])) as Record<RunStat, number>;
  }
}
