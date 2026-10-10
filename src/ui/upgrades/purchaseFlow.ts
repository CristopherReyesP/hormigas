import type { UpgradeId } from '../../game/upgrades/upgradeTable';

/**
 * Buying an upgrade takes two steps, so a stray tap never spends the pantry:
 * the first tap on a line only selects it (the panel then shows its effect
 * and price), and the Mejorar button confirms. On desktop a double click on
 * the line also confirms. Taps in the first OPEN_GUARD_MS after the panel
 * opens are ignored: the tap that opened it must not land on a line.
 */
export const OPEN_GUARD_MS = 400;

export interface PurchaseFlow {
  /** performance.now() when the panel opened */
  openedAt: number;
  selected: UpgradeId | null;
}

export function openFlow(now: number, selected: UpgradeId | null = null): PurchaseFlow {
  return { openedAt: now, selected };
}

/** Still inside the guard after opening: input is ignored */
export function guarded(flow: PurchaseFlow, now: number): boolean {
  return now - flow.openedAt < OPEN_GUARD_MS;
}

/** First step: a tap or click on a line selects it (never buys) */
export function selectLine(flow: PurchaseFlow, id: UpgradeId, now: number): PurchaseFlow {
  if (guarded(flow, now)) return flow;
  return flow.selected === id ? flow : { ...flow, selected: id };
}

/** Second step: the Mejorar button. Returns the line to buy, or null (nothing selected, or too soon). */
export function confirmSelected(flow: PurchaseFlow, now: number): UpgradeId | null {
  if (guarded(flow, now)) return null;
  return flow.selected;
}

/**
 * Desktop shortcut: a double click on a line buys it, as select + confirm.
 * Touch screens never take it (a quick double tap must not spend twice).
 */
export function doubleClickLine(flow: PurchaseFlow, id: UpgradeId, now: number, touch: boolean): UpgradeId | null {
  if (touch || guarded(flow, now)) return null;
  return id;
}
