import type { AntMarkId, AntMarks } from '../../engine/renderer/sprites/antMarks';
import { MUTATION_DEFINITIONS, type MutationId } from './MutationDefinitions';

/** The marks a colony shows for its applied mutations: one stack per pick. */
export function colonyMarks(applied: readonly MutationId[]): AntMarks {
  const marks = new Map<AntMarkId, number>();
  for (const id of applied) {
    const mark = MUTATION_DEFINITIONS[id].mark;
    marks.set(mark, (marks.get(mark) ?? 0) + 1);
  }
  return marks;
}
