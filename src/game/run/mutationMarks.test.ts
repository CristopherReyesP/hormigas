import { describe, expect, it } from 'vitest';
import { ANT_MARK_IDS } from '../../engine/renderer/sprites/antMarks';
import { MUTATION_DEFINITIONS, MUTATION_IDS } from './MutationDefinitions';
import { colonyMarks } from './mutationMarks';
import { RunModifiers } from './RunModifiers';

describe('colony mutation marks', () => {
  it('gives every mutation a mark the sprite atlas can draw', () => {
    for (const id of MUTATION_IDS) {
      expect(ANT_MARK_IDS as readonly string[], id).toContain(MUTATION_DEFINITIONS[id].mark);
    }
  });

  it('counts one stack per pick of the same mutation', () => {
    const marks = colonyMarks(['acid_mandibles', 'wing_stubs', 'acid_mandibles']);
    expect(marks.get('chartreuse_jaws')).toBe(2);
    expect(marks.get('wing_stubs')).toBe(1);
    expect(marks.size).toBe(2);
    expect(colonyMarks([]).size).toBe(0);
  });

  it('keeps the same mark set until a mutation is applied (no per-frame rebuild)', () => {
    const run = new RunModifiers();
    const before = run.getColonyMarks();
    expect(run.getColonyMarks()).toBe(before);
    run.apply('hive_mind');
    const after = run.getColonyMarks();
    expect(after).not.toBe(before);
    expect(after.get('glowing_antenna_tips')).toBe(1);
    expect(run.getColonyMarks()).toBe(after);
  });
});
