import { describe, expect, it } from 'vitest';
import {
  CRYSTAL_HIVE_SUPPLY,
  CRYSTAL_MAX_SUPPLY,
  CRYSTAL_PLAYER_UNITS,
  CRYSTAL_STRUCTURES,
  crystalWaveBeetles,
  productionTime,
  stepQueue,
  supplyCap,
  supplyUsed,
  unitForSpire,
} from './crystalPlayerRules';

describe('Crystal player rules', () => {
  it('each spire crystallizes one unit type; the extractor none', () => {
    expect(unitForSpire('forge')).toBe('drone');
    expect(unitForSpire('prism')).toBe('sentinel');
    expect(unitForSpire('extractor')).toBeNull();
  });

  it('each floor is one more production line', () => {
    const one = productionTime('drone', 1);
    expect(one).toBe(CRYSTAL_PLAYER_UNITS.drone.time);
    expect(productionTime('drone', 2)).toBeCloseTo(one / 2);
    expect(productionTime('drone', 9)).toBeCloseTo(one / 3); // three floors at most
  });

  it('the supply cap comes from the Hive plus every floor of every finished spire', () => {
    expect(supplyCap(true, [])).toBe(CRYSTAL_HIVE_SUPPLY);
    const perFloor = CRYSTAL_STRUCTURES.forge.supply;
    expect(supplyCap(true, [{ kind: 'forge', floors: 2, complete: true }])).toBe(CRYSTAL_HIVE_SUPPLY + 2 * perFloor);
    // A spire still crystallizing and an extractor add nothing
    expect(supplyCap(true, [{ kind: 'forge', floors: 1, complete: false }, { kind: 'extractor', floors: 1, complete: true }])).toBe(CRYSTAL_HIVE_SUPPLY);
    expect(supplyCap(false, [{ kind: 'forge', floors: 3, complete: true }])).toBe(0);
    const many = Array.from({ length: 30 }, () => ({ kind: 'prism' as const, floors: 3, complete: true }));
    expect(supplyCap(true, many)).toBe(CRYSTAL_MAX_SUPPLY);
    expect(supplyUsed(['drone', 'drone', 'sentinel'])).toBe(2 * CRYSTAL_PLAYER_UNITS.drone.supply + CRYSTAL_PLAYER_UNITS.sentinel.supply);
  });

  it('the queue crystallizes its first unit after its time', () => {
    let state = { queue: ['drone' as const, 'drone' as const], progress: 0 };
    const time = productionTime('drone', 1);
    let step = stepQueue(state, time - 1, 1, 10);
    expect(step.done).toBeNull();
    state = step.state as typeof state;
    step = stepQueue(state, 1, 1, 10);
    expect(step.done).toBe('drone');
    expect(step.state.queue).toEqual(['drone']);
    expect(step.state.progress).toBe(0);
  });

  it('the queue waits at the supply cap', () => {
    const state = { queue: ['sentinel' as const], progress: 5 };
    const step = stepQueue(state, 100, 1, CRYSTAL_PLAYER_UNITS.sentinel.supply - 1);
    expect(step.done).toBeNull();
    expect(step.blocked).toBe('supply');
    expect(step.state.progress).toBe(5);
  });

  it('night waves bring fewer beetles against the Crystal Hive, never none', () => {
    expect(crystalWaveBeetles(0)).toBe(0);
    expect(crystalWaveBeetles(1)).toBe(1);
    expect(crystalWaveBeetles(10)).toBe(4);
  });
});
