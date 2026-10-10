import { describe, expect, it } from 'vitest';
import { COACH_KEY, COACH_STEPS, hasSeenCoach, markCoachSeen } from './coachMarks';

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

const broken = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
} as unknown as Storage;

describe('first-game coach marks', () => {
  it('points at the quick-select bar, the hint line and the attack button, in that order', () => {
    expect(COACH_STEPS.map((s: { anchor: string }) => s.anchor)).toEqual(['quick-bar', 'hint-line', 'attack']);
    for (const step of COACH_STEPS) expect(step.text.length).toBeGreaterThan(10);
  });

  it('shows once: the flag sticks in localStorage', () => {
    const store = memory();
    expect(hasSeenCoach(store)).toBe(false);
    markCoachSeen(store);
    expect(store.getItem(COACH_KEY)).toBe('1');
    expect(hasSeenCoach(store)).toBe(true);
  });

  it('never throws when storage is blocked; then it counts as already seen so it never nags', () => {
    expect(() => markCoachSeen(broken)).not.toThrow();
    expect(hasSeenCoach(broken)).toBe(true);
    expect(hasSeenCoach(null)).toBe(true);
  });
});
