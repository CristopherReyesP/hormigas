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
  nightsSurvived: 9,
  bestNight: 14,
  newRecord: false,
};

const DEFEAT: GameOverStats = { ...BASE, outcome: 'defeat' };

const noop = () => {};

describe('game over screen', () => {
  it('names the offensive path when the colony destroyed the Crystal Hive', () => {
    const html = renderToStaticMarkup(<GameOverScreen stats={{ ...BASE, hiveDestroyed: true }} onRestart={noop} onContinue={noop} />);
    expect(html).toContain('La colonia destruyó la Colmena de Cristal.');
  });

  it('names the Human command center when that was the core destroyed', () => {
    const html = renderToStaticMarkup(<GameOverScreen stats={{ ...BASE, rivalCoreDestroyed: 'human' }} onRestart={noop} onContinue={noop} />);
    expect(html).toContain('Centro de Mando humano');
  });

  it('offers both Seguir jugando and Nueva partida on a victory', () => {
    const html = renderToStaticMarkup(<GameOverScreen stats={{ ...BASE, rivalCoreDestroyed: 'crystal' }} onRestart={noop} onContinue={noop} />);
    expect(html).toContain('SEGUIR JUGANDO');
    expect(html).toContain('NUEVA PARTIDA');
    expect(html).not.toContain('sobrevivió 7 noches');
  });

  it('never offers to keep playing once the queen is dead', () => {
    const html = renderToStaticMarkup(<GameOverScreen stats={DEFEAT} onRestart={noop} onContinue={noop} />);
    expect(html).toContain('LA REINA HA MUERTO');
    expect(html).not.toContain('SEGUIR JUGANDO');
    expect(html).toContain('REINTENTAR');
  });

  it('shows the nights survived and the local record', () => {
    const html = renderToStaticMarkup(<GameOverScreen stats={DEFEAT} onRestart={noop} />);
    expect(html).toContain('Noches sobrevividas');
    expect(html).toMatch(/>9</);
    expect(html).toContain('Récord: noche 14');
    expect(html).not.toContain('¡Nuevo récord!');
  });

  it('celebrates a new record', () => {
    const html = renderToStaticMarkup(<GameOverScreen stats={{ ...DEFEAT, nightsSurvived: 15, bestNight: 15, newRecord: true }} onRestart={noop} />);
    expect(html).toContain('¡Nuevo récord!');
    expect(html).toContain('Récord: noche 15');
  });
});
