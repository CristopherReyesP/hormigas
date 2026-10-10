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
});
