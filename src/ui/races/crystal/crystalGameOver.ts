// The end of a Crystal Hive run, in its own words.

import type { GameOverStats } from '../../../game/GameManager';
import type { IconName } from '../../console/pixelIcons';

export interface GameOverCopy {
  banner: string;
  title: string;
  subtitle: string;
  rows: Array<{ icon: IconName; label: string; value: number }>;
  /** The Swarm's dawn mutations: crystals do not mutate */
  showMutations: boolean;
}

export function crystalGameOverCopy(stats: GameOverStats): GameOverCopy {
  const victory = stats.outcome === 'victory';
  const subtitle = victory
    ? stats.rivalCoreDestroyed === 'human'
      ? 'La Colmena destruyó el Centro de Mando humano.'
      : 'La Colmena destruyó a la Colmena rival.'
    : 'Sin núcleo no hay colmena.';
  return {
    banner: 'EL CRISTAL PREVALECE',
    title: 'LA COLMENA SE HIZO AÑICOS',
    subtitle,
    rows: [
      { icon: 'sword', label: 'Unidades cristalizadas', value: stats.crystal?.unitsMade ?? 0 },
      { icon: 'upgrade', label: 'Estructuras levantadas', value: stats.crystal?.structuresBuilt ?? 0 },
      { icon: 'shield', label: 'Oleadas repelidas', value: stats.wavesRepelled },
      { icon: 'den', label: 'Guaridas destruidas', value: stats.densDestroyed },
    ],
    showMutations: false,
  };
}
