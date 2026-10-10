// What the end screen says to a Human player: the expedition, its command
// center and its rival, instead of the Swarm's queen and colony.

import type { GameOverStats } from '../../../game/GameManager';
import { RUN_NIGHTS_TO_WIN } from '../../../shared/constants';

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
      : stats.hiveDestroyed || stats.rivalCoreDestroyed === 'crystal'
        ? 'La expedición destruyó la Colmena de Cristal.'
        : `La expedición sobrevivió ${RUN_NIGHTS_TO_WIN} noches.`;
  return { banner: 'LA EXPEDICIÓN RESISTE', defeatTitle: 'CAYÓ EL CENTRO DE MANDO', line };
}
