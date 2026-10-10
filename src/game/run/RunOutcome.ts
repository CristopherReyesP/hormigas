export type RunOutcome = 'victory' | 'defeat';

/**
 * The run is endless: surviving nights never ends it (nightMilestones.ts
 * celebrates them instead). Resolve after all systems update, so the queen's
 * death takes precedence over the rival core falling on the same tick.
 * - The queen dies: defeat.
 * - The rival core is destroyed: victory (the player may keep playing).
 */
export function resolveRunOutcome(
  currentOutcome: RunOutcome | null,
  queenAlive: boolean,
  coreDestroyed = false,
): RunOutcome | null {
  if (currentOutcome) return currentOutcome;
  if (!queenAlive) return 'defeat';
  if (coreDestroyed) return 'victory';
  return null;
}
