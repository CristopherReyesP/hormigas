import { describe, expect, it } from 'vitest';
import { RunModifiers, type RunStat } from './RunModifiers';
import { MUTATION_DEFINITIONS, MUTATION_IDS, type MutationId } from './MutationDefinitions';

const ADDITIVE_STATS: readonly RunStat[] = ['regenHpPerSecond', 'extraInvadersPerWave', 'soldierCostBonus'];

const EXPECTED: Record<MutationId, { upside: Partial<Record<RunStat, number>>; cost: Partial<Record<RunStat, number>> }> = {
  acid_mandibles: { upside: { soldierDamageMult: 1.4 }, cost: { soldierSpeedMult: 0.9 } },
  hyper_metabolism: { upside: { movementSpeedMult: 1.2 }, cost: { hungerDecayMult: 1.25 } },
  cargo_sacs: { upside: { workerCarryMult: 1.5 }, cost: { carryingSpeedMult: 0.9 } },
  bone_spurs: { upside: { digSpeedMult: 1.3, undergroundDamageMult: 1.5 }, cost: {} },
  regenerative_tissue: { upside: { regenHpPerSecond: 1 }, cost: { maxHungerMult: 0.85 } },
  carrion_gut: { upside: { hungerDecayMult: 0.7, meatDropMult: 1.5 }, cost: {} },
  spore_bloom: { upside: { foodSpawnMult: 1.3 }, cost: { extraInvadersPerWave: 1 } },
  titan_brood: { upside: { soldierMaxHealthMult: 1.5 }, cost: { soldierSpeedMult: 0.75, soldierCostBonus: 10 } },
  wing_stubs: { upside: { scoutVisionMult: 1.5 }, cost: {} },
  hive_mind: { upside: { flankingBonusMult: 2 }, cost: {} },
};

function neutral(stat: RunStat): number {
  return ADDITIVE_STATS.includes(stat) ? 0 : 1;
}

function stacked(stat: RunStat, value: number, stacks: number): number {
  return ADDITIVE_STATS.includes(stat) ? value * stacks : value ** stacks;
}

describe('mutation definitions', () => {
  it('defines the ten T2b mutations with text, tags, a mark and three stacks', () => {
    expect([...MUTATION_IDS]).toEqual(Object.keys(EXPECTED));
    for (const id of MUTATION_IDS) {
      const definition = MUTATION_DEFINITIONS[id];
      expect(definition.id).toBe(id);
      expect(definition.maxStacks).toBe(3);
      expect(definition.name).toMatch(/\S/);
      expect(definition.description).toMatch(/\S/);
      expect(definition.upsideText).toMatch(/\S/);
      expect(definition.tags.length).toBeGreaterThan(0);
      expect(definition.mark).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });

  it.each(MUTATION_IDS)('splits %s effects into upsides and costs with a matching cost line', id => {
    const definition = MUTATION_DEFINITIONS[id];
    const byKind = (kind: 'upside' | 'cost') =>
      Object.fromEntries(definition.effects.filter(effect => effect.kind === kind).map(effect => [effect.stat, effect.value]));
    expect(byKind('upside')).toEqual(EXPECTED[id].upside);
    expect(byKind('cost')).toEqual(EXPECTED[id].cost);
    if (Object.keys(EXPECTED[id].cost).length > 0) expect(definition.costText).toMatch(/\S/);
    else expect(definition.costText).toBeNull();
  });
});

describe('run modifiers', () => {
  it.each(MUTATION_IDS)('applies the upside and the cost of %s and leaves other stats neutral', id => {
    const run = new RunModifiers();
    expect(run.apply(id)).toBe(true);
    const touched = { ...EXPECTED[id].upside, ...EXPECTED[id].cost };
    for (const stat of Object.keys(touched) as RunStat[]) expect(run[stat]).toBeCloseTo(touched[stat]!);
    const fresh = new RunModifiers();
    for (const stat of Object.keys(fresh.snapshot()) as RunStat[]) {
      if (!(stat in touched)) expect(run[stat]).toBe(neutral(stat));
    }
  });

  it.each(MUTATION_IDS)('stacks %s up to three times and refuses a fourth pick', id => {
    const run = new RunModifiers();
    for (let i = 0; i < 3; i++) expect(run.apply(id)).toBe(true);
    const before = run.snapshot();
    expect(run.apply(id)).toBe(false);
    expect(run.snapshot()).toEqual(before);
    expect(run.getStacks(id)).toBe(3);
    expect(run.getAppliedMutations()).toEqual([id, id, id]);
    const touched = { ...EXPECTED[id].upside, ...EXPECTED[id].cost };
    for (const stat of Object.keys(touched) as RunStat[]) {
      expect(run[stat]).toBeCloseTo(stacked(stat, touched[stat]!, 3));
    }
  });

  it('composes the two mutations that share hunger decay multiplicatively', () => {
    const run = new RunModifiers();
    run.apply('hyper_metabolism');
    run.apply('carrion_gut');
    expect(run.hungerDecayMult).toBeCloseTo(1.25 * 0.7);
  });

  it('starts a new run clean and returns a defensive copy of picks', () => {
    const first = new RunModifiers();
    first.apply('acid_mandibles');
    const picks = first.getAppliedMutations();
    picks.length = 0;
    expect(first.getAppliedMutations()).toEqual(['acid_mandibles']);
    const fresh = new RunModifiers();
    expect(fresh.getAppliedMutations()).toEqual([]);
    expect(fresh.getStacks('acid_mandibles')).toBe(0);
    for (const [stat, value] of Object.entries(fresh.snapshot())) expect(value).toBe(neutral(stat as RunStat));
  });
});
