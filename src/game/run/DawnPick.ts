import { MUTATION_DEFINITIONS, type MutationId, type MutationTag } from './MutationDefinitions';

/** One card of the dawn pick, flattened for the UI snapshot. */
export interface MutationOfferOption {
  id: MutationId;
  name: string;
  description: string;
  upsideText: string;
  costText: string | null;
  tags: readonly MutationTag[];
  mark: string;
  /** Stacks the run already owns, before this pick. */
  stacks: number;
  maxStacks: number;
}

export interface MutationOffer {
  dayNumber: number;
  options: MutationOfferOption[];
}

export interface MutationBuildEntry {
  id: MutationId;
  name: string;
  stacks: number;
}

export function buildMutationOffer(
  dayNumber: number,
  ids: readonly MutationId[],
  stacksOf: (id: MutationId) => number,
): MutationOffer {
  const options = ids.map((id): MutationOfferOption => {
    const { name, description, upsideText, costText, tags, mark, maxStacks } = MUTATION_DEFINITIONS[id];
    return { id, name, description, upsideText, costText, tags, mark, stacks: stacksOf(id), maxStacks };
  });
  return { dayNumber, options };
}

/** The run's build in first-pick order, one entry per mutation with its stack count. */
export function summarizeMutationBuild(applied: readonly MutationId[]): MutationBuildEntry[] {
  const stacks = new Map<MutationId, number>();
  for (const id of applied) stacks.set(id, (stacks.get(id) ?? 0) + 1);
  return [...stacks].map(([id, count]) => ({ id, name: MUTATION_DEFINITIONS[id].name, stacks: count }));
}
