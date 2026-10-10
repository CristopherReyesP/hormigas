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

  it('says how the run was lost, on which night, with a tip', () => {
    const starved = renderToStaticMarkup(
      <GameOverScreen stats={{ ...DEFEAT, cause: { kind: 'starvation', core: 'queen' }, diedOn: { day: 4, phase: 'night' } }} onRestart={noop} />,
    );
    expect(starved).toContain('Noche 4 · </span>La reina murió de hambre');
    expect(starved).toContain('Mantén comida en la despensa para la reina');
    const killed = renderToStaticMarkup(
      <GameOverScreen
        stats={{ ...DEFEAT, cause: { kind: 'invaders', core: 'queen', attackers: [{ name: 'Acorazado', count: 3 }] }, diedOn: { day: 6, phase: 'day' } }}
        onRestart={noop}
      />,
    );
    expect(killed).toContain('Día 6 · </span>La reina cayó ante los invasores (Acorazado ×3)');
    expect(killed).toContain('Construye Espinas en la entrada');
    const human = renderToStaticMarkup(
      <GameOverScreen stats={{ ...DEFEAT, playerRace: 'human', cause: { kind: 'unknown', core: 'command_center' } }} onRestart={noop} />,
    );
    expect(human).toContain('El Centro de mando fue destruido');
    // A victory has no cause of death
    expect(renderToStaticMarkup(<GameOverScreen stats={BASE} onRestart={noop} />)).not.toContain('death-cause');
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
