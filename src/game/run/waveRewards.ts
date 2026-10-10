// What clearing a night wave and killing a mini-boss pay: pure numbers.

export interface WaveReward {
  minerals: number;
  food: number;
}

/** Killing a mini-boss always pays this, on top of the wave's clear reward */
export const BOSS_REWARD: Readonly<WaveReward> = { minerals: 80, food: 60 };

/**
 * The reward for clearing wave `wave`. A perfect defense (no ant lost while
 * the wave was on) pays about twice an ordinary clear; both grow with the wave.
 */
export function waveClearReward(wave: number, perfect: boolean): WaveReward {
  const n = Math.max(1, Math.floor(Number.isFinite(wave) ? wave : 1));
  return perfect
    ? { minerals: 25 + 8 * n, food: 20 + 6 * n }
    : { minerals: 10 + 4 * n, food: 10 + 3 * n };
}
