import { describe, expect, it } from 'vitest';
import { SAVE_FORMAT, SAVE_VERSION, type SaveFile } from './format';
import { SaveStorage, SAVE_INDEX_KEY, SLOT_IDS, saveKey, type BlobStore } from './storage';

/** A Storage backed by a Map, optionally with a quota (chars) */
function memoryStorage(quota = Infinity): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  const used = () => [...data].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const before = data.get(k);
      data.set(k, v);
      if (used() > quota) {
        if (before === undefined) data.delete(k);
        else data.set(k, before);
        throw new DOMException('quota', 'QuotaExceededError');
      }
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
  };
}

/** A Storage whose every call throws (private mode, blocked site data) */
function brokenStorage(): Storage {
  const fail = () => {
    throw new DOMException('denied', 'SecurityError');
  };
  return { length: 0, key: fail, getItem: fail, setItem: fail, removeItem: fail, clear: fail } as unknown as Storage;
}

function memoryBlobs(): BlobStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => {
      data.set(k, v);
    },
    remove: async (k) => {
      data.delete(k);
    },
  };
}

function fakeSave(day = 3, padding = 0): SaveFile {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    meta: { playerRace: 'swarm', rivalRace: 'crystal', day, phase: 'day', ants: 12, wave: 2, minerals: 5, ticks: 100, savedAt: 1_700_000_000_000 },
    state: {
      setup: { playerRace: 'swarm', rivalRace: 'crystal' },
      world: { pad: 'x'.repeat(padding) },
      grid: {},
      underground: {},
      visibility: {},
      systems: {},
      manager: {},
      loop: { tickCount: 100, speed: 1 },
      offerRng: 1,
    },
  };
}

describe('SaveStorage', () => {
  it('has one autosave and three manual slots', () => {
    expect(SLOT_IDS).toEqual(['auto', 'slot1', 'slot2', 'slot3']);
  });

  it('writes, lists and reads back a slot from localStorage', async () => {
    const local = memoryStorage();
    const store = new SaveStorage({ local, blobs: null });
    const result = await store.write('slot2', fakeSave(4));
    expect(result).toMatchObject({ ok: true, backend: 'local' });
    expect(local.data.has(saveKey('slot2'))).toBe(true);
    expect(store.list().find((s) => s.slot === 'slot2')).toMatchObject({ meta: { day: 4 }, backend: 'local', compatible: true });
    expect(store.list().find((s) => s.slot === 'slot1')?.meta).toBeUndefined();
    const read = await store.read('slot2');
    expect(read.ok && read.save.meta.day).toBe(4);
    // A new SaveStorage on the same localStorage sees it (a page reload)
    expect(new SaveStorage({ local, blobs: null }).has('slot2')).toBe(true);
  });

  it('deletes a slot', async () => {
    const store = new SaveStorage({ local: memoryStorage(), blobs: null });
    await store.write('auto', fakeSave());
    expect(store.has('auto')).toBe(true);
    expect(await store.remove('auto')).toBe(true);
    expect(store.has('auto')).toBe(false);
    expect(await store.read('auto')).toEqual({ ok: false, reason: 'empty' });
  });

  it('a big save goes to IndexedDB, and the index still lists it', async () => {
    const local = memoryStorage();
    const blobs = memoryBlobs();
    const store = new SaveStorage({ local, blobs, idbThresholdBytes: 1000 });
    const result = await store.write('slot1', fakeSave(2, 2000));
    expect(result).toMatchObject({ ok: true, backend: 'idb' });
    expect(local.data.has(saveKey('slot1'))).toBe(false);
    expect(blobs.data.has(saveKey('slot1'))).toBe(true);
    const read = await store.read('slot1');
    expect(read.ok).toBe(true);
    // Overwriting with a small save moves it back and drops the IndexedDB copy
    await store.write('slot1', fakeSave(3));
    expect(blobs.data.has(saveKey('slot1'))).toBe(false);
    expect(local.data.has(saveKey('slot1'))).toBe(true);
  });

  it('falls back to IndexedDB when localStorage is full', async () => {
    const local = memoryStorage(3000);
    const blobs = memoryBlobs();
    const store = new SaveStorage({ local, blobs });
    const result = await store.write('auto', fakeSave(1, 5000));
    expect(result).toMatchObject({ ok: true, backend: 'idb' });
  });

  it('never throws when storage fails: the error is a value', async () => {
    const store = new SaveStorage({ local: brokenStorage(), blobs: null });
    expect(store.list().every((s) => s.meta === undefined)).toBe(true);
    const result = await store.write('slot1', fakeSave());
    expect(result.ok).toBe(false);
    expect(await store.read('slot1')).toMatchObject({ ok: false });
    expect(await store.remove('slot1')).toBe(false);
  });

  it('a full localStorage with no IndexedDB fails gracefully', async () => {
    const store = new SaveStorage({ local: memoryStorage(500), blobs: null });
    const result = await store.write('slot1', fakeSave(1, 5000));
    expect(result).toMatchObject({ ok: false });
  });

  it('an IndexedDB that rejects fails gracefully', async () => {
    const blobs: BlobStore = {
      get: () => Promise.reject(new Error('x')),
      set: () => Promise.reject(new Error('x')),
      remove: () => Promise.reject(new Error('x')),
    };
    const store = new SaveStorage({ local: memoryStorage(), blobs, idbThresholdBytes: 10 });
    expect(await store.write('slot1', fakeSave())).toMatchObject({ ok: false });
  });

  it('a corrupt slot reads as corrupt, and a corrupt index as empty', async () => {
    const local = memoryStorage();
    const store = new SaveStorage({ local, blobs: null });
    await store.write('slot3', fakeSave());
    local.setItem(saveKey('slot3'), '{broken');
    expect(await store.read('slot3')).toEqual({ ok: false, reason: 'corrupt' });
    local.setItem(SAVE_INDEX_KEY, 'nope');
    expect(new SaveStorage({ local, blobs: null }).list().every((s) => s.meta === undefined)).toBe(true);
  });

  it('marks a slot from another version as incompatible', async () => {
    const local = memoryStorage();
    const store = new SaveStorage({ local, blobs: null });
    await store.write('auto', { ...fakeSave(), version: SAVE_VERSION + 1 });
    expect(store.list().find((s) => s.slot === 'auto')).toMatchObject({ compatible: false });
    expect(await store.read('auto')).toMatchObject({ ok: false, reason: 'incompatible' });
  });

  it('works with no storage at all', async () => {
    const store = new SaveStorage({ local: null, blobs: null });
    expect(store.has('auto')).toBe(false);
    expect((await store.write('auto', fakeSave())).ok).toBe(false);
  });
});
