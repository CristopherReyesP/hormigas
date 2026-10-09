import { MUTATION_DEFINITIONS, type MutationId } from './MutationDefinitions';

/** Separate from transient event modifiers; one instance belongs to each run. */
export class RunModifiers {
  soldierDamageMult = 1;
  movementSpeedMult = 1;
  workerCarryBonus = 0;
  digSpeedMult = 1;
  healRateMult = 1;
  hungerDecayMult = 1;
  foodSpawnMult = 1;
  porterCapacityBonus = 0;
  private appliedMutations: MutationId[] = [];

  apply(id: MutationId): void {
    const { effect } = MUTATION_DEFINITIONS[id];
    if (effect.operation === 'add') this[effect.stat] += effect.value;
    else this[effect.stat] *= effect.value;
    this.appliedMutations.push(id);
  }

  getAppliedMutations(): MutationId[] {
    return [...this.appliedMutations];
  }
}
