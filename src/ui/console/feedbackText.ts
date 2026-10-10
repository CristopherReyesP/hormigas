import { AntRole } from '../../game/components/components';
import type { CommandFeedback, FeedbackTarget, OrderFeedbackKind } from '../../game/commandFeedback';
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

/** "5 soldados", "1 obrera", "4 hormigas" (mixed castes) */
function unitsLabel(count: number, byRole: Partial<Record<AntRole, number>>): string {
  const roles = (Object.keys(byRole) as AntRole[]).filter((role) => (byRole[role] ?? 0) > 0);
  if (roles.length !== 1) return `${count} ${count === 1 ? 'hormiga' : 'hormigas'}`;
  return `${count} ${(count === 1 ? ROLE_LABEL : ROLE_PLURAL)[roles[0]].toLowerCase()}`;
}

export function feedbackText(event: CommandFeedback): string {
  if (event.type === 'caste-select') {
    return `${unitsLabel(event.count, { [event.role]: event.count })} en pantalla`;
  }
  const verb = event.order === 'attack' && event.target ? `${VERB.attack} ${TARGET[event.target]}` : VERB[event.order];
  return `${unitsLabel(event.count, event.byRole)} → ${verb}`;
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
