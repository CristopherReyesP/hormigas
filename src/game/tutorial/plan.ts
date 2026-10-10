import type { GoalId } from './goals';

/** The ten lessons, in order. Their words and highlights live in src/ui/tutorial/steps.ts. */
export type StepId = 'camera' | 'select' | 'move' | 'gather' | 'nest' | 'breed' | 'minerals' | 'attack' | 'night' | 'wrap';

/** What the scenario stages when a step begins */
export type StageEffect = 'gift-soldiers' | 'practice-wave';

export interface StepPlan {
  id: StepId;
  /** Done in order: each goal waits for the player to really do it */
  goals: readonly GoalId[];
  enter?: StageEffect;
}

export const TUTORIAL_PLAN: readonly StepPlan[] = [
  { id: 'camera', goals: ['pan', 'zoom'] },
  // Hormi lends the soldiers here, so the touch troop bar has a «Soldados» chip to teach
  { id: 'select', goals: ['select-one', 'select-group'], enter: 'gift-soldiers' },
  { id: 'move', goals: ['move'] },
  { id: 'gather', goals: ['gather'] },
  { id: 'nest', goals: ['open-nest', 'dig', 'chamber'] },
  { id: 'breed', goals: ['breed', 'incubate'] },
  { id: 'minerals', goals: ['minerals'] },
  { id: 'attack', goals: ['select-soldiers', 'arm-attack', 'attack-den', 'den-destroyed'], enter: 'gift-soldiers' },
  { id: 'night', goals: ['repel-wave'], enter: 'practice-wave' },
  { id: 'wrap', goals: ['ack'] },
];
