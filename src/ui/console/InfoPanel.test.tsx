import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BroodSnapshot, GameStats } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import { InfoPanel } from './InfoPanel';
import { infoSummary } from './infoSummary';
import type { ColonyDetails } from './useColonyDetails';

const BROOD: BroodSnapshot = {
  pantry: { stored: 0, capacity: 450, tiles: 9 },
  surfaceStock: 34,
  hasQueen: true,
  queenCanLay: true,
  queue: [],
  maxQueuedPerRole: 5,
  eggs: [],
  incubation: { tiles: 6, freeSlots: 24 },
  nurses: 3,
  costs: {
    [AntRole.Worker]: 20,
    [AntRole.Soldier]: 35,
    [AntRole.Scout]: 25,
    [AntRole.Nurse]: 15,
    [AntRole.Defender]: 30,
  },
};

const DETAILS: ColonyDetails = {
  food: { total: 0, leaves: 0, mushrooms: 0, meat: 0 },
  queen: { health: 500, maxHealth: 500, hunger: 900, maxHunger: 1000, isLaying: false },
  brood: BROOD,
  farm: { tiles: 0, rate: 0, status: 'sin-tiles', stored: 0, capacity: 0 },
  eatFirst: 'leaf',
  garrison: { target: 2, current: 1 },
  upgrades: [],
  storageTiles: 9,
};

const STATS = {
  antCount: 13,
  workerCount: 10,
  soldierCount: 0,
  scoutCount: 0,
  nurseCount: 3,
  defenderCount: 0,
  foodStored: 34,
  mushroomStored: 0,
  meatStored: 0,
  pantryStored: 0,
  pantryCapacity: 450,
  beetleCount: 0,
  beetleDenCount: 2,
  cricketCount: 0,
  cricketDenCount: 0,
  activeLayer: 'surface',
  selectedEntity: null,
  invasion: { waveNumber: 0, nextWaveIn: 120, active: false, invadersAlive: 0, armed: false },
} as unknown as GameStats;

function render(stats: GameStats = STATS): string {
  return renderToStaticMarkup(
    <InfoPanel stats={stats} details={DETAILS} gameManager={null} attackCount={10} onAttackCountChange={() => {}} />,
  );
}

describe('info panel default views', () => {
  it('shows the brood pipeline on the surface without selecting the nest', () => {
    const html = render();
    expect(html).toContain('ENJAMBRE');
    expect(html).toContain('CRÍA');
    expect(html).toContain('DESPENSA');
    expect(html).toContain('Despensa vacía: las obreras deben bajar comida (34 en la entrada)');
  });

  it('labels the food at the entrance apart from the pantry that pays for eggs', () => {
    const html = render();
    expect(html).toMatch(/En la entrada.*34/);
    expect(html).toMatch(/Despensa.*0\/450/);
    expect(html).toContain('Las obreras bajan la comida a la despensa');
  });

  it('shows the same brood pipeline in the nest view', () => {
    const html = render({ ...STATS, activeLayer: 'underground' } as GameStats);
    expect(html).toContain('REINA');
    expect(html).toContain('INCUBANDO');
    expect(html).toContain('Despensa vacía');
  });
});

describe('threats column wave countdown', () => {
  it('counts down to the real attack while the wave is telegraphed', () => {
    const armed = { ...STATS, invasion: { waveNumber: 1, nextWaveIn: 45, active: false, invadersAlive: 0, armed: true } } as GameStats;
    expect(render(armed)).toContain('La oleada 2 llega al anochecer, en 0:45');
  });

  it('shows the countdown before the wave is telegraphed', () => {
    expect(render()).toContain('Oleada 1 en 2:00');
  });

  it('says where the wave is: on its way across the surface, then inside the nest', () => {
    const on = (layer: 'surface' | 'underground') =>
      ({ ...STATS, invasion: { waveNumber: 2, nextWaveIn: 0, active: true, invadersAlive: 5, armed: false, threats: [{ x: 10, y: 10, layer }] } }) as GameStats;
    expect(render(on('surface'))).toContain('¡Oleada 2 en camino! 5 invasores en la superficie');
    expect(render(on('underground'))).toContain('¡Oleada 2 en el nido! 5 invasores');
  });
});

