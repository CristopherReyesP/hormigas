import { MUTATION_DEFINITIONS, MUTATION_IDS, type MutationId, type MutationTag } from './MutationDefinitions';

const COMBAT_TAGS: readonly MutationTag[] = ['Assault', 'Defense'];
const CAPSTONE_UNLOCK_TAGS: readonly MutationTag[] = ['Tempo', 'Assault'];
const CAPSTONE_UNLOCK_PICKS = 2;
/** Extra draw weight per tag a candidate shares with the run's picks (base weight is 1). */
const OWNED_TAG_WEIGHT = 1;

function hasTag(id: MutationId, tags: readonly MutationTag[]): boolean {
  return MUTATION_DEFINITIONS[id].tags.some(tag => tags.includes(tag));
}

/** Deterministic LCG; every value is in [0, 1). */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function draw(rng: () => number): number {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(`offerMutations: rng must return a number in [0, 1), got ${value}`);
  }
  return value;
}

function takeWeighted(pool: MutationId[], weight: (id: MutationId) => number, rng: () => number): MutationId {
  const total = pool.reduce((sum, id) => sum + weight(id), 0);
  let roll = draw(rng) * total;
  let index = pool.length - 1;
  for (let i = 0; i < pool.length; i++) {
    roll -= weight(pool[i]);
    if (roll < 0) {
      index = i;
      break;
    }
  }
  return pool.splice(index, 1)[0];
}

/**
 * Build a dawn offer of up to `count` distinct mutations from the run's pick history
 * (`applied`, with repeats, e.g. `RunModifiers.getAppliedMutations()`).
 * Rules: never past maxStacks; the Capstone only after two Tempo/Assault picks; at least
 * one Assault or Defense mutation while one is eligible; tags the run owns weigh more.
 * Contract: `rng` follows Math.random — each call returns a finite number in [0, 1);
 * any other value throws a RangeError. The same seeded rng yields the same offer.
 */
export function offerMutations(rng: () => number, applied: readonly MutationId[], count = 3): MutationId[] {
  const stacks = (id: MutationId) => applied.filter(pick => pick === id).length;
  const ownedTags = new Set(applied.flatMap(id => MUTATION_DEFINITIONS[id].tags));
  const capstoneUnlocked = applied.filter(id => hasTag(id, CAPSTONE_UNLOCK_TAGS)).length >= CAPSTONE_UNLOCK_PICKS;
  const weight = (id: MutationId) =>
    1 + OWNED_TAG_WEIGHT * MUTATION_DEFINITIONS[id].tags.filter(tag => ownedTags.has(tag)).length;

  const pool = MUTATION_IDS.filter(id =>
    stacks(id) < MUTATION_DEFINITIONS[id].maxStacks && (capstoneUnlocked || !hasTag(id, ['Capstone'])));
  const size = Math.min(pool.length, Math.max(0, Math.floor(count)));
  const offer: MutationId[] = [];
  while (offer.length < size) offer.push(takeWeighted(pool, weight, rng));

  const remainingCombat = pool.filter(id => hasTag(id, COMBAT_TAGS));
  if (size > 0 && remainingCombat.length > 0 && !offer.some(id => hasTag(id, COMBAT_TAGS))) {
    offer[size - 1] = takeWeighted(remainingCombat, weight, rng);
  }
  return offer;
}
