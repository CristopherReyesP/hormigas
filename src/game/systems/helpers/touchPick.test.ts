import { describe, expect, it } from 'vitest';
import { World } from '../../../engine/ecs/World';
import { createAnt, createFood } from '../../entities/factories';
import { AntRole, COMPONENT, Layer, type LayerComponent } from '../../components/components';
import { SelectionSystem } from '../SelectionSystem';
import { MAX_TOUCH_PICK_TILES, MIN_TOUCH_PICK_TILES, TOUCH_PICK_CSS_PX, touchPickRadiusTiles } from './touchPick';
import { TILE_SIZE } from '../../../shared/constants';

describe('finger pick radius', () => {
  it('is a fixed finger size on screen, so it covers more tiles as the camera zooms out', () => {
    const near = touchPickRadiusTiles(2, 1);
    const mid = touchPickRadiusTiles(1, 1);
    const far = touchPickRadiusTiles(0.5, 1);
    expect(mid).toBeCloseTo(TOUCH_PICK_CSS_PX / TILE_SIZE);
    expect(far).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(near);
  });

  it('counts CSS px, not canvas px, on a high-density screen', () => {
    // Zoom is canvas px per world px: at 2x the same zoom shows the world half as big in CSS px
    expect(touchPickRadiusTiles(2, 2)).toBeCloseTo(touchPickRadiusTiles(1, 1));
  });

  it('never shrinks under a direct hit nor grows past a few tiles', () => {
    expect(touchPickRadiusTiles(100, 1)).toBe(MIN_TOUCH_PICK_TILES);
    expect(touchPickRadiusTiles(0.01, 1)).toBe(MAX_TOUCH_PICK_TILES);
    expect(touchPickRadiusTiles(Number.NaN, 1)).toBe(MIN_TOUCH_PICK_TILES);
  });
});

describe('picking the nearest own ant under a finger', () => {
  function setup() {
    const world = new World();
    const selection = new SelectionSystem(world);
    return { world, selection };
  }

  it('finds a small ant the finger only landed near', () => {
    const { world, selection } = setup();
    const ant = createAnt(world, 10, 10, AntRole.Scout);
    expect(selection.nearestOwnAnt(11.2, 10.4, Layer.Surface, 1.5)).toBe(ant);
    expect(selection.nearestOwnAnt(11.2, 10.4, Layer.Surface, 1)).toBeNull();
  });

  it('takes the nearest of several, and ignores food even when it is closer', () => {
    const { world, selection } = setup();
    createAnt(world, 12, 10, AntRole.Worker);
    const nearest = createAnt(world, 10.6, 10, AntRole.Soldier);
    createFood(world, 10, 10, 20);
    expect(selection.nearestOwnAnt(10, 10, Layer.Surface, 3)).toBe(nearest);
  });

  it('only looks at the layer in view and can skip the ants already picked', () => {
    const { world, selection } = setup();
    const buried = createAnt(world, 10, 10, AntRole.Worker);
    world.getComponent<LayerComponent>(buried, COMPONENT.LAYER)!.layer = Layer.Underground;
    const picked = createAnt(world, 10.2, 10, AntRole.Soldier);
    const other = createAnt(world, 11, 10, AntRole.Soldier);
    expect(selection.nearestOwnAnt(10, 10, Layer.Surface, 2)).toBe(picked);
    expect(selection.nearestOwnAnt(10, 10, Layer.Surface, 2, new Set([picked]))).toBe(other);
    expect(selection.nearestOwnAnt(10, 10, Layer.Underground, 2)).toBe(buried);
  });
});
