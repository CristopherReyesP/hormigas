import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameOverStats } from '../game/GameManager';
import { GameOverScreen } from './GameOverScreen';

const BASE: GameOverStats = {
  outcome: 'victory',
  survivedTicks: 3600,
  antsHatched: 4,
  densDestroyed: 1,
  tilesExcavated: 6,
  wavesRepelled: 2,
  build: [],
};

const noop = () => {};

describe('game over screen', () => {
  it('names the survival path when the colony outlasted the nights', () => {
    const html = renderToStaticMarkup(<GameOverScreen stats={BASE} onRestart={noop} />);
    expect(html).toContain('La colonia sobrevivió');
    expect(html).not.toContain('Colmena de Cristal');
  });

  it('names the offensive path when the colony destroyed the Crystal Hive', () => {
    const html = renderToStaticMarkup(<GameOverScreen stats={{ ...BASE, hiveDestroyed: true }} onRestart={noop} />);
    expect(html).toContain('La colonia destruyó la Colmena de Cristal.');
  });

  it('a Crystal Hive run speaks of its Hive, not of a queen or mutations', () => {
    const lost = renderToStaticMarkup(
      <GameOverScreen stats={{ ...BASE, outcome: 'defeat', playerRace: 'crystal', crystal: { unitsMade: 5, structuresBuilt: 3 } }} onRestart={noop} />,
    );
    expect(lost).toContain('LA COLMENA SE HIZO AÑICOS');
    expect(lost).toContain('Unidades cristalizadas');
    expect(lost).not.toContain('LA REINA HA MUERTO');
    expect(lost).not.toContain('Mutaciones');
    const won = renderToStaticMarkup(
      <GameOverScreen stats={{ ...BASE, playerRace: 'crystal', rivalCoreDestroyed: 'human', crystal: { unitsMade: 5, structuresBuilt: 3 } }} onRestart={noop} />,
    );
    expect(won).toContain('EL CRISTAL PREVALECE');
    expect(won).toContain('La Colmena destruyó el Centro de Mando humano.');
  });
});
