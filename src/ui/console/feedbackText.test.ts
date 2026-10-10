import { describe, expect, it, vi } from 'vitest';
import { AntRole } from '../../game/components/components';
import type { CommandFeedback } from '../../game/commandFeedback';
import { HAPTIC_PATTERN, feedbackText, vibrate } from './feedbackText';

const order = (over: Partial<Extract<CommandFeedback, { type: 'order' }>>): CommandFeedback => ({
  type: 'order',
  order: 'move',
  count: 5,
  byRole: { [AntRole.Soldier]: 5 },
  target: null,
  touch: true,
  ...over,
});

describe('order toast', () => {
  it('says who goes and what they do', () => {
    expect(feedbackText(order({ order: 'attack', target: 'den' }))).toBe('5 soldados → atacar guarida');
    expect(feedbackText(order({ order: 'move' }))).toBe('5 soldados → mover');
    expect(feedbackText(order({ order: 'attack-move' }))).toBe('5 soldados → avanzar peleando');
    expect(feedbackText(order({ order: 'rally' }))).toBe('5 soldados → volver al nido');
  });

  it('names the target of an attack', () => {
    expect(feedbackText(order({ order: 'attack', target: 'beetle' }))).toBe('5 soldados → atacar acorazado');
    expect(feedbackText(order({ order: 'attack', target: 'hive' }))).toBe('5 soldados → atacar colmena');
    expect(feedbackText(order({ order: 'attack', target: 'enemy' }))).toBe('5 soldados → atacar enemigo');
  });

  it('uses the singular and mixed groups', () => {
    expect(feedbackText(order({ count: 1, byRole: { [AntRole.Worker]: 1 } }))).toBe('1 obrera → mover');
    expect(feedbackText(order({ count: 4, byRole: { [AntRole.Worker]: 2, [AntRole.Scout]: 2 } }))).toBe('4 hormigas → mover');
  });

  it('a long press says which caste it took', () => {
    expect(feedbackText({ type: 'caste-select', x: 10, y: 20, pixelRatio: 1, count: 6, role: AntRole.Soldier })).toBe('6 soldados en pantalla');
    expect(feedbackText({ type: 'caste-select', x: 10, y: 20, pixelRatio: 1, count: 1, role: AntRole.Scout })).toBe('1 exploradora en pantalla');
  });
});

describe('haptics', () => {
  it('gives attacks a stronger buzz than moves', () => {
    const total = (p: number | readonly number[]) => (Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p);
    expect(total(HAPTIC_PATTERN.attack)).toBeGreaterThan(total(HAPTIC_PATTERN.move));
  });

  it('calls navigator.vibrate when it exists', () => {
    const nav = { vibrate: vi.fn(() => true) };
    expect(vibrate(nav, 20)).toBe(true);
    expect(nav.vibrate).toHaveBeenCalledWith(20);
  });

  it('is a no-op without the API, or when it throws (iOS, desktop, blocked frames)', () => {
    expect(vibrate(undefined, 20)).toBe(false);
    expect(vibrate({}, 20)).toBe(false);
    expect(vibrate({ vibrate: () => { throw new Error('blocked'); } }, 20)).toBe(false);
  });
});
