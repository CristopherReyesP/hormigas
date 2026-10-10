import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { createAnt, createBeetle, createFood, createNest } from '../entities/factories';
import { AntRole, COMPONENT, Layer, type LayerComponent, type SelectableComponent } from '../components/components';
import { SelectionSystem } from './SelectionSystem';

function setup() {
  const world = new World();
  const selection = new SelectionSystem(world);
  const isFlagged = (id: number) => world.getComponent<SelectableComponent>(id, COMPONENT.SELECTABLE)!.selected;
  const below = (id: number) => {
    world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
    return id;
  };
  return { world, selection, isFlagged, below };
}

const BOX = { minX: 10, minY: 10, maxX: 20, maxY: 16 };

describe('box selection', () => {
  it('takes only own ants on the current layer: no wildlife, no food, no nest', () => {
    const { world, selection, isFlagged, below } = setup();
    const inside = [
      createAnt(world, 11, 11, AntRole.Worker),
      createAnt(world, 15, 13, AntRole.Soldier),
      createAnt(world, 19.6, 15.8, AntRole.Scout),
    ];
    const outside = createAnt(world, 25, 13, AntRole.Soldier);
    const underground = below(createAnt(world, 14, 14, AntRole.Worker));
    const beetle = createBeetle(world, 12, 12);
    const food = createFood(world, 13, 12, 50);
    const nest = createNest(world, 16, 14);

    expect(selection.selectInBox(BOX, Layer.Surface)).toBe(3);
    expect([...selection.getSelectedIds()].sort()).toEqual([...inside].sort());
    for (const id of inside) expect(isFlagged(id)).toBe(true);
    for (const id of [outside, underground, beetle, food, nest]) expect(isFlagged(id)).toBe(false);
    expect(selection.getSelectedEntityId()).toBeNull(); // several units: no single entity
  });

  it('selects the ants below when the player looks at the nest', () => {
    const { world, selection, below } = setup();
    createAnt(world, 12, 12, AntRole.Worker);
    const nurse = below(createAnt(world, 13, 12, AntRole.Nurse));
    expect(selection.selectInBox(BOX, Layer.Underground)).toBe(1);
    expect(selection.getSelectedIds()).toEqual([nurse]);
  });

  it('an empty box keeps the current selection', () => {
    const { world, selection } = setup();
    const ant = createAnt(world, 30, 30, AntRole.Worker);
    selection.selectAt(30, 30, { layer: Layer.Surface });
    expect(selection.selectInBox(BOX, Layer.Surface)).toBe(0);
    expect(selection.getSelectedIds()).toEqual([ant]);
  });

  it('shift adds to the group, shift-click toggles one ant', () => {
    const { world, selection, isFlagged } = setup();
    const a = createAnt(world, 12, 12, AntRole.Worker);
    const b = createAnt(world, 30, 30, AntRole.Soldier);
    selection.selectInBox(BOX, Layer.Surface);
    selection.selectInBox({ minX: 28, minY: 28, maxX: 32, maxY: 32 }, Layer.Surface, true);
    expect([...selection.getSelectedIds()].sort()).toEqual([a, b].sort());

    selection.selectAt(12, 12, { layer: Layer.Surface, additive: true });
    expect(selection.getSelectedIds()).toEqual([b]);
    expect(isFlagged(a)).toBe(false);
    selection.selectAt(12, 12, { layer: Layer.Surface, additive: true });
    expect([...selection.getSelectedIds()].sort()).toEqual([a, b].sort());
  });

  it('a box replaces a selected nest or food pile', () => {
    const { world, selection, isFlagged } = setup();
    const food = createFood(world, 40, 40, 50);
    const ant = createAnt(world, 12, 12, AntRole.Worker);
    selection.selectAt(40, 40, { layer: Layer.Surface });
    selection.selectInBox(BOX, Layer.Surface, true);
    expect(selection.getSelectedIds()).toEqual([ant]);
    expect(isFlagged(food)).toBe(false);
  });
});

describe('click selection keeps the single-entity flow', () => {
  it('a click picks the nearest food, nest or ant on that layer', () => {
    const { world, selection, below } = setup();
    const food = createFood(world, 5, 5, 50);
    const nest = createNest(world, 40, 30);
    below(createAnt(world, 41, 30, AntRole.Nurse)); // closer to the click, but below ground
    selection.selectAt(5, 5, { layer: Layer.Surface });
    expect(selection.getSelectedEntityId()).toBe(food);
    selection.selectAt(41, 30, { layer: Layer.Surface });
    expect(selection.getSelectedEntityId()).toBe(nest);
    selection.selectAt(70, 70, { layer: Layer.Surface });
    expect(selection.getSelectedEntityId()).toBeNull();
    expect(selection.getSelectedIds()).toEqual([]);
  });

  it('ctrl-click picks every own ant of that caste in view', () => {
    const { world, selection } = setup();
    const soldiers = [createAnt(world, 12, 12, AntRole.Soldier), createAnt(world, 18, 15, AntRole.Soldier)];
    createAnt(world, 14, 12, AntRole.Worker);
    createAnt(world, 40, 40, AntRole.Soldier); // out of view
    selection.selectSameCaste(12, 12, BOX, Layer.Surface);
    expect([...selection.getSelectedIds()].sort()).toEqual([...soldiers].sort());
  });

  it('clearSelection empties the group and drops every flag', () => {
    const { world, selection, isFlagged } = setup();
    const ids = [createAnt(world, 12, 12), createAnt(world, 13, 12)];
    selection.selectInBox(BOX, Layer.Surface);
    selection.clearSelection();
    expect(selection.getSelectedIds()).toEqual([]);
    for (const id of ids) expect(isFlagged(id)).toBe(false);
  });

  it('drops dead ants and ants that went below from the group', () => {
    const { world, selection, below } = setup();
    const [a, b, c] = [createAnt(world, 11, 11), createAnt(world, 12, 12), createAnt(world, 13, 13)];
    selection.selectInBox(BOX, Layer.Surface);
    world.destroyEntity(a);
    below(b);
    selection.update(1 / 60);
    expect(selection.getSelectedIds()).toEqual([c]);
    expect(selection.getSelectedEntityId()).toBe(c);
  });
});
