/**
 * Command card grid: 3 rows × 5 columns of square buttons with StarCraft-style
 * positional hotkeys (QWERT / ASDFG / ZXCVB).
 */

export const CARD_COLUMNS = 5;
export const CARD_ROWS = 3;
export const CARD_SLOTS = CARD_COLUMNS * CARD_ROWS;

export const GRID_LETTERS: readonly string[] = 'QWERTASDFGZXCVB'.split('');

/**
 * Letters other shortcuts already own: R (and Home) reset the camera, M shows
 * or hides the minimap, and E opens the evolution chamber in dev builds.
 */
export const RESERVED_LETTERS: readonly string[] = ['E', 'R', 'M'];

/** Stand-ins for reserved grid letters, handed out in reading order. */
const FALLBACK_LETTERS: readonly string[] = ['Y', 'U', 'H', 'J', 'K', 'L', 'N', 'I', 'O', 'P'];

/** Hotkey letter of every slot, in reading order; reserved letters get free stand-ins. */
export function cardHotkeys(reserved: readonly string[] = RESERVED_LETTERS): string[] {
  const taken = new Set([...reserved, ...GRID_LETTERS]);
  const spares = FALLBACK_LETTERS.filter((letter) => !taken.has(letter));
  return GRID_LETTERS.map((letter) => (reserved.includes(letter) ? spares.shift() ?? '' : letter));
}

/** Slot index for a KeyboardEvent.code ("KeyQ"), or -1 when the key is not on the card. */
export function slotForKey(code: string, hotkeys: readonly string[]): number {
  if (!code.startsWith('Key') || code.length !== 4) return -1;
  return hotkeys.indexOf(code.slice(3));
}
