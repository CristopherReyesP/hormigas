import { describe, expect, it } from 'vitest';
import { CARD_SLOTS, cardHotkeys, GRID_LETTERS, RESERVED_LETTERS, slotForKey } from './commandCardLayout';

describe('command card hotkeys', () => {
  it('follows the QWERT / ASDFG / ZXCVB grid', () => {
    expect(GRID_LETTERS.join('')).toBe('QWERTASDFGZXCVB');
    expect(cardHotkeys([])).toEqual(GRID_LETTERS);
  });

  it('replaces letters other shortcuts own (E, R, M) with free stand-ins', () => {
    const keys = cardHotkeys();
    expect(keys).toHaveLength(CARD_SLOTS);
    expect(keys.join('')).toBe('QWYUTASDFGZXCVB');
    for (const reserved of RESERVED_LETTERS) expect(keys).not.toContain(reserved);
    expect(new Set(keys).size).toBe(CARD_SLOTS);
  });

  it('maps a keyboard code to its slot index', () => {
    const keys = cardHotkeys();
    expect(slotForKey('KeyQ', keys)).toBe(0);
    expect(slotForKey('KeyY', keys)).toBe(2);
    expect(slotForKey('KeyB', keys)).toBe(14);
  });

  it('ignores reserved letters, digits and other keys', () => {
    const keys = cardHotkeys();
    expect(slotForKey('KeyE', keys)).toBe(-1);
    expect(slotForKey('KeyR', keys)).toBe(-1);
    expect(slotForKey('Digit1', keys)).toBe(-1);
    expect(slotForKey('Space', keys)).toBe(-1);
  });
});
