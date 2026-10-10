import { GOAL_CHECKS, type GoalId, type TutorialSnapshot } from './goals';
import type { StepId, StepPlan } from './plan';

/**
 * The tutorial's step state machine. Each step is a list of goals; a goal is
 * met only by what the player really does (judged on snapshots of the run,
 * see goals.ts), never by a "Next" button. When the last goal of a step is
 * met the step celebrates (a star) until next() moves on. skipStep() and
 * exit() are always available.
 *
 *   active ──goals met──▶ celebrate ──next()──▶ active (next step) … ──▶ done
 *      └──────────────── skipStep() ─────────────┘           exit() ──▶ exited
 */

export type TutorialPhase = 'active' | 'celebrate' | 'done' | 'exited';

export interface TutorialState {
  stepIndex: number;
  goalIndex: number;
  phase: TutorialPhase;
  /** Steps completed by doing them (skipped steps earn none) */
  stars: number;
  skipped: StepId[];
}

export type TutorialEvent =
  | { type: 'goal-done'; goal: GoalId }
  | { type: 'step-done'; step: StepId }
  | { type: 'step-start'; step: StepId; index: number }
  | { type: 'finished' }
  | { type: 'exited' };

export class TutorialMachine {
  private readonly plan: readonly StepPlan[];
  private current: TutorialState = { stepIndex: 0, goalIndex: 0, phase: 'active', stars: 0, skipped: [] };
  /** The snapshot the current goal started from; null until the next update */
  private baseline: TutorialSnapshot | null = null;
  private acked = false;

  constructor(plan: readonly StepPlan[]) {
    this.plan = plan;
    if (plan.length === 0) this.current.phase = 'done';
  }

  get state(): TutorialState {
    return { ...this.current, skipped: [...this.current.skipped] };
  }

  get step(): StepPlan | null {
    return this.plan[this.current.stepIndex] ?? null;
  }

  get goal(): GoalId | null {
    return this.step?.goals[this.current.goalIndex] ?? null;
  }

  /** The player confirmed (the wrap-up's button); judged on the next update */
  ack(): void {
    this.acked = true;
  }

  /** Judge the current goal (and any that the same snapshot also meets) */
  update(snapshot: TutorialSnapshot): TutorialEvent[] {
    if (this.current.phase !== 'active') return [];
    const now: TutorialSnapshot = { ...snapshot, acked: snapshot.acked || this.acked };
    if (!this.baseline) this.baseline = now;
    const events: TutorialEvent[] = [];
    const step = this.step!;
    while (this.current.phase === 'active') {
      const goal = step.goals[this.current.goalIndex];
      if (!GOAL_CHECKS[goal](now, this.baseline)) break;
      events.push({ type: 'goal-done', goal });
      this.baseline = now;
      if (this.current.goalIndex + 1 < step.goals.length) {
        this.current.goalIndex++;
      } else {
        this.current.phase = 'celebrate';
        this.current.stars++;
        events.push({ type: 'step-done', step: step.id });
      }
    }
    return events;
  }

  /** After the celebration: the next step, or the end */
  next(): TutorialEvent[] {
    if (this.current.phase !== 'celebrate') return [];
    return this.advance();
  }

  /** Saltar paso: on to the next step without a star (a star already earned stays) */
  skipStep(): TutorialEvent[] {
    if (this.current.phase === 'done' || this.current.phase === 'exited') return [];
    if (this.current.phase === 'active') this.current.skipped.push(this.step!.id);
    return this.advance();
  }

  /** Salir del tutorial */
  exit(): TutorialEvent[] {
    if (this.current.phase === 'done' || this.current.phase === 'exited') return [];
    this.current.phase = 'exited';
    return [{ type: 'exited' }];
  }

  private advance(): TutorialEvent[] {
    this.baseline = null;
    this.acked = false;
    const index = this.current.stepIndex + 1;
    if (index >= this.plan.length) {
      this.current.phase = 'done';
      return [{ type: 'finished' }];
    }
    this.current.stepIndex = index;
    this.current.goalIndex = 0;
    this.current.phase = 'active';
    return [{ type: 'step-start', step: this.plan[index].id, index }];
  }
}
