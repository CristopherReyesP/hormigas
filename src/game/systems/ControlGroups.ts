import type { EntityId } from '../../shared/types';
import { CONTROL_GROUP_DOUBLE_TAP_MS, CONTROL_GROUP_SLOTS } from '../../shared/constants';

/**
 * StarCraft control groups: Ctrl+digit binds the selected ants to a slot,
 * Shift+digit adds them, the digit recalls them, and the same digit twice in
 * quick succession also brings the camera to them. This only keeps the ids;
 * the GameManager selects them and moves the camera.
 */
export class ControlGroups {
  private groups = new Map<number, EntityId[]>();
  private lastTap: { slot: number; at: number } | null = null;

  /** Make `ids` group `slot`. Binding nothing changes nothing (as in StarCraft II). */
  bind(slot: number, ids: readonly EntityId[]): boolean {
    if (!isSlot(slot) || ids.length === 0) return false;
    this.groups.set(slot, [...new Set(ids)]);
    return true;
  }

  /** Add `ids` to group `slot`, keeping its order and never listing an ant twice. */
  add(slot: number, ids: readonly EntityId[]): boolean {
    if (!isSlot(slot) || ids.length === 0) return false;
    const group = this.groups.get(slot) ?? [];
    for (const id of ids) if (!group.includes(id)) group.push(id);
    this.groups.set(slot, group);
    return true;
  }

  /** The group's ants still alive; the dead are dropped for good, and an empty group is forgotten. */
  recall(slot: number, isAlive: (id: EntityId) => boolean): EntityId[] {
    const group = this.groups.get(slot);
    if (!group) return [];
    const living = group.filter(isAlive);
    if (living.length === 0) this.groups.delete(slot);
    else this.groups.set(slot, living);
    return [...living];
  }

  /** The ids bound to `slot` as they stand, without pruning. */
  members(slot: number): readonly EntityId[] {
    return this.groups.get(slot) ?? [];
  }

  /** Bound slots, ascending. */
  slots(): number[] {
    return [...this.groups.keys()].sort((a, b) => a - b);
  }

  /**
   * Record a press of `slot` at `nowMs`. True when it is the second press of
   * the same digit within CONTROL_GROUP_DOUBLE_TAP_MS; a double tap starts
   * the count over, so mashing a digit does not chain doubles.
   */
  tap(slot: number, nowMs: number): boolean {
    const last = this.lastTap;
    const double = last !== null && last.slot === slot && nowMs - last.at < CONTROL_GROUP_DOUBLE_TAP_MS;
    this.lastTap = double ? null : { slot, at: nowMs };
    return double;
  }
}

function isSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 1 && slot <= CONTROL_GROUP_SLOTS;
}
