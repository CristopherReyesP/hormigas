/**
 * How many workers the colony keeps mining on its own (P7.1 follow-up).
 *
 * Mining used to depend on a worker happening to see a node while it
 * foraged, so most runs never mined at all. Now the colony allocates miners
 * the way it allocates porters: once a field is discovered (explored ground,
 * not only what is in sight right now) a small baseline works it, and the
 * baseline grows with the workforce. The player can override the number
 * (Mineras: N); ordered miners never count toward it.
 */
import { MINER_BASELINE, MINER_TARGET_MAX, MINER_WORKERS_PER_MINER } from '../../shared/constants';

/** Autonomous miners for a colony of `workers` workers: 2 at the start, one more per 5 workers past 10. */
export function autoMinerTarget(workers: number): number {
  const n = Math.max(0, Math.floor(workers));
  return Math.min(n, Math.max(MINER_BASELINE, Math.floor(n / MINER_WORKERS_PER_MINER)));
}

/** A player-set target, clamped to what the control allows (null = automatic). */
export function clampMinerTarget(target: number | null): number | null {
  if (target === null || !Number.isFinite(target)) return null;
  return Math.max(0, Math.min(MINER_TARGET_MAX, Math.round(target)));
}

/** What the colony has on its fields: every miner, the ones it allocated itself, the ordered ones, and the target. */
export interface MinerStatus {
  /** Every worker bound to a mineral node */
  miners: number;
  /** Miners the colony sent on its own (they count toward the target) */
  autonomous: number;
  /** Workers mining on a player order */
  ordered: number;
  /** Autonomous miners the colony wants */
  target: number;
  /** True while the target follows the workforce (the player has not set one) */
  auto: boolean;
}
