import { describe, expect, it } from 'vitest';
import { STRIP_FOLDS, foldClassNames, planStripFolds, type StripFoldId } from './stripFold';

const priorityOf = (id: StripFoldId) => STRIP_FOLDS.find((f) => f.id === id)!.priority;
/** Every fold unit present, each `cost` px wide */
const items = (cost = 40) => STRIP_FOLDS.map((f) => ({ id: f.id, priority: f.priority, cost }));

describe('planStripFolds', () => {
  it('folds nothing while everything fits', () => {
    expect(planStripFolds({ natural: 900, available: 900, reserve: 44, items: items() })).toEqual([]);
  });

  it('folds the least important readouts first, only as many as it takes', () => {
    const folded = planStripFolds({ natural: 1000, available: 900, reserve: 0, items: items(40) });
    // 100 px too wide: three 40 px units, the three least important
    expect(folded).toHaveLength(3);
    const least = [...STRIP_FOLDS].sort((a, b) => b.priority - a.priority).slice(0, 3).map((f) => f.priority);
    expect(folded.map(priorityOf).sort((a, b) => b - a)).toEqual(least);
  });

  it('keeps room for the Más datos button once anything folds', () => {
    // 20 px too wide: one 40 px fold would do, but the button needs 44 px more
    const folded = planStripFolds({ natural: 920, available: 900, reserve: 44, items: items(40) });
    expect(folded).toHaveLength(2);
  });

  it('folds the population and the events before the clock, and the clock before the food', () => {
    const order = planStripFolds({ natural: 10_000, available: 0, reserve: 0, items: items() });
    const at = (id: StripFoldId) => order.indexOf(id);
    expect(at('pop')).toBeLessThan(at('events'));
    // An event first shrinks to its star and clock, then goes
    expect(at('eventNames')).toBeGreaterThanOrEqual(0);
    expect(at('eventNames')).toBeLessThan(at('events'));
    expect(at('events')).toBeLessThan(at('day'));
    expect(at('day')).toBeLessThan(at('otherFood'));
    expect(at('otherFood')).toBeLessThan(at('leaf'));
    expect(at('help')).toBeLessThan(at('waveWords'));
    // The leaves are the last to go, after the LLENA tag
    expect(order[order.length - 1]).toBe('leaf');
    expect(at('fullTag')).toBeLessThan(at('leaf'));
  });

  it('keeps the ant total long after the castes fold', () => {
    const order = planStripFolds({ natural: 10_000, available: 0, reserve: 0, items: items() });
    const at = (id: StripFoldId) => order.indexOf(id);
    expect(at('pop')).toBeLessThan(at('antTotal'));
    expect(at('waveWords')).toBeLessThan(at('antTotal'));
    expect(at('antTotal')).toBeLessThan(at('leaf'));
  });

  it('folds everything it may when nothing else fits, and never more', () => {
    const order = planStripFolds({ natural: 10_000, available: 0, reserve: 0, items: items() });
    expect(new Set(order)).toEqual(new Set(STRIP_FOLDS.map((f) => f.id)));
  });

  it('skips readouts that are not on the strip (no width to win)', () => {
    const some = items(40).map((i) => (i.id === 'pop' ? { ...i, cost: 0 } : i));
    const folded = planStripFolds({ natural: 1000, available: 960, reserve: 0, items: some });
    expect(folded).not.toContain('pop');
    expect(folded).toHaveLength(1);
  });

  it('depends only on the widths, not on what is folded now (no flicker)', () => {
    const input = { natural: 1100, available: 900, reserve: 44, items: items(30) };
    expect(planStripFolds(input)).toEqual(planStripFolds({ ...input, items: [...input.items] }));
  });
});

describe('STRIP_FOLDS', () => {
  it('never folds the key readouts: food and pantry total, minerals, the wave timer and pause', () => {
    const selectors = STRIP_FOLDS.map((f) => f.selector).join(',');
    for (const core of ['.strip-pantry,', '.strip-minerals', '.strip-time', '.strip-wave,', '.strip-more']) {
      expect(`${selectors},`).not.toContain(core);
    }
  });

  it('names every unit once', () => {
    const ids = STRIP_FOLDS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('foldClassNames', () => {
  it('turns the folds into header classes the stylesheet hides', () => {
    expect(foldClassNames(['pop', 'events'])).toBe('top-strip--folded top-strip--fold-pop top-strip--fold-events');
    expect(foldClassNames([])).toBe('');
  });
});
