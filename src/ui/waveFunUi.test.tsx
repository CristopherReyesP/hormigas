import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InvasionInfo, NextWaveIntel } from '../game/systems/UndergroundInvasionSystem';
import { WaveAlert } from './WaveAlert';
import { NextWaveCard } from './NextWaveCard';

const IDLE: InvasionInfo = {
  waveNumber: 2,
  nextWaveIn: 95,
  active: false,
  invadersAlive: 0,
  armed: false,
  waveSize: 6,
  remaining: 0,
  banner: null,
  threats: [],
};

const NEXT: NextWaveIntel = {
  wave: 3,
  total: 6,
  groups: [
    { id: 'young', label: 'Acorazados jóvenes', count: 3 },
    { id: 'beetle', label: 'Acorazados', count: 1 },
    { id: 'drone', label: 'Drones de cristal', count: 1 },
  ],
  elites: [{ affix: 'armored', name: 'Blindado', icon: '⛨', color: '#9fb6d6', count: 1 }],
  boss: { kind: 'prism', name: 'Prisma Guardián', ability: 'Lo protege un escudo enorme.' },
  entrance: { x: 45, y: 1, label: 'centro' },
  surface: { x: 100, y: 10, direction: 'noreste' },
};

const alert = (invasion: Partial<InvasionInfo>) =>
  renderToStaticMarkup(<WaveAlert invasion={{ ...IDLE, ...invasion }} activeLayer="surface" view={null} />);

describe('wave alerts with elites and bosses', () => {
  it('the warning names the elites and the boss coming', () => {
    const html = alert({ nextWaveIn: 20, banner: { id: 1, kind: 'warning', wave: 3, count: 6, elites: 1, bossName: 'Prisma Guardián' } });
    expect(html).toContain('1 élite');
    expect(html).toContain('Prisma Guardián');
  });

  it('a mini-boss arrival gets the big announcement with its ability', () => {
    const html = alert({
      active: true,
      remaining: 6,
      banner: { id: 2, kind: 'arrival', wave: 3, count: 6, bossName: 'Acorazado Colosal', bossAbility: 'Embiste a su presa.' },
    });
    expect(html).toContain('wave-announce--miniboss');
    expect(html).toContain('>Acorazado Colosal<'); // no uppercase: the pixel font lacks accented capitals
    expect(html).toContain('Embiste a su presa.');
  });

  it('shows the boss health bar at the top while it lives', () => {
    const html = alert({ active: true, remaining: 3, boss: { kind: 'colonel', name: 'Coronel en Tanque Pesado', health: 600, maxHealth: 1200, shield: 0, maxShield: 0 } });
    expect(html).toContain('boss-bar');
    expect(html).toContain('Coronel en Tanque Pesado');
    expect(html).toContain('width:50%');
    expect(html).toContain('role="progressbar"');
  });

  it('celebrates a perfect defense with its reward', () => {
    const html = alert({ banner: { id: 3, kind: 'cleared', wave: 2, count: 5, perfect: true, reward: { minerals: 41, food: 32 } } });
    expect(html).toContain('¡Defensa perfecta!');
    expect(html).toContain('+41 minerales');
    expect(html).toContain('+32 comida');
  });

  it('an ordinary clear shows the smaller reward, without the perfect title', () => {
    const html = alert({ banner: { id: 4, kind: 'cleared', wave: 2, count: 5, perfect: false, reward: { minerals: 18, food: 16 } } });
    expect(html).not.toContain('perfecta');
    expect(html).toContain('+18 minerales');
  });

  it('announces a fallen boss and its reward', () => {
    const html = alert({ active: true, remaining: 2, banner: { id: 5, kind: 'bossDown', wave: 3, count: 6, bossName: 'Acorazado Colosal', reward: { minerals: 80, food: 60 } } });
    expect(html).toContain('¡Derrotaste al Acorazado Colosal!');
    expect(html).toContain('+80 minerales');
  });
});

describe('Próxima oleada card', () => {
  const card = (invasion: Partial<InvasionInfo>, open = false) =>
    renderToStaticMarkup(<NextWaveCard invasion={{ ...IDLE, next: NEXT, ...invasion }} defaultOpen={open} />);

  it('folds into a button with the countdown', () => {
    const html = card({});
    expect(html).toContain('Próxima oleada');
    expect(html).toContain('1:35');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Acorazados jóvenes');
  });

  it('opens on the expected mix, the elites, the boss and where it comes from', () => {
    const html = card({}, true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Oleada 3');
    expect(html).toContain('Acorazados jóvenes');
    expect(html).toContain('Drones de cristal');
    expect(html).toContain('Blindado');
    expect(html).toContain('Prisma Guardián');
    expect(html).toContain('entrada centro');
    expect(html).toContain('noreste');
  });

  it('is gone while a wave is on', () => {
    expect(card({ active: true, next: null })).toBe('');
  });
});
