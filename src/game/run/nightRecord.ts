// The local record of the endless run: the most nights any run on this browser survived.
// Storage can be missing, blocked or full; the game never fails because of it.

export const BEST_NIGHT_KEY = 'hormigas.bestNight';

export type NightRecordStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): NightRecordStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // the getter itself throws when site data is blocked
  }
}

/** The best night stored, or 0 when there is none or it cannot be read */
export function loadBestNight(storage: NightRecordStorage | null = defaultStorage()): number {
  try {
    const value = Number.parseInt(storage?.getItem(BEST_NIGHT_KEY) ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** Store `nights` when it beats the record; returns the best night, this run included */
export function recordNight(nights: number, storage: NightRecordStorage | null = defaultStorage()): number {
  const previous = loadBestNight(storage);
  if (nights <= previous) return previous;
  try {
    storage?.setItem(BEST_NIGHT_KEY, String(nights));
  } catch {
    // Full or blocked storage: the run still reports its own nights
  }
  return nights;
}
