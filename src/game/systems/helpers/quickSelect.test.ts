import { describe, expect, it } from 'vitest';
import { World } from '../../../engine/ecs/World';
import { createAnt, createBeetle, createNest } from '../../entities/factories';
import { AntRole, COMPONENT, Layer, type LayerComponent } from '../../components/components';
import { FactionId } from '../../factions/factions';
import { HUMAN_QUICK_SELECT_KINDS, QUICK_SELECT_KINDS, quickSelectIds, quickSelectInfo, sameMembers } from './quickSelect';
import { createPlayerHumanUnit } from '../../races/human/humanPlayerFactories';

function setup() {
  const world = new World();
  const below = (id: number) => {
    world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
    return id;
  };
  // Far apart on purpose: the bar picks across the whole map, not just the screen
  const soldiers = [createAnt(world, 5, 5, AntRole.Soldier), createAnt(world, 90, 70, AntRole.Soldier)];
  const workers = [createAnt(world, 30, 30, AntRole.Worker), createAnt(world, 31, 30, AntRole.Worker), createAnt(world, 60, 10, AntRole.Worker)];
  const scout = createAnt(world, 40, 44, AntRole.Scout);
  const buried = below(createAnt(world, 20, 20, AntRole.Soldier));
  const nurse = below(createAnt(world, 21, 20, AntRole.Nurse));
  createBeetle(world, 12, 12);
  createNest(world, 50, 50);
  return { world, soldiers, workers, scout, buried, nurse };
}

describe('quick-select bar', () => {
  it('offers Soldados, Obreras, Exploradoras and Todas, in that order', () => {
    expect(QUICK_SELECT_KINDS).toEqual(['soldier', 'worker', 'scout', 'all']);
  });

  it('counts each caste on the layer in view, across the whole map', () => {
    const { world } = setup();
    const info = quickSelectInfo(world, Layer.Surface, []);
    expect(info.map(({ kind, count }) => [kind, count])).toEqual([
      ['soldier', 2],
      ['worker', 3],
      ['scout', 1],
      ['all', 6],
    ]);
    const below = quickSelectInfo(world, Layer.Underground, []);
    expect(below.find((c) => c.kind === 'soldier')?.count).toBe(1);
    expect(below.find((c) => c.kind === 'all')?.count).toBe(2);
  });

  it('selects every own ant of the caste on that layer, and nothing else', () => {
    const { world, soldiers, workers, scout, buried } = setup();
    expect([...quickSelectIds(world, 'soldier', Layer.Surface)].sort()).toEqual([...soldiers].sort());
    expect([...quickSelectIds(world, 'worker', Layer.Surface)].sort()).toEqual([...workers].sort());
    expect(quickSelectIds(world, 'scout', Layer.Surface)).toEqual([scout]);
    expect(quickSelectIds(world, 'soldier', Layer.Underground)).toEqual([buried]);
    // Todas: every own ant up here; no wildlife, no nest
    expect([...quickSelectIds(world, 'all', Layer.Surface)].sort()).toEqual([...soldiers, ...workers, scout].sort());
  });

  it('leaves out ants of another faction', () => {
    const { world, soldiers } = setup();
    createAnt(world, 7, 7, AntRole.Soldier, FactionId.RIVAL);
    expect([...quickSelectIds(world, 'soldier', Layer.Surface)].sort()).toEqual([...soldiers].sort());
  });

  it('lights the chip whose ants are exactly the selection', () => {
    const { world, soldiers, workers } = setup();
    const lit = (selection: number[]) => quickSelectInfo(world, Layer.Surface, selection).filter((c) => c.selected).map((c) => c.kind);
    expect(lit([...soldiers].reverse())).toEqual(['soldier']);
    expect(lit([soldiers[0]])).toEqual([]);
    expect(lit([...soldiers, workers[0]])).toEqual([]);
    expect(lit([])).toEqual([]);
  });

  it('compares selections as sets', () => {
    expect(sameMembers([1, 2, 3], [3, 1, 2])).toBe(true);
    expect(sameMembers([1, 2], [1, 2, 3])).toBe(false);
    expect(sameMembers([], [])).toBe(false);
  });
});

describe("quick-select keyed on the player's own unit kinds", () => {
  it("a Human player's bar counts and picks Human units by type", () => {
    const world = new World();
    const soldier = createPlayerHumanUnit(world, 'soldier', 10, 10);
    const tank = createPlayerHumanUnit(world, 'tank', 40, 40);
    createPlayerHumanUnit(world, 'builder', 20, 20);
    const counts = quickSelectInfo(world, Layer.Surface, [soldier], HUMAN_QUICK_SELECT_KINDS).map((c) => [c.kind, c.count, c.selected]);
    expect(counts).toEqual([
      ['human-soldier', 1, true],
      ['human-marksman', 0, false],
      ['human-tank', 1, false],
      ['human-builder', 1, false],
      ['all', 3, false],
    ]);
    expect(quickSelectIds(world, 'human-tank', Layer.Surface)).toEqual([tank]);
  });
});
