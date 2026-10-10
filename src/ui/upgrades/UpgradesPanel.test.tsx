import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyUpgradeLevels } from '../../game/upgrades/upgradeLevels';
import { upgradeInfos } from '../../game/upgrades/upgradeView';
import { buildColonyStats } from '../../game/upgrades/colonyStats';
import { World } from '../../engine/ecs/World';
import { createAnt, createQueen } from '../../game/entities/factories';
import { UpgradesPanel } from './UpgradesPanel';
import { UpgradesButton } from './UpgradesButton';
import { affordableIn, effectText, missingText, upgradeBadge } from './upgradeUi';

const funds = { food: 45, mushrooms: 0, minerals: 0 };
const noop = () => false;

function panel(tab: Parameters<typeof UpgradesPanel>[0]['initialTab'], touch = false) {
  const world = new World();
  createAnt(world, 1, 1);
  createQueen(world, 5, 5);
  return renderToStaticMarkup(
    <UpgradesPanel
      upgrades={upgradeInfos(emptyUpgradeLevels(), funds)}
      report={buildColonyStats(world, { food: 45, mushrooms: 0, day: 2, nightsSurvived: 1 })}
      funds={funds}
      initialTab={tab}
      touch={touch}
      onBuy={noop}
      onClose={() => {}}
      now={() => 0}
    />,
  );
}

describe('Mejoras panel', () => {
  it('shows the queen tab with level, price and the effect as numbers', () => {
    const html = panel('queen');
    expect(html).toContain('MEJORAS');
    for (const label of ['Reina', 'Incubación', 'Castas', 'Colonia', 'Estadísticas']) expect(html).toContain(label);
    expect(html).toContain('Puesta veloz');
    expect(html).toContain('Puesta: <strong>3.0 s</strong> <span class="upg-arrow" aria-label="pasa a">→</span> <strong class="upg-next">2.6 s</strong>');
    expect(html).toContain('aria-label="Nivel 0 de 4"');
    // 45 food pays Puesta veloz (40) but not Coraza real (50 + 10 minerals)
    expect(html).toMatch(/data-upgrade="queenLay"[^>]*>/);
    expect(html).toMatch(/class="upg-card upg-card--ready"[^>]*data-upgrade="queenLay"/);
    expect(html).toMatch(/class="upg-card"[^>]*data-upgrade="queenHp"/);
    expect(html).toContain('upg-cost upg-cost--short');
  });

  it('asks for a selection before buying: no Mejorar button until a line is picked', () => {
    expect(panel('brood')).not.toContain('MEJORAR</button>');
    expect(panel('brood')).toContain('luego pulsa Mejorar (o haz doble clic)');
    expect(panel('brood', true)).toContain('Toca una mejora');
    expect(panel('brood')).toContain('Huevos por casilla: <strong>4</strong> <span class="upg-arrow" aria-label="pasa a">→</span> <strong class="upg-next">5</strong>');
  });

  it('renders the Estadísticas tab', () => {
    const html = panel('stats');
    expect(html).toContain('Población');
    expect(html).toContain('Noches sobrevividas');
    expect(html).toContain('Enemigos derrotados');
    expect(html).toContain('Hormigas perdidas');
    expect(html).toContain('Huevos por minuto (máx.)');
    expect(html).toContain('Obreras');
    expect(html).not.toContain('upg-confirm');
  });
});

describe('Mejoras button and helpers', () => {
  it('glows with a badge only when something is affordable', () => {
    expect(upgradeBadge(0)).toEqual({ glow: false, text: null });
    expect(upgradeBadge(4)).toEqual({ glow: true, text: '4' });
    const idle = renderToStaticMarkup(<UpgradesButton affordable={0} onOpen={() => {}} />);
    expect(idle).toContain('class="upg-launch"');
    expect(idle).toContain('MEJORAS');
    const ready = renderToStaticMarkup(<UpgradesButton affordable={2} onOpen={() => {}} />);
    expect(ready).toContain('upg-launch upg-launch--ready');
    expect(ready).toContain('<span class="upg-launch-badge">2</span>');
  });

  it('counts affordable lines per tab and words what is missing', () => {
    const infos = upgradeInfos(emptyUpgradeLevels(), funds);
    expect(affordableIn(infos, 'queen')).toBe(2); // Puesta veloz, Cola de huevos
    expect(affordableIn(infos, 'stats')).toBe(0);
    expect(missingText({ food: 20, minerals: 15, mushrooms: 0 })).toBe('Faltan 20 de comida y 15 minerales');
    expect(missingText({ food: 0, minerals: 0, mushrooms: 0 })).toBeNull();
    expect(effectText({ label: 'Puesta', now: '3.0 s', next: '2.6 s' })).toBe('Puesta: 3.0 s → 2.6 s');
  });
});
