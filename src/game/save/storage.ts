// Where saves live: one autosave and three manual slots.
//
// localStorage is the default: it is synchronous, so a save made from
// `pagehide` (a phone killing the backgrounded tab) lands before the page is
// gone. A save of a big late-game colony measures a few hundred KB, far under
// the ~5 MB localStorage gives an origin; past IDB_THRESHOLD_BYTES, or when
// localStorage is full, the save goes to IndexedDB instead. A small index of
// every slot's metadata always stays in localStorage, so the start screen and
// the slot list read it without opening a save.
//
// Nothing here throws: every storage call is wrapped, and failures come back
// as values the UI turns into a toast.

import { SAVE_VERSION, parseSave, readMeta, stringifySave, type ParseResult, type SaveFile, type SaveMeta } from './format';

export const SLOT_IDS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type SlotId = typeof SLOT_IDS[number];

export const SAVE_INDEX_KEY = 'hormigas.saves.index.v1';
export function saveKey(slot: SlotId): string {
  return `hormigas.save.${slot}`;
}

/** Saves bigger than this (UTF-16 bytes) go to IndexedDB */
export const IDB_THRESHOLD_BYTES = 4 * 1024 * 1024;

export type Backend = 'local' | 'idb';

/** A key/value store for big saves (IndexedDB in the browser) */
export interface BlobStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

interface IndexEntry {
  meta: SaveMeta;
  version: number;
  bytes: number;
  backend: Backend;
}

export interface SlotInfo {
  slot: SlotId;
  /** Undefined for an empty slot */
  meta?: SaveMeta;
  version?: number;
  bytes?: number;
  backend?: Backend;
  /** False for a save from another version: it can only be discarded */
  compatible: boolean;
}

export type WriteResult = { ok: true; backend: Backend; bytes: number } | { ok: false; error: string };
export type ReadResult = ParseResult | { ok: false; reason: 'empty' } | { ok: false; reason: 'error' };

export interface SaveStorageOptions {
  local: Storage | null;
  blobs: BlobStore | null;
  idbThresholdBytes?: number;
}

function describeError(e: unknown): string {
  if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) return 'no queda espacio';
  return e instanceof Error ? e.message : String(e);
}

export class SaveStorage {
  private readonly local: Storage | null;
  private readonly blobs: BlobStore | null;
  private readonly threshold: number;

  constructor(options: SaveStorageOptions) {
    this.local = options.local;
    this.blobs = options.blobs;
    this.threshold = options.idbThresholdBytes ?? IDB_THRESHOLD_BYTES;
  }

  private readIndex(): Partial<Record<SlotId, IndexEntry>> {
    try {
      const text = this.local?.getItem(SAVE_INDEX_KEY);
      if (!text) return {};
      const raw: unknown = JSON.parse(text);
      if (typeof raw !== 'object' || raw === null) return {};
      const out: Partial<Record<SlotId, IndexEntry>> = {};
      for (const slot of SLOT_IDS) {
        const entry = (raw as Record<string, unknown>)[slot] as Partial<IndexEntry> | undefined;
        const meta = readMeta(entry?.meta);
        if (!entry || !meta || typeof entry.version !== 'number') continue;
        out[slot] = { meta, version: entry.version, bytes: Number(entry.bytes) || 0, backend: entry.backend === 'idb' ? 'idb' : 'local' };
      }
      return out;
    } catch {
      return {};
    }
  }

  private writeIndex(index: Partial<Record<SlotId, IndexEntry>>): boolean {
    try {
      if (!this.local) return false;
      this.local.setItem(SAVE_INDEX_KEY, JSON.stringify(index));
      return true;
    } catch {
      return false;
    }
  }

  /** Every slot, empty ones included, in slot order */
  list(): SlotInfo[] {
    const index = this.readIndex();
    return SLOT_IDS.map((slot) => {
      const entry = index[slot];
      if (!entry) return { slot, compatible: true };
      return { slot, ...entry, compatible: entry.version === SAVE_VERSION };
    });
  }

  has(slot: SlotId): boolean {
    return this.readIndex()[slot] !== undefined;
  }

