import { describe, expect, it } from 'vitest';
import { evolutionDue, evolutionProgress, killMarkForEvolution, killsForNextEvolution } from './KillEvolution';

describe('evolutions earned by kills', () => {
  it('each one costs 4 kills more than the last: 4, 8, 12, 16', () => {
    expect([0, 1, 2, 3].map(killsForNextEvolution)).toEqual([4, 8, 12, 16]);
    expect([0, 1, 2, 3].map(killMarkForEvolution)).toEqual([4, 12, 24, 40]);
  });

  it('is due once the tally reaches the mark, not before', () => {
    expect(evolutionDue(3, 0)).toBe(false);
    expect(evolutionDue(4, 0)).toBe(true);
    expect(evolutionDue(11, 1)).toBe(false);
    expect(evolutionDue(12, 1)).toBe(true);
  });

  it('shows the progress since the last evolution', () => {
    expect(evolutionProgress(0, 0)).toEqual({ kills: 0, needed: 4 });
    expect(evolutionProgress(7, 1)).toEqual({ kills: 3, needed: 8 });
    expect(evolutionProgress(40, 1)).toEqual({ kills: 8, needed: 8 });
  });
});
