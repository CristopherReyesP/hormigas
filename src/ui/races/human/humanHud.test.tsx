import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameOverStats, GameStats } from '../../../game/GameManager';
import type { HumanPlayerStats } from '../../../game/races/human/HumanPlayerRun';
import { TopStrip } from '../../console/TopStrip';
import { GameOverScreen } from '../../GameOverScreen';
import { HumanIntroBanner } from './HumanIntroBanner';
import { HumanBaseSummary } from './HumanInfo';

const HUMAN: HumanPlayerStats = {
  rations: 180,
  minerals: 95,
  supply: 6,
  supplyCap: 6,
  income: 2.5,
  units: { builder: 3, soldier: 4, marksman: 1, tank: 0 },
  idleBuilders: 1,
  selectedBuilders: 0,
  selectedUnits: 0,
  placing: null,
  selected: null,
  group: null,
  intro: null,
};

const STATS = {
  foodStored: 0,
  mushroomStored: 0,
  meatStored: 0,
  pantryStored: 0,
  pantryCapacity: 0,
  mineralsStored: 95,
  antCount: 0,
  workerCount: 0,
  soldierCount: 0,
  scoutCount: 0,
  nurseCount: 0,
  defenderCount: 0,
  dayPhase: 'day',
  dayNumber: 2,
  phaseRemaining: 90,
  paused: false,
  speed: 1,
  activeEvents: [],
  invasion: { waveNumber: 1, nextWaveIn: 120, active: false, invadersAlive: 0, armed: false },
  human: HUMAN,
} as unknown as GameStats;

describe('the Human HUD', () => {
  it('the top strip shows rations, minerals and supply, and none of the Swarm stocks', () => {
    const html = renderToStaticMarkup(<TopStrip stats={STATS} />);
    expect(html).toContain('Raciones');
    expect(html).toContain('180');
    expect(html).toContain('Minerales');
    expect(html).toContain('95');
    expect(html).toMatch(/Suministro[^]*6\/6/);
    expect(html).toContain('strip-supply--full');
    expect(html).not.toContain('DESPENSA');
    expect(html).not.toContain('Hojas');
    expect(html).not.toContain('Obreras');
    // The clock and the waves stay
    expect(html).toContain('DÍA');
    expect(html).toContain('OLEADA 2');
  });

  it('the base summary counts the troops and warns about idle builders and the supply cap', () => {
    const html = renderToStaticMarkup(<HumanBaseSummary human={HUMAN} stats={STATS} />);
    expect(html).toContain('EXPEDICIÓN');
    expect(html).toContain('Soldados');
    expect(html).toContain('Constructores');
    expect(html).toMatch(/ocioso/);
    expect(html).toMatch(/depósito de suministros/);
  });

  it('the landing banner shows the expedition line', () => {
    const html = renderToStaticMarkup(<HumanIntroBanner title="LA EXPEDICIÓN ATERRIZA" />);
    expect(html).toContain('LA EXPEDICIÓN ATERRIZA');
  });

  it('the end screen speaks for the expedition, not for the queen', () => {
    const base: GameOverStats = {
      outcome: 'defeat', survivedTicks: 3600, antsHatched: 0, densDestroyed: 1, tilesExcavated: 0, wavesRepelled: 2, build: [], playerRace: 'human',
    };
    const defeat = renderToStaticMarkup(<GameOverScreen stats={base} onRestart={() => {}} />);
    expect(defeat).toContain('CAYÓ EL CENTRO DE MANDO');
    expect(defeat).not.toContain('REINA');
    expect(defeat).not.toContain('Hormigas nacidas');
    const win = renderToStaticMarkup(<GameOverScreen stats={{ ...base, outcome: 'victory', rivalCoreDestroyed: 'human' }} onRestart={() => {}} />);
    expect(win).toContain('LA EXPEDICIÓN VENCE');
    expect(win).toContain('La expedición destruyó el Centro de Mando rival.');
    expect(win).not.toMatch(/noches/);
    const crush = renderToStaticMarkup(
      <GameOverScreen stats={{ ...base, outcome: 'victory', rivalCoreDestroyed: 'crystal', hiveDestroyed: true }} onRestart={() => {}} />,
    );
    expect(crush).toContain('La expedición destruyó la Colmena de Cristal.');
  });
});
