/**
 * First-game coach marks on a touch screen: three light pointers at the
 * quick-select bar, the hint line and the Atacar button. They show once;
 * the flag lives in localStorage. The full tutorial lives elsewhere.
 */

export const COACH_KEY = 'hormigas.coach.touch-command.v1';

/** Where a step points: the element carrying data-coach="<anchor>" (Atacar is the card's data-cmd="attack") */
export type CoachAnchor = 'quick-bar' | 'hint-line' | 'attack';

export interface CoachStep {
  anchor: CoachAnchor;
  title: string;
  text: string;
}

export const COACH_STEPS: readonly CoachStep[] = [
  {
    anchor: 'quick-bar',
    title: 'Elige tus tropas',
    text: 'Toca «Soldados», «Obreras» o «Todas» para elegir a todas esas hormigas del mapa. Toca otra vez para ir hacia ellas.',
  },
  {
    anchor: 'hint-line',
    title: 'Qué hace tu toque',
    text: 'Esta línea siempre dice qué pasa si tocas el mapa. La ✕ suelta la selección.',
  },
  {
    anchor: 'attack',
    title: 'Da órdenes',
    text: 'Toca el suelo para mover. Para atacar, toca al enemigo, o pulsa Atacar y luego tócalo.',
  },
];

/** A Human player's first steps: the same pointers, in the words of their units */
export const HUMAN_COACH_STEPS: readonly CoachStep[] = [
  {
    anchor: 'quick-bar',
    title: 'Elige tus tropas',
    text: 'Toca «Soldados», «Constructores» o «Todas» para elegir a todas esas unidades del mapa. Toca otra vez para ir hacia ellas.',
  },
  COACH_STEPS[1],
  COACH_STEPS[2],
];

/** The steps for the player's race */
export function coachSteps(race: 'swarm' | 'human'): readonly CoachStep[] {
  return race === 'human' ? HUMAN_COACH_STEPS : COACH_STEPS;
}

/** The CSS selector of a step's target */
export function coachSelector(anchor: CoachAnchor): string {
  return anchor === 'attack' ? '[data-cmd="attack"]' : `[data-coach="${anchor}"]`;
}

/** localStorage, or null where reading it throws (blocked cookies, some private modes) */
export function coachStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** True once the marks were dismissed; also when storage cannot be read, so they never nag on every run. */
export function hasSeenCoach(storage: Storage | null): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(COACH_KEY) === '1';
  } catch {
    return true;
  }
}

export function markCoachSeen(storage: Storage | null): void {
  try {
    storage?.setItem(COACH_KEY, '1');
  } catch {
    // Storage full or blocked: the marks just show again next run
  }
}
