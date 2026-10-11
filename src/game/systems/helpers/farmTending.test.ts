import { describe, expect, it } from 'vitest';
import { World } from '../../../engine/ecs/World';
import { UndergroundGrid } from '../../../simulation/world/UndergroundGrid';
import { ChamberType } from '../../../simulation/world/types';
import { createAnt } from '../../entities/factories';
import {
  AntRole,
  AntState,
  COMPONENT,
  Layer,
  type AntComponent,
  type CarryingComponent,
  type LayerComponent,
  type PathComponent,
  type PositionComponent,
} from '../../components/components';
import { NurseAISystem } from '../NurseAISystem';
import { ANT_STATE_LABEL } from '../../../ui/console/format';
import { FARM_TEND_POSE_SECONDS, findTendTile } from './farmTending';
import { FungusFarmSystem } from '../FungusFarmSystem';
import { FARM_MULCH_CAPACITY } from '../../../shared/constants';

/** Dig a 3x2 farm right under the starting pantry and zone it */
function zoneFarm(grid: UndergroundGrid): Array<{ x: number; y: number }> {
  const pantry = grid.getPantryTiles();
  const minX = Math.min(...pantry.map((t) => t.x));
  const maxY = Math.max(...pantry.map((t) => t.y));
  const tiles: Array<{ x: number; y: number }> = [];
  for (let y = maxY + 1; y <= maxY + 2; y++) {
    for (let x = minX; x < minX + 3; x++) {
      grid.designate(x, y);
      grid.excavate(x, y);
      grid.getTile(x, y)!.chamberType = ChamberType.FungusFarm;
      tiles.push({ x, y });
    }
  }
  grid.invalidateChamberCache();
  return tiles;
}

function setup() {
  const world = new World();
  const grid = new UndergroundGrid();
  const farm = zoneFarm(grid);
  const system = new NurseAISystem(world, grid);
  const pantry = grid.getPantryTiles()[0];
  const id = createAnt(world, pantry.x + 0.5, pantry.y + 0.5, AntRole.Nurse);
  world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
  const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
  const carrying = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;
  const path = world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
  return { world, grid, farm, system, id, ant, pos, carrying, path };
}

/** Teleport the ant to the end of its current path (stands in for MovementSystem) */
function arrive(pos: PositionComponent, path: PathComponent): void {
  const last = path.waypoints[path.waypoints.length - 1];
  if (!last) return;
  pos.x = last.x;
  pos.y = last.y;
  path.waypoints = [];
  path.currentIndex = 0;
}

describe('farm tending', () => {
  it('mulches the most grown bed that runs low, and skips ripe ones', () => {
    const { world, grid, farm } = setup();
    for (const t of farm) grid.addFarmMulch(t.x, t.y, FARM_MULCH_CAPACITY);
    expect(findTendTile(world, grid, -1, 40, 30)).toBeNull();
    grid.takeFarmMulch(farm[1].x, farm[1].y, FARM_MULCH_CAPACITY);
    grid.takeFarmMulch(farm[2].x, farm[2].y, FARM_MULCH_CAPACITY);
    grid.depositFood(farm[2].x, farm[2].y, 'mushroom', 20);
    expect(findTendTile(world, grid, -1, 40, 30)).toEqual(farm[2]);
    grid.depositFood(farm[2].x, farm[2].y, 'mushroom', grid.getPantryTileCapacity());
    expect(findTendTile(world, grid, -1, 40, 30)).toEqual(farm[1]);
  });

  it('a free nurse carries leaves from the pantry and lays them as mulch on a farm bed', () => {
    const { grid, system, ant, pos, carrying, path } = setup();
    const pantry = grid.getPantryTiles()[0];
    grid.depositFood(pantry.x, pantry.y, 'leaf', 20);
    const ledger = () => grid.getPantryStored().total + carrying.amount + grid.getFarmMulchTotal();
    const before = ledger();

    system.update(0.1);
    expect(ant.state).toBe(AntState.FarmTending);
    expect(ANT_STATE_LABEL[ant.state]).toBe('Cultivando hongos');

    for (let i = 0; i < 5 && ant.farmTend?.phase === 'fetching'; i++) {
      arrive(pos, path);
      system.update(0.1);
    }
    expect(ant.farmTend?.phase).toBe('going');
    expect(carrying.resourceType).toBe('leaf');
    expect(carrying.amount).toBeGreaterThan(0);

    for (let i = 0; i < 5 && ant.farmTend?.phase === 'going'; i++) {
      arrive(pos, path);
      system.update(0.1);
    }
    expect(ant.farmTend?.phase).toBe('planting');
    expect(grid.getFarmMulchTotal()).toBe(0);

    system.update(FARM_TEND_POSE_SECONDS + 0.01);
    expect(ant.state).not.toBe(AntState.FarmTending);
    expect(grid.getFarmMulchTotal()).toBeGreaterThan(0);
    expect(ledger()).toBeCloseTo(before);
  });

  it('the fungus grows on mulched beds only, on all of them at once', () => {
    const { world, grid, farm } = setup();
    const farmSystem = new FungusFarmSystem(world, grid);
    grid.addFarmMulch(farm[0].x, farm[0].y, 6);
    grid.addFarmMulch(farm[1].x, farm[1].y, 6);
    farmSystem.update(1);
    const grown = (t: { x: number; y: number }) => grid.getTile(t.x, t.y)!.food?.amount ?? 0;
    expect(grown(farm[0])).toBeGreaterThan(0);
    expect(grown(farm[1])).toBeCloseTo(grown(farm[0]));
    expect(grown(farm[2])).toBe(0);
    expect(farmSystem.getStatus().status).toBe('produciendo');
  });

  it('reports the beds waiting for gardeners when leaves sit in the pantry unmulched', () => {
    const { world, grid } = setup();
    const farmSystem = new FungusFarmSystem(world, grid);
    const pantry = grid.getPantryTiles()[0];
    grid.depositFood(pantry.x, pantry.y, 'leaf', 10);
    farmSystem.update(1);
    expect(farmSystem.getStatus().status).toBe('sin-abono');
  });
});
