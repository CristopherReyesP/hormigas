import { describe, expect, it, vi } from 'vitest';
import { OPEN_GUARD_MS, chamberKeyAction, runChamberAction, tapCardAction } from './evolutionPick';

describe('evolution pick: taps', () => {
  it('a first tap on a card selects it and never confirms', () => {
    expect(tapCardAction(null, 'cargo_sacs', 2000)).toEqual({ type: 'select', id: 'cargo_sacs' });
  });

  it('a tap on another card moves the selection', () => {
    expect(tapCardAction('cargo_sacs', 'hive_mind', 2000)).toEqual({ type: 'select', id: 'hive_mind' });
  });

  it('a tap on the selected card deselects it', () => {
    expect(tapCardAction('cargo_sacs', 'cargo_sacs', 2000)).toEqual({ type: 'deselect' });
  });

  it('ignores taps while the chamber has just opened', () => {
    expect(OPEN_GUARD_MS).toBeGreaterThanOrEqual(500);
    expect(tapCardAction(null, 'cargo_sacs', 0)).toBeNull();
    expect(tapCardAction(null, 'cargo_sacs', OPEN_GUARD_MS - 1)).toBeNull();
    expect(tapCardAction(null, 'cargo_sacs', OPEN_GUARD_MS)).toEqual({ type: 'select', id: 'cargo_sacs' });
  });
});

describe('evolution pick: keys', () => {
  it('Enter confirms only with a selection', () => {
    expect(chamberKeyAction('Enter', 'cargo_sacs')).toEqual({ type: 'confirm' });
    expect(chamberKeyAction('NumpadEnter', 'cargo_sacs')).toEqual({ type: 'confirm' });
    expect(chamberKeyAction('Enter', null)).toBeNull();
  });

  it('Escape deselects only with a selection', () => {
    expect(chamberKeyAction('Escape', 'cargo_sacs')).toEqual({ type: 'deselect' });
    expect(chamberKeyAction('Escape', null)).toBeNull();
  });

  it('other keys do nothing here (digits are the game hotkeys)', () => {
    expect(chamberKeyAction('Digit1', null)).toBeNull();
    expect(chamberKeyAction('Space', 'cargo_sacs')).toBeNull();
  });
});

describe('evolution pick: dispatch', () => {
  it('routes each action to the pick API', () => {
    const pick = { selectMutation: vi.fn((_id: string | null) => true), confirmMutation: vi.fn(() => true) };
    runChamberAction(pick, { type: 'select', id: 'cargo_sacs' });
    runChamberAction(pick, { type: 'deselect' });
    runChamberAction(pick, { type: 'confirm' });
    expect(pick.selectMutation.mock.calls).toEqual([['cargo_sacs'], [null]]);
    expect(pick.confirmMutation).toHaveBeenCalledTimes(1);
  });
});
