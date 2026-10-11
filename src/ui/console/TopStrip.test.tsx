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

/** The words a player reads, without the markup */
const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('top strip', () => {
  it('shows the pantry as its own labeled stock, apart from the food totals', () => {
    const html = renderToStaticMarkup(<TopStrip stats={STATS} />);
    expect(html).toMatch(/strip-pantry[^>]*>.*DESPENSA.*0\/450/);
    expect(html).toContain('paga los huevos');
  });

  // Player report: "arriba se ven muchos recursos pero en la despensa nada".
  // The big numbers added the entrance pile to the pantry; now they are the
  // pantry, and the food on its way shows apart, smaller.
  it('shows the pantry in the big food numbers, the same food that pays for eggs', () => {
    const stats = { ...STATS, foodStored: 120, mushroomStored: 40, meatStored: 20, pantryStored: 120 } as GameStats;
    const html = renderToStaticMarkup(<TopStrip stats={stats} />);
    expect(html).toMatch(/strip-food--leaf[^>]*>.*?<span class="strip-value[^"]*">60</);
    expect(html).toMatch(/strip-food--fungus[^>]*>.*?<span class="strip-value[^"]*">40</);
    expect(html).toMatch(/strip-food--meat[^>]*>.*?<span class="strip-value[^"]*">20</);
    expect(html).toContain('Hojas en la despensa: pagan los huevos.');
    expect(html).not.toContain('en la entrada y en la despensa');
  });

  it('shows the food on its way apart and smaller, next to the pantry', () => {
    const html = renderToStaticMarkup(<TopStrip stats={{ ...STATS, entranceFoodStored: 34, foodInTransit: 49 }} />);
    expect(html).toMatch(/strip-pantry[^>]*>.*0\/450.*<span class="strip-pantry-incoming">\+49 en camino<\/span>/);
    expect(html).toContain('Hay 49 en camino: 34 en la entrada y 15 en la boca de las obreras.');
    expect(html).not.toContain('+34');
  });

  it('hides the note once everything is down in the pantry', () => {
    const html = renderToStaticMarkup(<TopStrip stats={{ ...STATS, entranceFoodStored: 0, foodInTransit: 0 }} />);
    expect(html).not.toContain('en camino');
  });

  it('says plainly when the pantry is full and points to the Almacén tool', () => {
    const full = { ...STATS, pantryStored: 450, foodStored: 450, pantryFull: true, foodInTransit: 300, entranceFoodStored: 300 } as GameStats;
    const html = renderToStaticMarkup(<TopStrip stats={full} />);
    expect(html).toMatch(/<span class="strip-pantry-full"[^>]*>.*\+300 en camino.*<span>Despensa llena: marca más casillas de Almacén \([A-Z]\)<\/span>/);
    expect(html).toMatch(/strip-pantry strip-pantry--full/);

    const roomy = renderToStaticMarkup(<TopStrip stats={{ ...STATS, pantryFull: false }} />);
    expect(roomy).not.toContain('Despensa llena');
  });

  it('counts the workers waiting with their loads in the full-pantry callout', () => {
    const full = { ...STATS, pantryStored: 450, foodStored: 450, pantryFull: true, foodInTransit: 120, entranceFoodStored: 0, antsWaitingForPantry: 6 } as GameStats;
    const html = renderToStaticMarkup(<TopStrip stats={full} />);
    expect(html).toMatch(/<span class="strip-pantry-full"[^>]*>.*\+120 en camino.*6 obreras esperando.*Despensa llena: marca más casillas de Almacén/);
    expect(html).toContain('6 obreras esperan con la comida');

    const one = renderToStaticMarkup(<TopStrip stats={{ ...full, antsWaitingForPantry: 1 }} />);
    expect(one).toContain('1 obrera esperando');
    const none = renderToStaticMarkup(<TopStrip stats={{ ...full, antsWaitingForPantry: 0 }} />);
    expect(none).not.toContain('esperando');
  });

  it('keeps counting down to the attack once the wave is telegraphed', () => {
    const armed = { ...STATS, invasion: { waveNumber: 0, nextWaveIn: 45, active: false, invadersAlive: 0, armed: true } } as GameStats;
    const html = renderToStaticMarkup(<TopStrip stats={armed} />);
    expect(text(html)).toContain('OLEADA 1 EN 0:45');
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

  it('keeps the words of the wave countdown apart, so a narrow strip can keep just the clock', () => {
    const soon = { ...STATS, invasion: { ...STATS.invasion, waveNumber: 2, nextWaveIn: 45 } } as GameStats;
    const html = renderToStaticMarkup(<TopStrip stats={soon} />);
    expect(html).toMatch(/class="strip-item strip-wave[ "]/);
    expect(html).toContain('<span class="strip-wave-word">OLEADA 3 EN </span>0:45');
    const folded = html.replace(/<span class="strip-wave-word">[^<]*<\/span>/g, '');
    expect(folded).toMatch(/strip-wave-text">0:45<\/span>/);
  });

  it('keeps the invaders count when a narrow strip folds the words of a wave on', () => {
    const on = { ...STATS, invasion: { ...STATS.invasion, waveNumber: 4, active: true, invadersAlive: 9 } } as GameStats;
    const html = renderToStaticMarkup(<TopStrip stats={on} />);
    expect(text(html)).toContain('¡OLEADA 4! 9 INVASORES');
    const folded = html.replace(/<span class="strip-wave-word">[^<]*<\/span>/g, '');
    expect(text(folded)).not.toMatch(/OLEADA|INVASORES/);
    expect(folded).toMatch(/strip-wave-text">9<\/span>/);
  });

  it('keeps an event name apart from its clock, and names it in the tooltip, so a narrow strip can show just the star and the time', () => {
    const rain = { ...STATS, activeEvents: [{ icon: '🌧️', name: '🌧️ Lluvia torrencial', remaining: 95 }] } as GameStats;
    const html = renderToStaticMarkup(<TopStrip stats={rain} />);
    expect(html).toMatch(/strip-item--event" title="Evento activo: Lluvia torrencial"/);
    expect(html).toContain('<span class="strip-event-name">LLUVIA TORRENCIAL </span>1:35');
  });

  it('tags a full pantry on the strip itself; the long message waits in the drawer and the banner column', () => {
    const html = renderToStaticMarkup(<TopStrip stats={{ ...STATS, pantryFull: true, pantryStored: 450 } as GameStats} />);
    expect(html).toMatch(/strip-pantry--full[\s\S]*strip-pantry-full-short[^>]*>LLENA</);
    // Not a second live region: the banner column (PantryFullNote) announces it
    expect(html).not.toMatch(/strip-pantry-full"[^>]*role="status"/);
  });

  it('puts the Más datos button at the end of the right group, so the readouts never run under it', () => {
    const html = renderToStaticMarkup(<TopStrip stats={STATS} />);
    expect(html).toMatch(/strip-group--right[\s\S]*class="strip-more"[\s\S]*<\/button><\/div><\/header>$/);
  });
});
