/**
 * Evolutions are earned in battle: every enemy the colony kills feeds the
 * swarm, and each time the tally crosses the next mark the evolution chamber
 * opens. Each evolution costs EVOLUTION_KILLS_STEP more kills than the one
 * before: 4, 8, 12, 16… (4, 12, 24, 40… in total), which keeps about one per
 * night wave early on (4, 6, 8, 14, 18… enemies) and slows the snowball later.
 */
export const EVOLUTION_FIRST_KILLS = 4;
export const EVOLUTION_KILLS_STEP = 4;

/** Kills one evolution costs, `earned` evolutions in (0 = the first) */
export function killsForNextEvolution(earned: number): number {
  return EVOLUTION_FIRST_KILLS + EVOLUTION_KILLS_STEP * Math.max(0, earned);
}

/** Total kills the run needs for evolution number `earned + 1` */
export function killMarkForEvolution(earned: number): number {
  const n = Math.max(0, earned) + 1;
  return EVOLUTION_FIRST_KILLS * n + (EVOLUTION_KILLS_STEP * n * (n - 1)) / 2;
}

export interface EvolutionProgress {
  /** Kills toward the next evolution */
  kills: number;
  /** Kills that evolution needs */
  needed: number;
}

/** Progress toward the next evolution, for the HUD */
export function evolutionProgress(totalKills: number, earned: number): EvolutionProgress {
  const needed = killsForNextEvolution(earned);
  const previousMark = earned > 0 ? killMarkForEvolution(earned - 1) : 0;
  return { kills: Math.max(0, Math.min(needed, totalKills - previousMark)), needed };
}

/** True when the kill tally reached the next mark */
export function evolutionDue(totalKills: number, earned: number): boolean {
  return totalKills >= killMarkForEvolution(earned);
}
