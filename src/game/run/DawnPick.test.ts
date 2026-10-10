import { describe, expect, it } from 'vitest';
import { buildMutationOffer, shouldOfferMutation, summarizeMutationBuild } from './DawnPick';
import { MUTATION_DEFINITIONS } from './MutationDefinitions';

describe('dawn pick rule', () => {
  it.each([2, 3, 4, 5, 6, 7])('offers a mutation at the dawn of day %i', (dayNumber) => {
    expect(shouldOfferMutation('night', 'day', dayNumber, false)).toBe(true);
  });

  it.each([8, 9, 12, 20, 30])('keeps offering past night 7 in the endless run (day %i)', (dayNumber) => {
    expect(shouldOfferMutation('night', 'day', dayNumber, false)).toBe(true);
  });

  it.each([
    ['day', 'day', 3],
    ['day', 'night', 3],
    ['night', 'night', 3],
  ] as const)('does not offer outside a night-to-day transition (%s to %s)', (previousPhase, phase, dayNumber) => {
    expect(shouldOfferMutation(previousPhase, phase, dayNumber, false)).toBe(false);
  });

  it('does not offer on the first day or once the run is over', () => {
    expect(shouldOfferMutation('night', 'day', 1, false)).toBe(false);
    expect(shouldOfferMutation('night', 'day', 4, true)).toBe(false);
  });
});

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
