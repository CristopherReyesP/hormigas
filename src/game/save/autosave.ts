// Autosave: every AUTOSAVE_INTERVAL_S of game time, at each dawn, and when
// the page is hidden or closed. On phones the OS kills backgrounded tabs
// without warning, so `visibilitychange` (to hidden) and `pagehide` are the
// saves that matter most: both write synchronously to localStorage.

import type { GameManager } from '../GameManager';
import { captureSave } from './snapshot';
import type { SaveStorage, SlotId } from './storage';

export const AUTOSAVE_INTERVAL_S = 60;
export const AUTOSAVE_SLOT: SlotId = 'auto';

type PageDocument = EventTarget & { visibilityState: DocumentVisibilityState };

export interface AutosaverOptions {
  intervalSeconds?: number;
  /** Where visibilitychange is heard (the document) */
  doc?: PageDocument | null;
  /** Where pagehide is heard (the window) */
  win?: EventTarget | null;
  /** A save failed: a short player-facing reason */
  onError?: (message: string) => void;
  onSaved?: (reason: AutosaveReason) => void;
}

export type AutosaveReason = 'intervalo' | 'amanecer' | 'segundo-plano' | 'manual';

interface RunInternals {
  gameOver: unknown;
  introClock: { isPlaying(): boolean };
  dayNightSystem: { getPhase(): 'day' | 'night' };
}

export class Autosaver {
  private elapsed = 0;
  private lastPhase: 'day' | 'night';
  private unsubscribe: (() => void) | null = null;
  private readonly interval: number;
  private readonly doc: PageDocument | null;
  private readonly win: EventTarget | null;

  private readonly game: GameManager;
  private readonly storage: SaveStorage;
  private readonly options: AutosaverOptions;

  constructor(game: GameManager, storage: SaveStorage, options: AutosaverOptions = {}) {
    this.game = game;
    this.storage = storage;
    this.options = options;
    this.interval = options.intervalSeconds ?? AUTOSAVE_INTERVAL_S;
    this.doc = options.doc !== undefined ? options.doc : typeof document !== 'undefined' ? document : null;
    this.win = options.win !== undefined ? options.win : typeof window !== 'undefined' ? window : null;
    this.lastPhase = this.run.dayNightSystem.getPhase();
  }

  private get run(): RunInternals {
    return this.game as unknown as RunInternals;
  }

  attach(): void {
    if (this.unsubscribe) return;
    const off = this.game.onTick((dt) => this.onTick(dt));
    this.doc?.addEventListener('visibilitychange', this.onVisibility);
    this.win?.addEventListener('pagehide', this.onPageHide);
    this.unsubscribe = () => {
      off();
      this.doc?.removeEventListener('visibilitychange', this.onVisibility);
      this.win?.removeEventListener('pagehide', this.onPageHide);
    };
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private onTick(dt: number): void {
    // The tick that ends the run: a lost or won run is not continued, so its autosave goes
    if (this.run.gameOver) {
      this.saveNow();
      return;
    }
    this.elapsed += dt;
    const phase = this.run.dayNightSystem.getPhase();
    const dawn = this.lastPhase === 'night' && phase === 'day';
    this.lastPhase = phase;
    if (dawn) {
      this.saveNow('amanecer');
    } else if (this.elapsed >= this.interval) {
      this.saveNow('intervalo');
    }
  }

  private readonly onVisibility = (): void => {
    if (this.doc?.visibilityState === 'hidden') this.saveNow('segundo-plano');
  };

  private readonly onPageHide = (): void => {
    this.saveNow('segundo-plano');
  };

  /** Write the autosave now; never throws. A finished run deletes it instead. */
  saveNow(reason: AutosaveReason = 'manual'): void {
    this.elapsed = 0;
    try {
      if (this.run.introClock.isPlaying()) return;
      if (this.run.gameOver) {
        void this.storage.remove(AUTOSAVE_SLOT).catch(() => false);
        return;
      }
      const save = captureSave(this.game);
      this.storage
        .write(AUTOSAVE_SLOT, save)
        .then((result) => {
          if (result.ok) this.options.onSaved?.(reason);
          else this.options.onError?.(`No se pudo autoguardar: ${result.error}`);
        })
        .catch(() => this.options.onError?.('No se pudo autoguardar'));
    } catch (e) {
      console.warn('[Autosaver] save failed', e);
      this.options.onError?.('No se pudo autoguardar');
    }
  }
}
