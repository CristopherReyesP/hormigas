import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BroodSnapshot } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import { deriveBroodPipeline, type BroodKeys } from './brood';
import { BroodReadout } from './BroodReadout';

const KEYS: BroodKeys = { breed: ['A', 'S', 'D', 'F', 'G'], incubation: 'W', storage: 'U' };

const BASE: BroodSnapshot = {
  pantry: { stored: 60, capacity: 450, tiles: 9 },
  surfaceStock: 0,
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
    [AntRole.Bomber]: 25,
  },
};

function render(overrides: Partial<BroodSnapshot> = {}): string {
  return renderToStaticMarkup(<BroodReadout pipeline={deriveBroodPipeline({ ...BASE, ...overrides }, KEYS)} />);
}

describe('brood readout', () => {
  it('draws the pipeline as four labeled stages with their counts', () => {
    const html = render();
    expect(html).toContain('CRÍA');
    const order = ['DESPENSA', 'REINA', 'INCUBANDO', 'NACE'].map((label) => html.indexOf(label));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('brood-stage--ok');
  });

  it('prints the blocking reason as visible text, not only in a tooltip', () => {
    const html = render({ pantry: { stored: 0, capacity: 450, tiles: 9 }, surfaceStock: 34 });
    expect(html).toContain('brood-stage--blocked');
    expect(html).toMatch(/<div class="brood-status brood-status--blocked"[^>]*>.*Despensa vacía: las obreras deben bajar comida \(34 en la entrada\)/);
  });

  it('flags how many more problems hide behind the headline', () => {
    const html = render({ pantry: { stored: 0, capacity: 450, tiles: 9 }, nurses: 0 });
    expect(html).toContain('+1');
  });

  it('shows each egg with its caste icon, a progress bar and the time left', () => {
    const egg = { role: AntRole.Soldier, progress: 0.25, fedProgress: 1, remaining: 42, incubating: true };
    const html = render({ eggs: [egg] });
    expect(html).toContain('brood-egg brood-egg--incubating');
    expect(html).toContain('title="Soldado: nace en 0:42"');
    expect(html).toContain('width:25%');
    expect(html).toContain('0:42');
    expect(html).toContain('<svg');
  });

  it('counts the eggs that do not fit', () => {
    const eggs = [5, 6, 7, 8].map((remaining) => ({ role: AntRole.Worker, progress: 0.5, fedProgress: 1, remaining, incubating: true }));
    expect(render({ eggs })).toContain('+1 más');
  });
});
