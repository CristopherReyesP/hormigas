import type { RunSetup } from '../run/RunSetup';

/** The tutorial is a Swarm run against wildlife only: no rival base, nothing that wins or loses it early. */
export const TUTORIAL_SETUP: RunSetup = { playerRace: 'swarm', rivalRace: 'wildlife' };

/** The map seed: every tutorial plays on the same calm map. */
export const TUTORIAL_SEED = 0x7a7a1;

/** mulberry32: a small, fast seeded generator in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Run `build` with Math.random seeded, then restore it. The world is
 * generated in the GameManager's constructor from Math.random, so building
 * it inside this gives the same map every time without touching map code.
 */
export function withSeededRandom<T>(seed: number, build: () => T): T {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    return build();
  } finally {
    Math.random = original;
  }
}

/** Build the tutorial's run on its seeded map. */
export function createTutorialGame<T>(build: (setup: RunSetup) => T): T {
  return withSeededRandom(TUTORIAL_SEED, () => build(TUTORIAL_SETUP));
}
