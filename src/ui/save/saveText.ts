// Player-facing words for saves (neutral Spanish).

import type { SaveMeta } from '../../game/save/format';
import type { SlotId } from '../../game/save/storage';
import { raceName, rivalName } from '../racePicker/races';

export const OLD_VERSION_TEXT = 'Partida de una versión anterior';

export function slotTitle(slot: SlotId): string {
  return slot === 'auto' ? 'Autoguardado' : `Ranura ${slot.slice(4)}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** dd/mm/aaaa hh:mm, local time */
export function formatSavedAt(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function describeSave(meta: SaveMeta): { matchup: string; detail: string; date: string } {
  const ants = Number(meta.ants) || 0;
  return {
    matchup: `${raceName(meta.playerRace)} vs ${rivalName(meta.rivalRace)}`,
    detail: `Día ${meta.day} (${meta.phase === 'night' ? 'noche' : 'día'}) · ${ants} ${ants === 1 ? 'hormiga' : 'hormigas'}`,
    date: formatSavedAt(meta.savedAt),
  };
}
