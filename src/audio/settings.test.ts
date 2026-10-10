import { describe, expect, it } from 'vitest';
import {
  AUDIO_SETTINGS_STORAGE_KEY,
  busLevels,
  createAudioSettingsStore,
  DEFAULT_AUDIO_SETTINGS,
  loadAudioSettings,
  MUTE_MODE_LABELS,
  nextMuteMode,
  sanitizeAudioSettings,
  saveAudioSettings,
  type SettingsStorage,
} from './settings';

function memoryStorage(initial: Record<string, string> = {}): SettingsStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const THROWING: SettingsStorage = {
  getItem: () => {
    throw new Error('SecurityError: storage is disabled');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('mute cycle', () => {
  it('cycles on → no music → muted → on', () => {
    expect(nextMuteMode('on')).toBe('noMusic');
    expect(nextMuteMode('noMusic')).toBe('muted');
    expect(nextMuteMode('muted')).toBe('on');
  });

  it('silences the music bus without music and the master when muted', () => {
    const s = { ...DEFAULT_AUDIO_SETTINGS };
    expect(busLevels(s)).toEqual({ master: s.master, music: s.music, sfx: s.sfx, ui: s.ui });
    expect(busLevels({ ...s, mode: 'noMusic' })).toMatchObject({ master: s.master, music: 0, sfx: s.sfx });
    expect(busLevels({ ...s, mode: 'muted' }).master).toBe(0);
  });

  it('labels every mode in neutral Spanish', () => {
    expect(Object.values(MUTE_MODE_LABELS)).toEqual(['Sonido activado', 'Sin música', 'Silencio']);
  });

  it('cycles through the store, tells subscribers and persists each step', () => {
    const storage = memoryStorage();
    const store = createAudioSettingsStore(() => storage);
    let notified = 0;
    const unsubscribe = store.subscribe(() => notified++);
    expect(store.cycleMode()).toBe('noMusic');
    expect(store.cycleMode()).toBe('muted');
    expect(JSON.parse(storage.data[AUDIO_SETTINGS_STORAGE_KEY]).mode).toBe('muted');
    unsubscribe();
    expect(store.cycleMode()).toBe('on');
    expect(notified).toBe(2);
  });
});

describe('settings persistence', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const settings = { mode: 'noMusic' as const, master: 0.5, music: 0.25, sfx: 1, ui: 0 };
    saveAudioSettings(settings, storage);
    expect(loadAudioSettings(storage)).toEqual(settings);
  });

  it('falls back to the defaults when storage is missing, empty, corrupt or throwing', () => {
    expect(loadAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(loadAudioSettings(memoryStorage())).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(loadAudioSettings(memoryStorage({ [AUDIO_SETTINGS_STORAGE_KEY]: '{not json' }))).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(loadAudioSettings(THROWING)).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it('never throws when saving to a blocked storage', () => {
    expect(() => saveAudioSettings(DEFAULT_AUDIO_SETTINGS, THROWING)).not.toThrow();
    expect(() => saveAudioSettings(DEFAULT_AUDIO_SETTINGS, null)).not.toThrow();
  });

  it('keeps the valid fields of a damaged record and clamps the levels', () => {
    const raw = { mode: 'loud', master: 3, music: -1, sfx: 'max', ui: 0.3 };
    expect(sanitizeAudioSettings(raw)).toEqual({ ...DEFAULT_AUDIO_SETTINGS, master: 1, music: 0, ui: 0.3 });
  });

  it('still works in memory when storage throws', () => {
    const store = createAudioSettingsStore(() => THROWING);
    expect(store.get()).toEqual(DEFAULT_AUDIO_SETTINGS);
    store.update({ music: 0.1 });
    expect(store.get().music).toBe(0.1);
  });
});
