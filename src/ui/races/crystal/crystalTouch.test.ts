import { describe, expect, it } from 'vitest';
import { AntRole } from '../../../game/components/components';
import { feedbackText } from '../../console/feedbackText';
import { touchHint } from '../../console/touchHint';

const BASE = { activeLayer: 'surface' as const, selectedEntity: null, buildMode: null, touch: true };

describe('the phone HUD speaks of crystals, not ants, for a Crystal player', () => {
  it('order toasts name drones and centinelas, and Volver a la colmena', () => {
    const order = (byCrystal: Record<string, number>, order: 'attack-move' | 'rally' = 'attack-move') =>
      feedbackText({ type: 'order', order, count: Object.values(byCrystal).reduce((a, b) => a + b, 0), byRole: {}, byCrystal, target: null, touch: true });
    expect(order({ drone: 2 })).toBe('2 drones → avanzar peleando');
    expect(order({ sentinel: 1 })).toBe('1 centinela → avanzar peleando');
    expect(order({ drone: 2, sentinel: 1 })).toBe('3 unidades → avanzar peleando');
    expect(order({ drone: 2 }, 'rally')).toBe('2 drones → volver a la colmena');
    expect(feedbackText({ type: 'caste-select', x: 0, y: 0, pixelRatio: 1, count: 3, role: AntRole.Soldier, crystalKind: 'drone' })).toBe('3 drones en pantalla');
  });

  it('the hint line counts the selected crystals and tells what a tap does', () => {
    const hint = touchHint({ ...BASE, crystal: { selectedKinds: { drones: 2, sentinels: 0 } } });
    expect(hint).toMatchObject({ mode: 'order', selection: '2 drones elegidos' });
    expect(touchHint({ ...BASE, crystal: { selectedKinds: { drones: 1, sentinels: 2 } } }).selection).toBe('3 unidades elegidas');
    const idle = touchHint({ ...BASE, crystal: { selectedKinds: { drones: 0, sentinels: 0 } } });
    expect(idle.text).not.toContain('hormiga');
  });
});
