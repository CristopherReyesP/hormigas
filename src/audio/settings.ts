/**
 * Player audio settings: the speaker toggle's mode plus four volume sliders,
 * remembered in localStorage (best effort: private windows and sandboxes
 * block storage, and a blocked or corrupt store falls back to the defaults).
 */

/** The speaker toggle cycles on → no music → muted → on. */
export type MuteMode = 'on' | 'noMusic' | 'muted';

export const MUTE_MODES: readonly MuteMode[] = ['on', 'noMusic', 'muted'];

export interface AudioSettings {
  mode: MuteMode;
  /** 0..1 slider levels */
  master: number;
  music: number;
  sfx: number;
  ui: number;
}

export type VolumeKey = Exclude<keyof AudioSettings, 'mode'>;
export const VOLUME_KEYS: readonly VolumeKey[] = ['master', 'music', 'sfx', 'ui'];

export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = {
  mode: 'on',
  master: 0.8,
  music: 0.55,
  sfx: 0.8,
  ui: 0.6,
};

export const AUDIO_SETTINGS_STORAGE_KEY = 'hormigas.audio.v1';

/** Neutral Spanish, never uppercased by CSS (the pixel font lacks accented capitals). */
export const MUTE_MODE_LABELS: Record<MuteMode, string> = {
  on: 'Sonido activado',
  noMusic: 'Sin música',
  muted: 'Silencio',
};

export const VOLUME_LABELS: Record<VolumeKey, string> = {
  master: 'General',
  music: 'Música',
  sfx: 'Efectos',
  ui: 'Interfaz',
};

export function nextMuteMode(mode: MuteMode): MuteMode {
  return MUTE_MODES[(MUTE_MODES.indexOf(mode) + 1) % MUTE_MODES.length];
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Anything (parsed JSON, a partial patch) → complete, in-range settings. */
export function sanitizeAudioSettings(raw: unknown): AudioSettings {
  const src = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const out: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  if (MUTE_MODES.includes(src.mode as MuteMode)) out.mode = src.mode as MuteMode;
  for (const key of VOLUME_KEYS) {
    const v = src[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = clamp01(v);
  }
  return out;
}

/** Effective bus levels after the mode: muted silences the master, "no music" the music bus. */
export function busLevels(s: AudioSettings): Record<'master' | 'music' | 'sfx' | 'ui', number> {
  return {
    master: s.mode === 'muted' ? 0 : s.master,
    music: s.mode === 'on' ? s.music : 0,
    sfx: s.sfx,
    ui: s.ui,
  };
}

// ── Persistence ──

export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The browser's localStorage, or null where reading it is impossible or blocked. */
export function browserStorage(): SettingsStorage | null {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadAudioSettings(storage: SettingsStorage | null = browserStorage()): AudioSettings {
  try {
    const raw = storage?.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    return raw ? sanitizeAudioSettings(JSON.parse(raw)) : { ...DEFAULT_AUDIO_SETTINGS };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(settings: AudioSettings, storage: SettingsStorage | null = browserStorage()): void {
  try {
    storage?.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage is a convenience: a blocked or full storage just forgets the levels
  }
}

// ── Store (one per page; React reads it through useSyncExternalStore) ──

export interface AudioSettingsStore {
  get(): AudioSettings;
  subscribe(listener: () => void): () => void;
  update(patch: Partial<AudioSettings>): void;
  /** The speaker toggle: on → no music → muted → on */
  cycleMode(): MuteMode;
}

export function createAudioSettingsStore(storage: () => SettingsStorage | null = browserStorage): AudioSettingsStore {
  let current: AudioSettings | null = null;
  const listeners = new Set<() => void>();
  const get = (): AudioSettings => (current ??= loadAudioSettings(storage()));
  const update = (patch: Partial<AudioSettings>): void => {
    current = sanitizeAudioSettings({ ...get(), ...patch });
    saveAudioSettings(current, storage());
    for (const listener of listeners) listener();
  };
  return {
    get,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update,
    cycleMode() {
      const mode = nextMuteMode(get().mode);
      update({ mode });
      return mode;
    },
  };
}

export const audioSettings = createAudioSettingsStore();
