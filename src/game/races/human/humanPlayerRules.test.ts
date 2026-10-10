import { describe, expect, it } from 'vitest';
import {
  PLAYER_BUILD_COST,
  PLAYER_BUILDABLE,
  PLAYER_HUMAN_START,
  PLAYER_TRAIN_COST,
  PRODUCER_OF,
  buildRate,
  canAfford,
  placementProblem,
  trainableAt,
  type PlacementWorld,
} from './humanPlayerRules';
import { HUMAN_BUILDING_STATS } from '../../rival/humanBase';

function openWorld(overrides: Partial<PlacementWorld> = {}): PlacementWorld {
  return {
    width: 100,
    height: 100,
    isWalkable: () => true,
    buildings: [],
    minerals: [],
    ...overrides,
  };
}

describe('player Human rules', () => {
  it('lets the builder raise a barracks, a bunker, a supply depot and a factory, paid in minerals', () => {
    expect(PLAYER_BUILDABLE).toEqual(['barracks', 'bunker', 'supply_depot', 'factory']);
    for (const kind of PLAYER_BUILDABLE) {
      expect(PLAYER_BUILD_COST[kind].minerals).toBeGreaterThan(0);
      expect(HUMAN_BUILDING_STATS[kind].buildTime).toBeGreaterThan(0);
    }
  });

  it('trains troops with rations at their building: builders at the command center, tanks at the factory', () => {
    expect(PRODUCER_OF.builder).toBe('command_center');
    expect(PRODUCER_OF.soldier).toBe('barracks');
    expect(PRODUCER_OF.marksman).toBe('barracks');
    expect(PRODUCER_OF.tank).toBe('factory');
    expect(trainableAt('barracks')).toEqual(['soldier', 'marksman']);
    expect(trainableAt('factory')).toEqual(['tank']);
    expect(trainableAt('command_center')).toEqual(['builder']);
    expect(trainableAt('bunker')).toEqual([]);
    expect(PLAYER_TRAIN_COST.soldier.rations).toBeGreaterThan(0);
    expect(PLAYER_TRAIN_COST.tank.minerals).toBeGreaterThan(0);
  });

  it('starts with a command center, two builders, two soldiers and both resources', () => {
    expect(PLAYER_HUMAN_START.builders).toBe(2);
    expect(PLAYER_HUMAN_START.soldiers).toBe(2);
    expect(PLAYER_HUMAN_START.rations).toBeGreaterThan(0);
    expect(PLAYER_HUMAN_START.minerals).toBeGreaterThan(0);
  });

  it('checks costs against both stocks', () => {
    expect(canAfford({ rations: 100, minerals: 50 }, { rations: 70, minerals: 0 })).toBe(true);
    expect(canAfford({ rations: 60, minerals: 500 }, { rations: 70, minerals: 0 })).toBe(false);
    expect(canAfford({ rations: 500, minerals: 99 }, { rations: 0, minerals: 100 })).toBe(false);
  });

  it('accepts open walkable ground', () => {
    expect(placementProblem('barracks', { x: 50, y: 50 }, openWorld())).toBeNull();
  });

  it('rejects water or rock under the footprint, the map edge, other buildings and mineral nodes', () => {
    const rockAt = (rx: number, ry: number) => openWorld({ isWalkable: (x, y) => !(x === rx && y === ry) });
    expect(placementProblem('barracks', { x: 50, y: 50 }, rockAt(50, 50))).toMatch(/terreno/i);
    expect(placementProblem('barracks', { x: 50, y: 50 }, rockAt(51, 51))).toMatch(/terreno/i);
    expect(placementProblem('barracks', { x: 1, y: 50 }, openWorld())).toMatch(/borde/i);
    const crowded = openWorld({ buildings: [{ x: 52, y: 50, halfWidth: 1.6 }] });
    expect(placementProblem('barracks', { x: 50, y: 50 }, crowded)).toMatch(/edificio/i);
    expect(placementProblem('barracks', { x: 58, y: 50 }, crowded)).toBeNull();
    const ore = openWorld({ minerals: [{ x: 51, y: 50 }] });
    expect(placementProblem('supply_depot', { x: 50, y: 50 }, ore)).toMatch(/mineral/i);
  });

  it('a second builder speeds the work up, with diminishing returns', () => {
    expect(buildRate(0)).toBe(0);
    expect(buildRate(1)).toBe(1);
    expect(buildRate(2)).toBeGreaterThan(1.5);
    expect(buildRate(2)).toBeLessThan(2);
    expect(buildRate(3)).toBeGreaterThan(buildRate(2));
  });
});
