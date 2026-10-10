import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RUN_SETUP,
  RUN_SETUP_STORAGE_KEY,
  isAvailableRival,
  isPlayableRace,
  loadRunSetup,
  saveRunSetup,
  withPlayerRace,
  withRivalRace,
  type RunSetup,
} from './RunSetup';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('SecurityError: storage is blocked');
  },
  setItem: (): void => {
    throw new Error('QuotaExceededError');
  },
};

describe('RunSetup defaults', () => {
  it('starts as the Swarm against the wildlife, today\'s game', () => {
    expect(DEFAULT_RUN_SETUP).toEqual({ playerRace: 'swarm', rivalRace: 'wildlife' });
  });

  it('only the Swarm is playable and only the wildlife is a rival for now', () => {
    expect(isPlayableRace('swarm')).toBe(true);
    expect(isPlayableRace('crystal')).toBe(false);
    expect(isPlayableRace('human')).toBe(false);
    expect(isAvailableRival('wildlife')).toBe(true);
    expect(isAvailableRival('crystal')).toBe(false);
    expect(isAvailableRival('human')).toBe(false);
  });

  it('ignores picks of races that are not available yet', () => {
    expect(withPlayerRace(DEFAULT_RUN_SETUP, 'crystal')).toBe(DEFAULT_RUN_SETUP);
    expect(withRivalRace(DEFAULT_RUN_SETUP, 'human')).toBe(DEFAULT_RUN_SETUP);
    expect(withPlayerRace(DEFAULT_RUN_SETUP, 'swarm')).toEqual(DEFAULT_RUN_SETUP);
    expect(withRivalRace(DEFAULT_RUN_SETUP, 'wildlife')).toEqual(DEFAULT_RUN_SETUP);
  });
});

describe('RunSetup persistence', () => {
  it('round-trips the last choice through storage', () => {
    const storage = memoryStorage();
    const setup: RunSetup = { playerRace: 'swarm', rivalRace: 'wildlife' };
    saveRunSetup(setup, storage);
    expect(storage.data.has(RUN_SETUP_STORAGE_KEY)).toBe(true);
    expect(loadRunSetup(storage)).toEqual(setup);
  });

  it('falls back to the default without storage, with an empty slot or with garbage', () => {
    expect(loadRunSetup(null)).toEqual(DEFAULT_RUN_SETUP);
    expect(loadRunSetup(memoryStorage())).toEqual(DEFAULT_RUN_SETUP);
    for (const raw of ['{not json', '42', 'null', '[]', '"swarm"', '{"playerRace":7}']) {
      expect(loadRunSetup(memoryStorage({ [RUN_SETUP_STORAGE_KEY]: raw })), raw).toEqual(DEFAULT_RUN_SETUP);
    }
  });

  it('falls back field by field when a stored race is unknown or not available yet', () => {
    const stored = (value: object) => memoryStorage({ [RUN_SETUP_STORAGE_KEY]: JSON.stringify(value) });
    expect(loadRunSetup(stored({ playerRace: 'crystal', rivalRace: 'wildlife' }))).toEqual(DEFAULT_RUN_SETUP);
    expect(loadRunSetup(stored({ playerRace: 'swarm', rivalRace: 'robots' }))).toEqual(DEFAULT_RUN_SETUP);
    expect(loadRunSetup(stored({ playerRace: 'swarm' }))).toEqual(DEFAULT_RUN_SETUP);
  });

  it('never throws when storage is blocked or full', () => {
    expect(loadRunSetup(throwing)).toEqual(DEFAULT_RUN_SETUP);
    expect(() => saveRunSetup(DEFAULT_RUN_SETUP, throwing)).not.toThrow();
    expect(() => saveRunSetup(DEFAULT_RUN_SETUP, null)).not.toThrow();
  });

  it('uses the browser storage by default, and survives where there is none', () => {
    expect(() => loadRunSetup()).not.toThrow();
    expect(() => saveRunSetup(DEFAULT_RUN_SETUP)).not.toThrow();
  });
});
