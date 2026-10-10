// Night milestones of the endless run: pure rules, no World.
// Surviving nights never ends the run; some dawns celebrate instead and pay a reward.

import type { WaveReward } from './waveRewards';

/** The goal of the run, as the objectives panel and the race picker state it */
export const RUN_GOAL_TEXT = 'Haz crecer la colonia y sobrevive el mayor número de noches. Si muere la reina, pierdes.';
/** The same goal for a Human expedition, whose life is its command center */
export const HUMAN_RUN_GOAL_TEXT = 'Haz crecer la expedición y sobrevive el mayor número de noches. Si cae el Centro de Mando, pierdes.';

/** The goal of the run for the race the player picked */
export function runGoalText(playerRace: string): string {
  return playerRace === 'human' ? HUMAN_RUN_GOAL_TEXT : RUN_GOAL_TEXT;
}

/** The first celebrated night (the old end of the run, and the Crystal Queen's night) */
export const FIRST_NIGHT_MILESTONE = 7;
/** After the first one, a milestone every this many nights (12, 17, 22, ...) */
export const NIGHT_MILESTONE_EVERY = 5;

export interface NightMilestone {
  /** The night just survived */
  night: number;
  title: string;
  reward: WaveReward;
}

/** The milestone for having survived `night` nights, or null when that night is not one */
export function nightMilestone(night: number): NightMilestone | null {
  if (!Number.isInteger(night) || night < FIRST_NIGHT_MILESTONE) return null;
  if ((night - FIRST_NIGHT_MILESTONE) % NIGHT_MILESTONE_EVERY !== 0) return null;
  const title = night === FIRST_NIGHT_MILESTONE ? `¡Sobreviviste ${night} noches!` : `¡Noche ${night}!`;
  return { night, title, reward: { minerals: 20 * night, food: 15 * night } };
}
