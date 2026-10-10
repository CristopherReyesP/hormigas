// Random number streams whose state a save can write and read back.

/** A `() => number` in [0, 1) that can report and restore its internal state. */
export interface StatefulRng {
  (): number;
  getState(): number;
  setState(state: number): void;
}

/**
 * The same LCG as `createSeededRng` (MutationOffers), so the dawn offers draw
 * exactly as before, but with its state reachable: a save writes it and a
 * load restores it, so the next offer is the one the old run would have made.
 */
export function createStatefulLcg(seed: number): StatefulRng {
  let state = seed >>> 0;
  const rng = (() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  }) as StatefulRng;
  rng.getState = () => state;
  rng.setState = (next: number) => {
    state = next >>> 0;
  };
  return rng;
}

/** The engine's own Math.random, captured before anything can replace it */
const nativeRandom = Math.random;

/**
 * The simulation's random stream. Every system draws from Math.random; while
 * the World ticks inside `run`, Math.random is this seeded stream
 * (mulberry32), so a run's ticks depend only on its state and the seed, and a
 * loaded save continues exactly as the saved run would have. Render-time
 * randomness (particles, VFX) runs outside `run` and keeps the native one.
 *
 * If something else already replaced Math.random (a test spy), it is left in
 * place: the stream only swaps out the native function.
 */
export class SimRandom {
  /** mulberry32 state; written to saves like any other field */
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  run<T>(fn: () => T): T {
    if (Math.random !== nativeRandom) return fn();
    Math.random = this.draw;
    try {
      return fn();
    } finally {
      Math.random = nativeRandom;
    }
  }

  private readonly draw = (): number => this.next();
}