describe('alien leapers (the cricket) are called Saltador in the UI', () => {
  it('counts them as Saltadores in the threats column', () => {
    const html = render({ ...STATS, cricketCount: 2 } as GameStats);
    expect(html).toContain('Saltadores');
    expect(html).not.toMatch(/grillo/i);
  });

  it('names a selected leaper and its den Saltador', () => {
    const leaper = render({
      ...STATS,
      selectedEntity: {
        entityId: 9, type: 'cricket', position: { x: 4, y: 4 },
        cricketState: 'going_to_nest', cricketHealth: { current: 300, max: 600 },
      },
    } as GameStats);
    expect(leaper).toContain('SALTADOR');
    expect(leaper).not.toMatch(/grillo/i);
    const den = render({
      ...STATS,
      selectedEntity: {
        entityId: 10, type: 'cricket_den', position: { x: 4, y: 4 },
        cricketDenHealth: { current: 600, max: 600 }, cricketDenActiveCrickets: 1,
      },
    } as GameStats);
    expect(den).toMatch(/guarida de saltadores/i);
    expect(den).toContain('Saltadores activos');
    expect(den).not.toMatch(/grillo/i);
  });
});

describe('the Crystal Hive card', () => {
  it('names the hive, shows its health and the attack wave stepper, like a den', () => {
    const html = render({
      ...STATS,
      availableSoldiers: 6,
      selectedEntity: {
        entityId: 12, type: 'crystal_hive', position: { x: 20, y: 30 },
        hiveHealth: { current: 1200, max: 1500 },
      },
    } as GameStats);
    expect(html).toContain('COLMENA DE CRISTAL');
    expect(html).toContain('Vida');
    expect(html).toContain('1200');
    expect(html).toContain('OLEADA DE ATAQUE');
    expect(html).toContain('Atacar colmena (A)');
  });
});

describe('compact info bar (phones)', () => {
  it('sums the panel up in one line that a tap expands', () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*class="info-toggle"[^>]*aria-expanded="false"/);
    expect(html).toContain('ENJAMBRE · 13 · AMENAZAS · 0');
  });

  it('sums up a group, a single selection and the nest', () => {
    const group = {
      ...STATS,
      selectedGroup: { count: 7, ordered: 7, byRole: { [AntRole.Worker]: 7 }, units: [] },
    } as unknown as GameStats;
    expect(infoSummary(group, DETAILS)).toBe('GRUPO · 7 · 7 EN MARCHA');
    const leaper = {
      ...STATS,
      selectedEntity: { entityId: 9, type: 'cricket', position: { x: 4, y: 4 }, cricketHealth: { current: 300, max: 600 } },
    } as GameStats;
    expect(infoSummary(leaper, DETAILS)).toBe('SALTADOR · VIDA 300/600');
    expect(infoSummary({ ...STATS, activeLayer: 'underground' } as GameStats, DETAILS)).toBe('NIDO · REINA 500/500 · DESPENSA 0');
    expect(infoSummary({ ...STATS, activeLayer: 'underground' } as GameStats, { ...DETAILS, queen: null })).toBe('NIDO · SIN REINA · DESPENSA 0');
  });

  it('keeps the deselect button on the bar while something is selected', () => {
    const html = render({
      ...STATS,
      selectedEntity: { entityId: 9, type: 'cricket', position: { x: 4, y: 4 }, cricketHealth: { current: 300, max: 600 } },
    } as GameStats);
    expect(html).toMatch(/info-summary[\s\S]*info-summary-close[^>]*aria-label="Quitar selección"/);
    expect(render()).not.toContain('info-summary-close');
  });
});
