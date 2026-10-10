import { describe, expect, it } from 'vitest';
import { CONTROL_GROUP_DOUBLE_TAP_MS } from '../../shared/constants';
import { ControlGroups } from './ControlGroups';

const alive = () => true;

describe('control groups', () => {
  it('binds a selection to a digit and recalls it', () => {
    const groups = new ControlGroups();
    expect(groups.bind(1, [4, 7, 9])).toBe(true);
    expect(groups.recall(1, alive)).toEqual([4, 7, 9]);
    expect(groups.recall(2, alive)).toEqual([]);
    expect(groups.slots()).toEqual([1]);
  });

  it('binding again replaces the group; binding nothing leaves it alone', () => {
    const groups = new ControlGroups();
    groups.bind(3, [1, 2]);
    groups.bind(3, [5]);
    expect(groups.recall(3, alive)).toEqual([5]);
    expect(groups.bind(3, [])).toBe(false);
    expect(groups.recall(3, alive)).toEqual([5]);
  });

  it('adds a selection to a group without doubling anyone', () => {
    const groups = new ControlGroups();
    groups.bind(2, [1, 2]);
    expect(groups.add(2, [2, 3])).toBe(true);
    expect(groups.recall(2, alive)).toEqual([1, 2, 3]);
    groups.add(5, [8]);
    expect(groups.recall(5, alive)).toEqual([8]);
  });

  it('prunes the dead on recall, and forgets a group nobody is left in', () => {
    const groups = new ControlGroups();
    groups.bind(1, [1, 2, 3]);
    const dead = new Set([2]);
    expect(groups.recall(1, (id) => !dead.has(id))).toEqual([1, 3]);
    expect(groups.members(1)).toEqual([1, 3]);
    dead.add(1).add(3);
    expect(groups.recall(1, (id) => !dead.has(id))).toEqual([]);
    expect(groups.slots()).toEqual([]);
  });

  it('ignores slots outside 1-9', () => {
    const groups = new ControlGroups();
    expect(groups.bind(0, [1])).toBe(false);
    expect(groups.bind(10, [1])).toBe(false);
    expect(groups.slots()).toEqual([]);
  });

  it('a second tap of the same digit inside the window is a double tap', () => {
    const groups = new ControlGroups();
    expect(groups.tap(1, 1000)).toBe(false);
    expect(groups.tap(1, 1000 + CONTROL_GROUP_DOUBLE_TAP_MS - 10)).toBe(true);
    // A third tap starts over, so mashing does not chain doubles
    expect(groups.tap(1, 1000 + CONTROL_GROUP_DOUBLE_TAP_MS)).toBe(false);
    expect(groups.tap(1, 5000)).toBe(false);
    expect(groups.tap(2, 5100)).toBe(false);
    expect(groups.tap(1, 5200)).toBe(false);
  });
});
