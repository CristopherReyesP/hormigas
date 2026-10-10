// What the end screen says to a Human player: the expedition, its command
// center and its rival, instead of the Swarm's queen and colony.

import type { GameOverStats } from '../../../game/GameManager';

export interface GameOverCopy {
  /** The full-screen banner on a win */
  banner: string;
  /** The big line on a loss */
  defeatTitle: string;
  /** One sentence under it */
  line: string;
}

export function humanGameOverCopy(stats: GameOverStats): GameOverCopy {
  const line = stats.outcome !== 'victory'
    ? 'Sin Centro de Mando no hay expedición.'
    : stats.rivalCoreDestroyed === 'human'
      ? 'La expedición destruyó el Centro de Mando rival.'
      : 'La expedición destruyó la Colmena de Cristal.';
  // Human runs are endless: the only victory is the rival's core falling
  return { banner: 'LA EXPEDICIÓN VENCE', defeatTitle: 'CAYÓ EL CENTRO DE MANDO', line };
}
