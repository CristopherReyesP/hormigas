import { useCallback, useEffect, useRef } from 'react';
import { GameManager } from '../../game/GameManager';
import { Autosaver } from '../../game/save/autosave';
import type { SaveFile } from '../../game/save/format';
import { restoreSave } from '../../game/save/snapshot';
import { sanitizeRunSetup } from '../../game/run/RunSetup';
import type { SaveStorage } from '../../game/save/storage';
import { showToast } from './toasts';

/** Autosave the running game (60 s, dawn, page hidden); the returned function saves now (Salir al menú) */
export function useAutosave(game: GameManager | null, storage: SaveStorage): () => void {
  const ref = useRef<Autosaver | null>(null);
  useEffect(() => {
    if (!game) return;
    const saver = new Autosaver(game, storage, { onError: (message) => showToast(message, 'error') });
    saver.attach();
    ref.current = saver;
    return () => {
      saver.detach();
      if (ref.current === saver) ref.current = null;
    };
  }, [game, storage]);
  return useCallback(() => ref.current?.saveNow(), []);
}

/**
 * A GameCanvas factory that builds the saved run. If the save does not fit
 * this build it says so, calls `onFail` (back to the start screen) and hands
 * the canvas a throwaway new run so nothing crashes meanwhile.
 */
export function restoreFactory(save: SaveFile, onFail: () => void): (canvas: HTMLCanvasElement) => GameManager {
  return (canvas) => {
    try {
      const game = restoreSave(canvas, save);
      showToast('Partida cargada', 'success');
      return game;
    } catch (e) {
      console.warn('[save] restore failed', e);
      showToast('La partida guardada no se pudo cargar', 'error');
      setTimeout(onFail, 0);
      return new GameManager(canvas, sanitizeRunSetup(save.state?.setup));
    }
  };
}
