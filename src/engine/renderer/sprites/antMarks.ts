// Mutation marks: the visible scars a run's mutations leave on the Swarm
// sprites. A colony's marks are a set of mark ids with stack counts (1..3);
// the atlas bakes one sheet per caste and per set of marks that caste shows,
// so a pick costs one bake and nothing per frame.
import { AntRole } from '../../../game/components/components';

export const ANT_MARK_IDS = [
  'chartreuse_jaws', 'pulsing_vein', 'swollen_pale_gaster', 'leg_spurs', 'pink_stitches',
  'dark_gaster_rings', 'thorax_pustules', 'thick_head_plate', 'wing_stubs', 'glowing_antenna_tips',
] as const;
export type AntMarkId = typeof ANT_MARK_IDS[number];

/** Mark id → stacks (1..3; more is drawn as 3). */
export type AntMarks = ReadonlyMap<AntMarkId, number>;

export const NO_MARKS: AntMarks = new Map();

export const MAX_MARK_STACKS = 3;

const ALL_CASTES: readonly AntRole[] = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender];

/** Which castes show each mark (the mutation's own wording: soldiers' jaws, scouts' wings…). */
const MARK_CASTES: Record<AntMarkId, readonly AntRole[]> = {
  chartreuse_jaws: [AntRole.Soldier],
  pulsing_vein: ALL_CASTES,
  swollen_pale_gaster: [AntRole.Worker],
  leg_spurs: ALL_CASTES,
  pink_stitches: ALL_CASTES,
  dark_gaster_rings: ALL_CASTES,
  thorax_pustules: ALL_CASTES,
  thick_head_plate: [AntRole.Soldier],
  wing_stubs: [AntRole.Scout],
  glowing_antenna_tips: ALL_CASTES,
};

/** The marks `role` shows, stacks clamped to 1..3 (marks with no stacks dropped). */
export function marksForRole(marks: AntMarks, role: AntRole): AntMarks {
  const out = new Map<AntMarkId, number>();
  for (const id of ANT_MARK_IDS) {
    const stacks = Math.min(MAX_MARK_STACKS, Math.floor(marks.get(id) ?? 0));
    if (stacks > 0 && MARK_CASTES[id].includes(role)) out.set(id, stacks);
  }
  return out;
}

/** Canonical key of a mark set: same marks and stacks → same key, whatever the pick order. */
export function antMarkKey(marks: AntMarks): string {
  const parts: string[] = [];
  for (const id of ANT_MARK_IDS) {
    const stacks = Math.min(MAX_MARK_STACKS, Math.floor(marks.get(id) ?? 0));
    if (stacks > 0) parts.push(`${id}${stacks}`);
  }
  return parts.join('+');
}

/** Atlas sheet key of one caste: changes only when a mark that caste shows changes. */
export function antSheetKey(role: AntRole, shadow: boolean, marks: AntMarks): string {
  return `${role}|${shadow ? 's' : '-'}|${antMarkKey(marksForRole(marks, role))}`;
}

/** Stacks of `id` in `marks` (0 when absent), clamped to the drawable range. */
export function markStacks(marks: AntMarks, id: AntMarkId): number {
  return Math.min(MAX_MARK_STACKS, Math.max(0, Math.floor(marks.get(id) ?? 0)));
}
