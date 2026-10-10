/**
 * Whether to offer the tutorial on this visit: yes until the player has
 * finished or skipped it once. Remembered in localStorage; when storage is
 * missing or throws (private mode, blocked site data) the answer is kept in
 * memory for this session, so the offer never nags twice in one visit.
 */

export const TUTORIAL_STORAGE_KEY = 'hormigas.tutorial';

export type TutorialChoice = 'done' | 'skipped';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): StorageLike | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
}

export class FirstVisitMemory {
  private readonly storage: () => StorageLike | null;
  /** The choice made this session, whatever storage did with it */
  private session: TutorialChoice | null = null;

  constructor(storage: () => StorageLike | null = browserStorage) {
    this.storage = storage;
  }

  shouldOffer(): boolean {
    if (this.session) return false;
    try {
      const saved = this.storage()?.getItem(TUTORIAL_STORAGE_KEY);
      return saved !== 'done' && saved !== 'skipped';
    } catch {
      return true;
    }
  }

  remember(choice: TutorialChoice): void {
    this.session = choice;
    try {
      this.storage()?.setItem(TUTORIAL_STORAGE_KEY, choice);
    } catch {
      // Storage is blocked or full: the session memory still holds the answer
    }
  }
}

/** The page's memory (one per visit) */
export const firstVisit = new FirstVisitMemory();
