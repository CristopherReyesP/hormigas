import { describe, expect, it } from 'vitest';
import { AntRole } from '../../../game/components/components';
import { ANT_MARK_IDS, antMarkKey, antSheetKey, marksForRole, type AntMarkId } from './antMarks';

const marks = (entries: Array<[AntMarkId, number]>) => new Map<AntMarkId, number>(entries);

describe('ant mark sets (atlas variant keys)', () => {
  it('has no key for an unmutated colony', () => {
    expect(antMarkKey(new Map())).toBe('');
  });

  it('keys a set by its marks and stacks, not by the order they were picked', () => {
    const a = marks([['pulsing_vein', 1], ['leg_spurs', 2]]);
    const b = marks([['leg_spurs', 2], ['pulsing_vein', 1]]);
    expect(antMarkKey(a)).toBe(antMarkKey(b));
    expect(antMarkKey(a)).not.toBe(antMarkKey(marks([['pulsing_vein', 2], ['leg_spurs', 2]])));
    expect(antMarkKey(a)).not.toBe(antMarkKey(marks([['pulsing_vein', 1]])));
  });

  it('caps a mark at 3 stacks and ignores empty stacks', () => {
    expect(antMarkKey(marks([['leg_spurs', 7]]))).toBe(antMarkKey(marks([['leg_spurs', 3]])));
    expect(antMarkKey(marks([['leg_spurs', 0]]))).toBe('');
  });

  it('keeps only the marks that show on a caste', () => {
    const colony = marks([['chartreuse_jaws', 1], ['wing_stubs', 1], ['swollen_pale_gaster', 2], ['pulsing_vein', 1]]);
    expect([...marksForRole(colony, AntRole.Soldier).keys()].sort()).toEqual(['chartreuse_jaws', 'pulsing_vein']);
    expect([...marksForRole(colony, AntRole.Scout).keys()].sort()).toEqual(['pulsing_vein', 'wing_stubs']);
    expect([...marksForRole(colony, AntRole.Worker).keys()].sort()).toEqual(['pulsing_vein', 'swollen_pale_gaster']);
    expect([...marksForRole(colony, AntRole.Nurse).keys()]).toEqual(['pulsing_vein']);
  });

  it('only re-bakes a caste when a mark it shows changes', () => {
    const before = marks([['pulsing_vein', 1]]);
    const after = marks([['pulsing_vein', 1], ['chartreuse_jaws', 1]]);
    expect(antSheetKey(AntRole.Worker, true, before)).toBe(antSheetKey(AntRole.Worker, true, after));
    expect(antSheetKey(AntRole.Soldier, true, before)).not.toBe(antSheetKey(AntRole.Soldier, true, after));
    expect(antSheetKey(AntRole.Soldier, true, after)).not.toBe(antSheetKey(AntRole.Soldier, false, after));
    expect(antSheetKey(AntRole.Worker, true, before)).not.toBe(antSheetKey(AntRole.Scout, true, before));
  });

  it('gives every mark at least one caste', () => {
    for (const id of ANT_MARK_IDS) {
      const shown = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender]
        .filter(role => marksForRole(marks([[id, 1]]), role).size > 0);
      expect(shown.length, id).toBeGreaterThan(0);
    }
  });
});
