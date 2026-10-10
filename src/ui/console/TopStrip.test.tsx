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
  mineralsStored: 25,
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

  it('shows the food still at the entrance next to the pantry, since only the pantry pays for eggs', () => {
    const html = renderToStaticMarkup(<TopStrip stats={{ ...STATS, entranceFoodStored: 34 }} />);
    expect(html).toMatch(/strip-pantry[^>]*>.*0\/450.*\+34 en la entrada/);
    expect(html).toContain('Hay 34 más en la entrada: las obreras la bajan a la despensa.');
    expect(html).toContain('Los huevos se pagan solo con la despensa.');
  });

  it('hides the entrance note once everything is down in the pantry', () => {
    const html = renderToStaticMarkup(<TopStrip stats={{ ...STATS, entranceFoodStored: 0 }} />);
    expect(html).not.toContain('en la entrada</span>');
  });

  it('keeps counting down to the attack once the wave is telegraphed', () => {
    const armed = { ...STATS, invasion: { waveNumber: 0, nextWaveIn: 45, active: false, invadersAlive: 0, armed: true } } as GameStats;
    const html = renderToStaticMarkup(<TopStrip stats={armed} />);
    expect(html).toContain('OLEADA 1 EN 0:45');
    expect(html).toMatch(/strip-item--danger[^>]*title="La oleada llega al anochecer"/);
  });

  it('shows the minerals bank apart from the food, as the currency for structures', () => {
    const html = renderToStaticMarkup(<TopStrip stats={STATS} />);
    expect(html).toMatch(/strip-minerals[^>]*>.*25/);
    expect(html).toContain('Minerales');
  });

  it('ends with the speaker toggle', () => {
    const html = renderToStaticMarkup(<TopStrip stats={STATS} />);
    expect(html).toMatch(/strip-group--right[\s\S]*strip-sound-toggle/);
    expect(html).toContain('Clic: ');
  });

  it('folds the secondary readouts into a drawer that a tap opens on phones', () => {
    const html = renderToStaticMarkup(<TopStrip stats={STATS} />);
    expect(html).toMatch(/<button[^>]*class="strip-more"[^>]*aria-expanded="false"[^>]*aria-label="Más datos"/);
    // Each readout is tagged, so the compact layout can pick what stays on the thin strip
    expect(html).toContain('strip-food--leaf');
    expect(html).toContain('strip-food--fungus');
    expect(html).toContain('strip-food--meat');
    expect(html).toContain('strip-day');
  });
});
