import { AntRole } from '../../game/components/components';
import type { CommandFeedback, FeedbackTarget, OrderFeedbackKind } from '../../game/commandFeedback';
import type { HumanUnitType } from '../../game/rival/humanBase';
import { ROLE_LABEL, ROLE_PLURAL } from './format';

/**
 * Words and buzzes for command feedback on a phone: the toast
 * ("5 soldados → atacar guarida"), the long-press label, and a short
 * vibration so the thumb feels the order land.
 */

const VERB: Record<OrderFeedbackKind, string> = {
  move: 'mover',
  attack: 'atacar',
  'attack-move': 'avanzar peleando',
  rally: 'volver al nido',
  mine: 'minar',
  gather: 'recolectar',
};

const TARGET: Record<FeedbackTarget, string> = {
  den: 'guarida',
  hive: 'colmena',
  spire: 'aguja',
  beetle: 'acorazado',
  cricket: 'saltador',
  'crystal-unit': 'unidad de cristal',
  'human-unit': 'humano',
  'human-building': 'edificio',
  enemy: 'enemigo',
};

const HUMAN_ONE: Record<HumanUnitType, string> = { soldier: 'soldado', marksman: 'tirador', tank: 'tanque', builder: 'constructor' };
const HUMAN_MANY: Record<HumanUnitType, string> = { soldier: 'soldados', marksman: 'tiradores', tank: 'tanques', builder: 'constructores' };

/** "3 soldados", "1 tanque", "5 unidades" (mixed types): a Human player's units */
function humanUnitsLabel(count: number, byType: Partial<Record<HumanUnitType, number>>): string {
  const types = (Object.keys(byType) as HumanUnitType[]).filter((type) => (byType[type] ?? 0) > 0);
  if (types.length !== 1) return `${count} ${count === 1 ? 'unidad' : 'unidades'}`;
  return `${count} ${(count === 1 ? HUMAN_ONE : HUMAN_MANY)[types[0]]}`;
}

/** "5 soldados", "1 obrera", "4 hormigas" (mixed castes) */
function unitsLabel(count: number, byRole: Partial<Record<AntRole, number>>): string {
  const roles = (Object.keys(byRole) as AntRole[]).filter((role) => (byRole[role] ?? 0) > 0);
  if (roles.length !== 1) return `${count} ${count === 1 ? 'hormiga' : 'hormigas'}`;
  return `${count} ${(count === 1 ? ROLE_LABEL : ROLE_PLURAL)[roles[0]].toLowerCase()}`;
}

export function feedbackText(event: CommandFeedback): string {
  if (event.type === 'caste-select') {
    const who = event.humanType
      ? humanUnitsLabel(event.count, { [event.humanType]: event.count })
      : unitsLabel(event.count, { [event.role]: event.count });
    return `${who} en pantalla`;
  }
  const human = Object.values(event.byHuman ?? {}).some((n) => (n ?? 0) > 0);
  const who = human ? humanUnitsLabel(event.count, event.byHuman ?? {}) : unitsLabel(event.count, event.byRole);
  const verb = event.order === 'attack' && event.target
    ? `${VERB.attack} ${TARGET[event.target]}`
    : event.order === 'rally' && human ? 'volver a la base'
    : event.order === 'gather' && event.resource ? `${VERB.gather} ${event.resource}` : VERB[event.order];
  return `${who} → ${verb}`;
}

/** navigator.vibrate patterns (ms): a tick to move, a double knock to attack */
export const HAPTIC_PATTERN = {
  select: 12,
  move: 18,
  attack: [30, 40, 30],
} as const satisfies Record<string, number | readonly number[]>;

export function hapticFor(event: CommandFeedback): number | readonly number[] {
  if (event.type === 'caste-select') return HAPTIC_PATTERN.select;
  return event.order === 'attack' || event.order === 'attack-move' ? HAPTIC_PATTERN.attack : HAPTIC_PATTERN.move;
}

/** Buzz when the browser can (Android Chrome); iOS Safari, desktops and blocked frames just skip it. */
export function vibrate(nav: { vibrate?: (pattern: number | number[]) => boolean } | undefined, pattern: number | readonly number[]): boolean {
  if (!nav || typeof nav.vibrate !== 'function') return false;
  try {
    return nav.vibrate(typeof pattern === 'number' ? pattern : [...pattern]);
  } catch {
    return false;
  }
}