  /**
   * Write a save. The localStorage path is synchronous (it has landed when
   * this returns its promise); the IndexedDB path finishes asynchronously.
   */
  write(slot: SlotId, save: SaveFile): Promise<WriteResult> {
    let text: string;
    try {
      text = stringifySave(save);
    } catch (e) {
      return Promise.resolve({ ok: false, error: describeError(e) });
    }
    const bytes = text.length * 2;
    const entry = (backend: Backend): IndexEntry => ({ meta: save.meta, version: save.version, bytes, backend });
    let localError = 'no hay almacenamiento';
    if (this.local && bytes <= this.threshold) {
      try {
        this.local.setItem(saveKey(slot), text);
        const index = this.readIndex();
        const previous = index[slot];
        index[slot] = entry('local');
        if (!this.writeIndex(index)) return Promise.resolve({ ok: false, error: 'no se pudo guardar el índice' });
        if (previous?.backend === 'idb') void this.blobs?.remove(saveKey(slot)).catch(() => undefined);
        return Promise.resolve({ ok: true, backend: 'local', bytes });
      } catch (e) {
        localError = describeError(e);
      }
    }
    if (!this.blobs) return Promise.resolve({ ok: false, error: localError });
    const blobs = this.blobs;
    return (async (): Promise<WriteResult> => {
      try {
        await blobs.set(saveKey(slot), text);
      } catch (e) {
        return { ok: false, error: describeError(e) };
      }
      try {
        this.local?.removeItem(saveKey(slot));
      } catch {
        // the old copy stays; the index points at IndexedDB
      }
      const index = this.readIndex();
      index[slot] = entry('idb');
      if (!this.writeIndex(index)) return { ok: false, error: 'no se pudo guardar el índice' };
      return { ok: true, backend: 'idb', bytes };
    })();
  }

  async read(slot: SlotId): Promise<ReadResult> {
    const entry = this.readIndex()[slot];
    if (!entry) return { ok: false, reason: 'empty' };
    let text: string | null;
    try {
      text = entry.backend === 'idb' ? ((await this.blobs?.get(saveKey(slot))) ?? null) : (this.local?.getItem(saveKey(slot)) ?? null);
    } catch {
      return { ok: false, reason: 'error' };
    }
    if (text === null) return { ok: false, reason: 'corrupt' };
    return parseSave(text);
  }

  /** Delete a slot; false if storage refused */
  async remove(slot: SlotId): Promise<boolean> {
    try {
      const index = this.readIndex();
      const entry = index[slot];
      delete index[slot];
      if (!this.local) return false;
      this.local.removeItem(saveKey(slot));
      if (!this.writeIndex(index)) return false;
      if (entry?.backend === 'idb') await this.blobs?.remove(saveKey(slot));
      return true;
    } catch {
      return false;
    }
  }
}

/** IndexedDB as a BlobStore, or null where it does not exist */
export function indexedDbBlobs(dbName = 'hormigas-saves', storeName = 'saves'): BlobStore | null {
  let factory: IDBFactory | undefined;
  try {
    factory = globalThis.indexedDB;
  } catch {
    return null;
  }
  if (!factory) return null;
  const idb = factory;
  let opening: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = idb.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB'));
    }).catch((e: unknown) => {
      opening = null;
      throw e;
    });
    return opening;
  };
  const run = async <T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = op(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(request.result as T);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB'));
    });
  };
  return {
    get: async (key) => ((await run<unknown>('readonly', (s) => s.get(key))) as string | undefined) ?? null,
    set: async (key, value) => {
      await run('readwrite', (s) => s.put(value, key));
    },
    remove: async (key) => {
      await run('readwrite', (s) => s.delete(key));
    },
  };
}

/** The browser's localStorage, or null where touching it throws */
export function browserLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let shared: SaveStorage | null = null;
/** The app's SaveStorage (localStorage + IndexedDB) */
export function getSaveStorage(): SaveStorage {
  shared ??= new SaveStorage({ local: browserLocalStorage(), blobs: indexedDbBlobs() });
  return shared;
}
