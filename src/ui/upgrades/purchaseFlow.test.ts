import { describe, expect, it } from 'vitest';
import { OPEN_GUARD_MS, confirmSelected, doubleClickLine, openFlow, selectLine } from './purchaseFlow';

describe('two-step upgrade purchase', () => {
  it('selects on the first tap and buys only on Mejorar', () => {
    let flow = openFlow(0);
    const t = OPEN_GUARD_MS + 10;
    expect(confirmSelected(flow, t)).toBeNull(); // nothing selected yet
    flow = selectLine(flow, 'queenLay', t);
    expect(flow.selected).toBe('queenLay');
    // Tapping the selected line again does not buy it
    flow = selectLine(flow, 'queenLay', t + 50);
    expect(flow.selected).toBe('queenLay');
    expect(confirmSelected(flow, t + 100)).toBe('queenLay');
  });

  it('ignores taps in the first 400 ms after opening', () => {
    let flow = openFlow(1000);
    flow = selectLine(flow, 'incubation', 1000 + OPEN_GUARD_MS - 1);
    expect(flow.selected).toBeNull();
    const preselected = openFlow(1000, 'queenHp');
    expect(confirmSelected(preselected, 1000 + 100)).toBeNull();
    expect(doubleClickLine(preselected, 'queenHp', 1000 + 100, false)).toBeNull();
    expect(confirmSelected(preselected, 1000 + OPEN_GUARD_MS)).toBe('queenHp');
  });

  it('lets a desktop double click confirm, never a touch double tap', () => {
    const flow = openFlow(0);
    expect(doubleClickLine(flow, 'carry', 1000, false)).toBe('carry');
    expect(doubleClickLine(flow, 'carry', 1000, true)).toBeNull();
  });
});
