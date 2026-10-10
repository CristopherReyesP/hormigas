import { describe, expect, it } from 'vitest';
import { FirstVisitMemory, TUTORIAL_STORAGE_KEY, type StorageLike } from './firstVisit';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

const broken: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('tutorial first-visit memory', () => {
  it('offers the tutorial on a first visit', () => {
    expect(new FirstVisitMemory(() => memoryStorage()).shouldOffer()).toBe(true);
  });

  it('remembers a finished or skipped tutorial across visits', () => {
    const storage = memoryStorage();
    new FirstVisitMemory(() => storage).remember('skipped');
    expect(storage.data.get(TUTORIAL_STORAGE_KEY)).toBe('skipped');
    expect(new FirstVisitMemory(() => storage).shouldOffer()).toBe(false);
    new FirstVisitMemory(() => storage).remember('done');
    expect(new FirstVisitMemory(() => storage).shouldOffer()).toBe(false);
  });

  it('ignores junk in storage', () => {
    const storage = memoryStorage();
    storage.data.set(TUTORIAL_STORAGE_KEY, 'whatever');
    expect(new FirstVisitMemory(() => storage).shouldOffer()).toBe(true);
  });

  it('survives storage that throws: offers once, then not again this session', () => {
    const memory = new FirstVisitMemory(() => broken);
    expect(memory.shouldOffer()).toBe(true);
    expect(() => memory.remember('skipped')).not.toThrow();
    expect(memory.shouldOffer()).toBe(false);
  });

  it('survives a missing storage, or an accessor that throws', () => {
    const missing = new FirstVisitMemory(() => null);
    expect(missing.shouldOffer()).toBe(true);
    missing.remember('done');
    expect(missing.shouldOffer()).toBe(false);
    const throwing = new FirstVisitMemory(() => {
      throw new Error('blocked');
    });
    expect(throwing.shouldOffer()).toBe(true);
    expect(() => throwing.remember('done')).not.toThrow();
    expect(throwing.shouldOffer()).toBe(false);
  });
});
