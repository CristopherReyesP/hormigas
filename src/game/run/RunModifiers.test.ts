import { describe, expect, it } from 'vitest';
import { RunModifiers } from './RunModifiers';
import { MUTATION_IDS, offerMutations } from './MutationDefinitions';

function seededRng(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

describe('run mutations', () => {
  it.each([
    ['acid_mandibles', 'soldierDamageMult', 1.25],
    ['hyper_metabolism', 'movementSpeedMult', 1.15],
    ['cargo_sacs', 'workerCarryBonus', 1],
    ['burrowing_claws', 'digSpeedMult', 1.35],
    ['regenerative_tissue', 'healRateMult', 1.4],
    ['iron_stomach', 'hungerDecayMult', 0.75],
    ['spore_bloom', 'foodSpawnMult', 1.3],
    ['titan_backs', 'porterCapacityBonus', 1],
  ] as const)('applies and stacks %s', (id, stat, value) => {
    const run = new RunModifiers();
    run.apply(id);
    expect(run[stat]).toBeCloseTo(value);
    run.apply(id);
    expect(run[stat]).toBeCloseTo(stat.endsWith('Bonus') ? value * 2 : value ** 2);
    expect(run.getAppliedMutations()).toEqual([id, id]);
  });

  it('offers distinct valid mutations deterministically without changing the registry', () => {
    const offer = offerMutations(seededRng(42));
    expect(offer).toHaveLength(3);
    expect(new Set(offer).size).toBe(3);
    expect(offer.every(id => MUTATION_IDS.includes(id))).toBe(true);
    expect(offerMutations(seededRng(42))).toEqual(offer);
    expect(offerMutations(seededRng(7))).not.toEqual(offer);
    expect(offerMutations(() => 0, 100)).toEqual([...MUTATION_IDS]);
    expect(offerMutations(() => 0, 0)).toEqual([]);
  });

  it('starts a new run clean and returns a defensive copy of picks', () => {
    const first = new RunModifiers();
    first.apply('acid_mandibles');
    const picks = first.getAppliedMutations();
    picks.length = 0;
    expect(first.getAppliedMutations()).toEqual(['acid_mandibles']);
    expect(new RunModifiers()).toEqual(new RunModifiers());
    expect(new RunModifiers().getAppliedMutations()).toEqual([]);
  });
});
