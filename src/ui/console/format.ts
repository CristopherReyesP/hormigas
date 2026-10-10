import { AntRole } from '../../game/components/components';
import { LEAPER_NAME } from '../../shared/wildlifeNames';
import type { IconName } from './pixelIcons';

/** Pictographs plus the variation selector, zero-width joiner and keycap that glue emoji together. */
const EMOJI = /\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|\u{20E3}/gu;

/** Game systems still prefix messages with OS emoji; the HUD shows pixel icons instead. */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim();
}

/** Seconds as m:ss (never negative). */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

export const ROLE_LABEL: Record<AntRole, string> = {
  [AntRole.Worker]: 'Obrera',
  [AntRole.Soldier]: 'Soldado',
  [AntRole.Scout]: 'Exploradora',
  [AntRole.Nurse]: 'Nodriza',
  [AntRole.Defender]: 'Defensora',
};

/** Pixel icon of each caste: breed buttons, rosters and egg chips. */
export const ROLE_ICON: Record<AntRole, IconName> = {
  [AntRole.Worker]: 'worker',
  [AntRole.Soldier]: 'sword',
  [AntRole.Scout]: 'eye',
  [AntRole.Nurse]: 'nurse',
  [AntRole.Defender]: 'shield',
};

/** What each caste does — selection panel and breeding tooltips. */
export const ROLE_BLURB: Record<AntRole, string> = {
  [AntRole.Worker]: 'Recolecta, acarrea y excava.',
  [AntRole.Soldier]: 'Pelea contra acorazados y defiende el nido.',
  [AntRole.Scout]: 'Explora lejos y despeja la niebla.',
  [AntRole.Nurse]: 'Cuida y alimenta los huevos.',
  [AntRole.Defender]: 'Monta guardia en las áreas de defensa del nido.',
};

export const ROLE_PLURAL: Record<AntRole, string> = {
  [AntRole.Worker]: 'Obreras',
  [AntRole.Soldier]: 'Soldados',
  [AntRole.Scout]: 'Exploradoras',
  [AntRole.Nurse]: 'Nodrizas',
  [AntRole.Defender]: 'Defensoras',
};

/** Every AntState value must appear here — a missing key leaks the raw enum. */
export const ANT_STATE_LABEL: Record<string, string> = {
  idle: 'En espera',
  searching: 'Buscando',
  going_to_food: 'Yendo a la comida',
  harvesting: 'Cosechando',
  returning_home: 'Volviendo al nido',
  fleeing: '¡Huyendo!',
  chasing_enemy: 'Persiguiendo enemigo',
  attacking_enemy: 'En combate',
  patrolling_nest: 'Patrullando',
  healing: 'Curándose',
  feeding_queen: 'Alimentando a la reina',
  tending_egg: 'Cuidando huevos',
  grooming_brood: 'Atendiendo larvas',
  fetching_food: 'Buscando comida en la despensa',
  going_to_dig_site: 'Yendo a excavar',
  excavating: 'Excavando',
  moving_egg: 'Trasladando un huevo',
  eating: 'Comiendo',
  hauling: 'Acarreando',
  scavenging: 'Carroñeando',
  moving: 'En marcha',
  guarding: 'De guardia',
  holding: 'Manteniendo posición',
  mining: 'Minando',
  farm_harvesting: 'Cosechando hongos',
};

export const BEETLE_STATE_LABEL: Record<string, string> = {
  roaming: 'Merodeando',
  chasing_food: 'Cazando comida',
  eating: 'Comiendo',
  chasing_ant: 'Persiguiendo hormiga',
  attacking: 'Atacando',
  retreating: 'Herido, se retira',
};

export const CRICKET_STATE_LABEL: Record<string, string> = {
  going_to_nest: 'Yendo al nido',
  stealing_food: 'Robando comida',
  retreating: 'Retirándose',
  attacking: 'Atacando',
};

export const FOOD_LABEL: Record<string, string> = {
  leaf: 'Hoja',
  mushroom: 'Hongo',
  giant_mushroom: 'Hongo gigante',
  beetle_meat: 'Carne de acorazado',
  cricket_meat: LEAPER_NAME.meat,
};

export const CARRY_LABEL: Record<string, string> = {
  leaf: 'hojas',
  mushroom: 'hongos',
  giant_mushroom: 'hongos',
  beetle_meat: 'carne',
  cricket_meat: 'carne',
  meat: 'carne',
  ore: 'mineral',
};
