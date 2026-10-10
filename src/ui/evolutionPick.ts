import type { MutationId } from '../game/run/MutationDefinitions';

/**
 * Two-step dawn pick: a tap (or digit key) selects a card, and only "Confirmar
 * evolución" (or Enter) applies it. Pure mapping from input to action so the
 * overlay and the tests share it.
 */

/** Taps this soon after the chamber opens are ignored: they were meant for the map. */
export const OPEN_GUARD_MS = 600;

export type ChamberAction =
  | { type: 'select'; id: MutationId }
  | { type: 'deselect' }
  | { type: 'confirm' };

/** The pick API the actions drive (GameManager). */
export interface MutationPicker {
  selectMutation(id: string | null): boolean;
  confirmMutation(): boolean;
}

/** A tap on card `id`, `msSinceOpen` after the chamber opened; null = ignored. */
export function tapCardAction(selected: MutationId | null, id: MutationId, msSinceOpen: number): ChamberAction | null {
  if (msSinceOpen < OPEN_GUARD_MS) return null;
  return selected === id ? { type: 'deselect' } : { type: 'select', id };
}

/** Enter confirms and Escape deselects; both only with a card selected. Digits are game hotkeys. */
export function chamberKeyAction(code: string, selected: MutationId | null): ChamberAction | null {
  if (!selected) return null;
  if (code === 'Enter' || code === 'NumpadEnter') return { type: 'confirm' };
  if (code === 'Escape') return { type: 'deselect' };
  return null;
}

export function runChamberAction(picker: MutationPicker, action: ChamberAction): void {
  if (action.type === 'confirm') picker.confirmMutation();
  else picker.selectMutation(action.type === 'select' ? action.id : null);
}
