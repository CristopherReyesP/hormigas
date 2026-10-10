import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameStats } from '../../game/GameManager';
import { TopStrip } from './TopStrip';

const STATS = {
  foodStored: 34,
  mushroomStored: 0,
  meatStored: 0,
  pantryStored: 0,
  pantryCapacity: 450,
  antCount: 13,
  workerCount: 10,
  soldierCount: 0,
  scoutCount: 0,
  nurseCount: 3,
  defenderCount: 0,
  dayPhase: 'day',
  dayNumber: 1,
  phaseRemaining: 90,
  paused: false,
  speed: 1,
  activeEvents: [],
  invasion: { waveNumber: 0, nextWaveIn: 120, active: false, invadersAlive: 0, armed: false },
} as unknown as GameStats;

describe('top strip', () => {
  it('shows the pantry as its own labeled stock, apart from the food totals', () => {
    const html = renderToStaticMarkup(<TopStrip stats={STATS} />);
    expect(html).toMatch(/strip-pantry[^>]*>.*DESPENSA.*0\/450/);
    expect(html).toContain('paga los huevos');
  });

  it('explains that the food totals add up the entrance and the pantry', () => {
    const html = renderToStaticMarkup(<TopStrip stats={STATS} />);
    expect(html).toContain('Hojas: total de la colonia, en la entrada y en la despensa');
  });
});
