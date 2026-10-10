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
import { FARM_HARVEST_POSE_SECONDS, findHarvestTile } from './farmHarvest';

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

describe('farm harvest', () => {
  it('only offers tiles that are ready to harvest', () => {
    const { world, grid, farm } = setup();
    grid.depositFood(farm[0].x, farm[0].y, 'mushroom', 30);
    expect(findHarvestTile(world, grid, -1, 40, 30)).toBeNull();
    grid.depositFood(farm[1].x, farm[1].y, 'mushroom', grid.getPantryTileCapacity());
    expect(findHarvestTile(world, grid, -1, 40, 30)).toEqual(farm[1]);
  });

  it('a free nurse walks to a ripe tile, harvests for a moment, and carries the mushrooms to the pantry', () => {
    const { grid, farm, system, ant, pos, carrying, path } = setup();
    const cap = grid.getPantryTileCapacity();
    grid.depositFood(farm[0].x, farm[0].y, 'mushroom', cap);
    const plucks: Array<{ x: number; y: number }> = [];
    grid.setFarmTakeListener((x, y) => plucks.push({ x, y }));

    const totalBefore = grid.getPantryStored();
    const farmBefore = grid.getFarmStored();
    const ledger = () => grid.getPantryStored().total + carrying.amount;

    system.update(0.1);
    expect(ant.state).toBe(AntState.FarmHarvesting);
    expect(ANT_STATE_LABEL[ant.state]).toBe('Cosechando hongos');
    expect(ant.farmHarvest?.phase).toBe('going');

    arrive(pos, path);
    system.update(0.1);
    expect(ant.farmHarvest?.phase).toBe('picking');
    expect(plucks).toEqual([farm[0]]);
    expect(carrying.resourceType).toBe('mushroom');
    expect(carrying.amount).toBeGreaterThan(0);
    expect(ledger()).toBeCloseTo(totalBefore.total);

    // The pose holds for about a second before she sets off
    system.update(FARM_HARVEST_POSE_SECONDS / 2);
    expect(ant.farmHarvest?.phase).toBe('picking');
    system.update(FARM_HARVEST_POSE_SECONDS / 2 + 0.01);
    expect(ant.farmHarvest?.phase).toBe('carrying');

    for (let i = 0; i < 5 && ant.state === AntState.FarmHarvesting; i++) {
      arrive(pos, path);
      system.update(0.1);
    }
    expect(ant.state).not.toBe(AntState.FarmHarvesting);
    expect(carrying.amount).toBe(0);

    const after = grid.getPantryStored();
    expect(after.total).toBeCloseTo(totalBefore.total);
    expect(after.mushroom).toBeCloseTo(totalBefore.mushroom);
    expect(grid.getFarmStored()).toBeCloseTo(farmBefore - carrying.maxCapacity);
  });

  it('leaves the farm alone when the pantry is nearly full, so leaves still have room', () => {
    const { grid, farm, system, ant } = setup();
    grid.depositFood(farm[0].x, farm[0].y, 'mushroom', grid.getPantryTileCapacity());
    for (const t of grid.getPantryTiles()) grid.depositFood(t.x, t.y, 'leaf', grid.getPantryTileCapacity());
    system.update(0.1);
    expect(ant.state).not.toBe(AntState.FarmHarvesting);
  });

  it('two nurses never pick the same tile', () => {
    const { world, grid, farm, system, ant } = setup();
    grid.depositFood(farm[0].x, farm[0].y, 'mushroom', grid.getPantryTileCapacity());
    const pantry = grid.getPantryTiles()[0];
    const other = createAnt(world, pantry.x + 0.5, pantry.y + 0.5, AntRole.Nurse);
    world.getComponent<LayerComponent>(other, COMPONENT.LAYER)!.layer = Layer.Underground;
    system.update(0.1);
    const otherAnt = world.getComponent<AntComponent>(other, COMPONENT.ANT)!;
    const harvesting = [ant, otherAnt].filter((a) => a.state === AntState.FarmHarvesting);
    expect(harvesting).toHaveLength(1);
  });

  it('gives up the job, food and all, if the tile is gone before she arrives', () => {
    const { grid, farm, system, ant, carrying } = setup();
    grid.depositFood(farm[0].x, farm[0].y, 'mushroom', grid.getPantryTileCapacity());
    system.update(0.1);
    expect(ant.state).toBe(AntState.FarmHarvesting);
    grid.takeFood(farm[0].x, farm[0].y, 999);
    system.update(0.1);
    expect(ant.state).not.toBe(AntState.FarmHarvesting);
    expect(carrying.amount).toBe(0);
  });
});
