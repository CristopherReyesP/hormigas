import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NestAlertState } from '../game/run/nestAlert';
import { NestAlert } from './NestAlert';

const QUIET: NestAlertState = { nestInvaders: 0, surfaceInvaders: 0, alert: null, cleared: null, fight: null };
const render = (state: Partial<NestAlertState>, layer: 'surface' | 'underground' = 'surface') =>
  renderToStaticMarkup(<NestAlert state={{ ...QUIET, ...state }} activeLayer={layer} onGoToNest={() => {}} />);

describe('NestAlert', () => {
  it('renders nothing while the nest is quiet', () => {
    expect(render({})).toBe('');
  });

  it('announces the breach with the count and an "Ir al nido" button', () => {
    const html = render({ nestInvaders: 4, alert: { id: 1, kind: 'breach', invaders: 4, queen: null, critical: false } });
    expect(html).toContain('¡Invasores en el nido! (4)');
    expect(html).toMatch(/<button[^>]*class="nest-alert-go"[^>]*>Ir al nido<\/button>/);
  });

  it('shows the queen health when she is attacked, stronger below half', () => {
    const hurt = render({ nestInvaders: 2, alert: { id: 2, kind: 'queen', invaders: 2, queen: { health: 70, max: 100 }, critical: false } });
    expect(hurt).toContain('¡Atacan a la reina!');
    expect(hurt).toContain('Reina: 70/100');
    expect(hurt).not.toContain('nest-alert--critical');
    const critical = render({ nestInvaders: 2, alert: { id: 3, kind: 'queen', invaders: 2, queen: { health: 30, max: 100 }, critical: true } });
    expect(critical).toContain('nest-alert--critical');
    expect(critical).toContain('¡La reina está en peligro!');
  });

  it('warns about the eggs', () => {
    expect(render({ nestInvaders: 1, alert: { id: 4, kind: 'eggs', invaders: 1, queen: null, critical: false } })).toContain('¡Atacan los huevos!');
  });

  it('offers to look at the fight instead when the player is already in the nest', () => {
    const html = render({ nestInvaders: 1, alert: { id: 5, kind: 'breach', invaders: 1, queen: null, critical: false } }, 'underground');
    expect(html).toMatch(/>Ver la pelea<\/button>/);
  });

  it('says the nest is clear', () => {
    expect(render({ cleared: { id: 6 } })).toContain('Nido despejado');
  });
});
