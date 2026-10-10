import { RUN_NIGHTS_TO_WIN } from '../../shared/constants';
import type { DayPhase } from '../systems/DayNightSystem';

export type RunOutcome = 'victory' | 'defeat';

/**
 * Resolve after all systems update so queen death takes precedence at dawn.
 * Two ways to win: survive the final night, or destroy the Crystal Hive.
 */
export function resolveRunOutcome(
  currentOutcome: RunOutcome | null,
  queenAlive: boolean,
  previousPhase: DayPhase,
  phase: DayPhase,
  dayNumber: number,
  hiveDestroyed = false,
): RunOutcome | null {
  if (currentOutcome) return currentOutcome;
  if (!queenAlive) return 'defeat';
  if (hiveDestroyed) return 'victory';
  if (previousPhase === 'night' && phase === 'day' && dayNumber >= RUN_NIGHTS_TO_WIN + 1) {
    return 'victory';
  }
  return null;
}
