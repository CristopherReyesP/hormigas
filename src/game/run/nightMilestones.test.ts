import { describe, expect, it } from 'vitest';
import { FIRST_NIGHT_MILESTONE, NIGHT_MILESTONE_EVERY, RUN_GOAL_TEXT, nightMilestone } from './nightMilestones';

describe('night milestones', () => {
  it('celebrates the seventh night with a reward', () => {
    const milestone = nightMilestone(7);
    expect(milestone).toMatchObject({ night: 7, title: '¡Sobreviviste 7 noches!' });
    expect(milestone!.reward.minerals).toBeGreaterThan(0);
    expect(milestone!.reward.food).toBeGreaterThan(0);
  });

  it('keeps celebrating every 5 nights after the seventh', () => {
    expect(FIRST_NIGHT_MILESTONE).toBe(7);
    expect(NIGHT_MILESTONE_EVERY).toBe(5);
    const nights = Array.from({ length: 40 }, (_, i) => i).filter((n) => nightMilestone(n) !== null);
    expect(nights).toEqual([7, 12, 17, 22, 27, 32, 37]);
    expect(nightMilestone(12)?.title).toBe('¡Noche 12!');
    expect(nightMilestone(17)?.title).toBe('¡Noche 17!');
  });

  it('pays more for later milestones', () => {
    const early = nightMilestone(7)!.reward;
    const late = nightMilestone(12)!.reward;
    expect(late.minerals).toBeGreaterThan(early.minerals);
    expect(late.food).toBeGreaterThan(early.food);
  });

  it('ignores nonsense nights', () => {
    for (const n of [-1, 0, 1, 6, 8, Number.NaN, Number.POSITIVE_INFINITY]) expect(nightMilestone(n)).toBeNull();
  });

  it('states the endless goal in neutral Spanish', () => {
    expect(RUN_GOAL_TEXT).toBe('Haz crecer la colonia y sobrevive el mayor número de noches. Si muere la reina, pierdes.');
  });
});
