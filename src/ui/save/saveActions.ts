// Save and load as the UI does them: storage results become toasts, never exceptions.

import type { GameManager } from '../../game/GameManager';
import type { SaveFile } from '../../game/save/format';
import { captureSave } from '../../game/save/snapshot';
import type { SaveStorage, SlotId } from '../../game/save/storage';
import { OLD_VERSION_TEXT, slotTitle } from './saveText';
import { showToast } from './toasts';

export async function saveToSlot(storage: SaveStorage, game: GameManager, slot: SlotId): Promise<boolean> {
  try {
    const result = await storage.write(slot, captureSave(game));
    if (result.ok) {
      showToast(`Partida guardada en ${slotTitle(slot)}`, 'success');
      return true;
    }
    showToast(`No se pudo guardar: ${result.error}`, 'error');
  } catch (e) {
    console.warn('[save] failed', e);
    showToast('No se pudo guardar la partida', 'error');
  }
  return false;
}

/** The slot's save, or null (a toast says why) */
export async function readSlot(storage: SaveStorage, slot: SlotId): Promise<SaveFile | null> {
  try {
    const result = await storage.read(slot);
    if (result.ok) return result.save;
    if (result.reason === 'incompatible') showToast(OLD_VERSION_TEXT, 'error');
    else if (result.reason === 'empty') showToast(`${slotTitle(slot)} está vacía`, 'error');
    else if (result.reason === 'corrupt') showToast('La partida guardada está dañada', 'error');
    else showToast('No se pudo leer la partida', 'error');
  } catch {
    showToast('No se pudo leer la partida', 'error');
  }
  return null;
}

export async function deleteSlot(storage: SaveStorage, slot: SlotId): Promise<boolean> {
  const ok = await storage.remove(slot).catch(() => false);
  showToast(ok ? `${slotTitle(slot)} borrada` : 'No se pudo borrar la partida', ok ? 'info' : 'error');
  return ok;
}
