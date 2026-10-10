import { describe, expect, it } from 'vitest';
import { World } from '../../../engine/ecs/World';
import { createAnt, createFood, createMineral } from '../../entities/factories';
import { FoodType, Layer, AntRole } from '../../components/components';
import { SPRITE_GRID, ART_PX } from '../../../engine/renderer/sprites/spriteScale';
import { MINERAL_SPRITE_GRID } from '../../render/resourceArt';
import { TILE_SIZE } from '../../../shared/constants';
import { findResourceAt, resourcePickRadius } from './resourceOrders';
import { SelectionSystem } from '../SelectionSystem';

const everywhere = () => true;

describe('resource hit areas follow the sprites', () => {
  it('food and mineral sprites are bigger than one tile and the pick radius is their drawn half-size', () => {
    expect(SPRITE_GRID.food).toBeGreaterThanOrEqual(24);
    const world = new World();
    const leaf = createFood(world, 10, 10, 100, FoodType.Leaf);
    const node = createMineral(world, 20, 20);
    const giant = createFood(world, 30, 30, 600, FoodType.GiantMushroom);
    expect(resourcePickRadius(world, leaf)).toBeCloseTo((SPRITE_GRID.food * ART_PX) / 2 / TILE_SIZE);
    expect(resourcePickRadius(world, node)).toBeCloseTo((MINERAL_SPRITE_GRID * ART_PX) / 2 / TILE_SIZE);
    expect(resourcePickRadius(world, giant)).toBeCloseTo((SPRITE_GRID.giantMushroom * ART_PX) / 2 / TILE_SIZE);
  });

  it('a click anywhere on the sprite hits the resource; just outside it does not', () => {
    const world = new World();
    const leaf = createFood(world, 10, 10, 100, FoodType.Leaf);
    const node = createMineral(world, 20, 20);
    for (const id of [leaf, node]) {
      const r = resourcePickRadius(world, id);
      const c = id === leaf ? 10 : 20;
      expect(findResourceAt(world, { x: c + r * 0.9, y: c }, everywhere)).toBe(id);
      expect(findResourceAt(world, { x: c, y: c - r * 0.9 }, everywhere)).toBe(id);
      expect(findResourceAt(world, { x: c + r * 1.25, y: c }, everywhere)).toBeNull();
    }
  });

  it('unexplored or underground resources cannot be picked', () => {
    const world = new World();
    createFood(world, 10, 10, 100, FoodType.Leaf);
    createFood(world, 20, 20, 100, FoodType.BeetleMeat, Layer.Underground);
    expect(findResourceAt(world, { x: 10, y: 10 }, () => false)).toBeNull();
    expect(findResourceAt(world, { x: 20, y: 20 }, everywhere)).toBeNull();
  });

  it('a click on the edge of a big sprite selects it, and an ant right under the cursor still wins', () => {
    const world = new World();
    const selection = new SelectionSystem(world);
    const node = createMineral(world, 20, 20);
    const r = resourcePickRadius(world, node);
    selection.selectAt(20 + r * 0.9, 20, { layer: Layer.Surface });
    expect(selection.getSelectedEntityId()).toBe(node);
    const ant = createAnt(world, 20.2, 20, AntRole.Worker);
    selection.selectAt(20.2, 20, { layer: Layer.Surface });
    expect(selection.getSelectedEntityId()).toBe(ant);
  });

  it('a click on the edge of a food sprite picks it over an ant a little closer to the click', () => {
    const world = new World();
    const selection = new SelectionSystem(world);
    const leaf = createFood(world, 10, 10, 100, FoodType.Leaf);
    const r = resourcePickRadius(world, leaf);
    const click = { x: 10 + r * 0.95, y: 10 };
    createAnt(world, click.x + 0.8, 10, AntRole.Worker); // off the direct-hit range, nearer than the food center
    selection.selectAt(click.x, click.y, { layer: Layer.Surface });
    expect(selection.getSelectedEntityId()).toBe(leaf);
  });
});
