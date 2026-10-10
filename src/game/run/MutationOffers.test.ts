import { describe, expect, it } from 'vitest';
import { MUTATION_DEFINITIONS, MUTATION_IDS, type MutationId, type MutationTag } from './MutationDefinitions';
import { createSeededRng, offerMutations } from './MutationOffers';

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

function offersFor(applied: readonly MutationId[]): MutationId[][] {
  return SEEDS.map(seed => offerMutations(createSeededRng(seed), applied));
}

function hasTag(id: MutationId, ...tags: MutationTag[]): boolean {
  return MUTATION_DEFINITIONS[id].tags.some(tag => tags.includes(tag));
}

function times(id: MutationId, count: number): MutationId[] {
  return Array.from({ length: count }, () => id);
}

describe('mutation offers', () => {
  it('produces values in [0, 1) from the seeded rng and repeats per seed', () => {
    const a = createSeededRng(9);
    const b = createSeededRng(9);
    for (let i = 0; i < 1000; i++) {
      const value = a();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(b()).toBe(value);
    }
  });

  it('offers three distinct known ids, deterministic per seed and varied across seeds', () => {
    const offer = offerMutations(createSeededRng(42), []);
    expect(offer).toHaveLength(3);
    expect(new Set(offer).size).toBe(3);
    expect(offer.every(id => MUTATION_IDS.includes(id))).toBe(true);
    expect(offerMutations(createSeededRng(42), [])).toEqual(offer);
    expect(new Set(offersFor([]).map(o => o.join())).size).toBeGreaterThan(20);
    for (const o of offersFor([])) expect(new Set(o).size).toBe(3);
  });

  it('never offers a mutation that reached max stacks', () => {
    for (const offer of offersFor(times('acid_mandibles', 3))) expect(offer).not.toContain('acid_mandibles');
    expect(offersFor(times('acid_mandibles', 2)).some(offer => offer.includes('acid_mandibles'))).toBe(true);
  });

  it('returns fewer than three when fewer mutations remain eligible', () => {
    const remaining: MutationId[] = ['cargo_sacs', 'wing_stubs'];
    const applied = MUTATION_IDS.filter(id => !remaining.includes(id)).flatMap(id => times(id, 3));
    expect(offerMutations(createSeededRng(1), applied).sort()).toEqual([...remaining].sort());
  });

  it('offers hive_mind only after two picks tagged Tempo or Assault', () => {
    for (const applied of [[], ['hyper_metabolism'], ['cargo_sacs', 'bone_spurs', 'titan_brood']] as MutationId[][]) {
      for (const offer of offersFor(applied)) expect(offer).not.toContain('hive_mind');
    }
    for (const applied of [['hyper_metabolism', 'acid_mandibles'], times('acid_mandibles', 2)] as MutationId[][]) {
      expect(offersFor(applied).some(offer => offer.includes('hive_mind'))).toBe(true);
    }
  });

  it('includes an Assault or Defense mutation whenever one is available', () => {
    for (const applied of [[], ['cargo_sacs', 'spore_bloom', 'carrion_gut'], times('acid_mandibles', 3)] as MutationId[][]) {
      for (const offer of offersFor(applied)) expect(offer.some(id => hasTag(id, 'Assault', 'Defense'))).toBe(true);
    }
    const combatMaxed = MUTATION_IDS.filter(id => hasTag(id, 'Assault', 'Defense')).flatMap(id => times(id, 3));
    for (const offer of offersFor(combatMaxed)) {
      expect(offer).toHaveLength(3);
      expect(offer.some(id => hasTag(id, 'Assault', 'Defense'))).toBe(false);
    }
  });

  it('weights mutations that share a tag the run already owns', () => {
    const economyShare = (offers: MutationId[][]) =>
      offers.flat().filter(id => hasTag(id, 'Economy')).length / offers.flat().length;
    expect(economyShare(offersFor(['spore_bloom']))).toBeGreaterThan(economyShare(offersFor([])) * 1.1);
  });

  it.each([1, 1.5, -0.01, Number.NaN, Number.POSITIVE_INFINITY])('rejects an rng value outside [0, 1): %s', value => {
    expect(() => offerMutations(() => value, [])).toThrow(RangeError);
  });

  it('accepts rng values at both edges of [0, 1)', () => {
    expect(offerMutations(() => 0, [])).toHaveLength(3);
    expect(offerMutations(() => 0.999999, [])).toHaveLength(3);
  });
});
