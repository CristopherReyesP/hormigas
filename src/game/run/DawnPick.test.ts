import { describe, expect, it } from 'vitest';
import { buildMutationOffer, summarizeMutationBuild } from './DawnPick';
import { MUTATION_DEFINITIONS } from './MutationDefinitions';

describe('dawn offer snapshot', () => {
  it('flattens definitions and the current stacks into cards', () => {
    const offer = buildMutationOffer(3, ['titan_brood', 'wing_stubs'], id => (id === 'titan_brood' ? 2 : 0));
    const titan = MUTATION_DEFINITIONS.titan_brood;
    expect(offer.dayNumber).toBe(3);
    expect(offer.options).toHaveLength(2);
    expect(offer.options[0]).toEqual({
      id: 'titan_brood', name: titan.name, description: titan.description, upsideText: titan.upsideText,
      costText: titan.costText, tags: titan.tags, mark: titan.mark, stacks: 2, maxStacks: titan.maxStacks,
    });
    expect(offer.options[1]).toMatchObject({ id: 'wing_stubs', costText: null, stacks: 0 });
  });

  it('summarizes the build in first-pick order with stack counts', () => {
    expect(summarizeMutationBuild(['cargo_sacs', 'acid_mandibles', 'cargo_sacs'])).toEqual([
      { id: 'cargo_sacs', name: MUTATION_DEFINITIONS.cargo_sacs.name, stacks: 2 },
      { id: 'acid_mandibles', name: MUTATION_DEFINITIONS.acid_mandibles.name, stacks: 1 },
    ]);
    expect(summarizeMutationBuild([])).toEqual([]);
  });
});
