import { afterEach, describe, expect, it, vi } from 'vitest';
import { BEST_NIGHT_KEY, loadBestNight, recordNight } from './nightRecord';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

const broken = {
  getItem: (): string | null => { throw new Error('SecurityError'); },
  setItem: (): void => { throw new Error('QuotaExceededError'); },
};

afterEach(() => vi.unstubAllGlobals());

describe('local night record', () => {
  it('starts at 0 with nothing stored', () => {
    expect(loadBestNight(memoryStorage())).toBe(0);
  });

  it('saves a new best night', () => {
    const storage = memoryStorage();
    expect(recordNight(14, storage)).toBe(14);
    expect(storage.data.get(BEST_NIGHT_KEY)).toBe('14');
    expect(loadBestNight(storage)).toBe(14);
  });

  it('keeps the old record when the run did worse', () => {
    const storage = memoryStorage({ [BEST_NIGHT_KEY]: '14' });
    expect(recordNight(9, storage)).toBe(14);
    expect(storage.data.get(BEST_NIGHT_KEY)).toBe('14');
  });

  it('ignores garbage in storage', () => {
    expect(loadBestNight(memoryStorage({ [BEST_NIGHT_KEY]: 'abc' }))).toBe(0);
    expect(loadBestNight(memoryStorage({ [BEST_NIGHT_KEY]: '-3' }))).toBe(0);
  });

  it('survives a storage that throws: the run still reports its own nights', () => {
    expect(loadBestNight(broken)).toBe(0);
    expect(recordNight(5, broken)).toBe(5);
  });

  it('survives having no localStorage at all, or one whose getter throws', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadBestNight()).toBe(0);
    expect(recordNight(3)).toBe(3);
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
    try {
      expect(loadBestNight()).toBe(0);
      expect(recordNight(4)).toBe(4);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('uses the global localStorage by default', () => {
    const storage = memoryStorage({ [BEST_NIGHT_KEY]: '6' });
    vi.stubGlobal('localStorage', storage);
    expect(loadBestNight()).toBe(6);
    expect(recordNight(8)).toBe(8);
    expect(storage.data.get(BEST_NIGHT_KEY)).toBe('8');
  });
});
