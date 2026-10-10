import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { createAnt } from '../entities/factories';
import {
  AntRole,
  AntState,
  COMPONENT,
  Layer,
  type AntComponent,
  type LayerComponent,
  type LayerValue,
} from '../components/components';
import { QUEEN_CHAMBER_SIZE, UNDERGROUND_HEIGHT, UNDERGROUND_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { ExcavationSystem } from './ExcavationSystem';
import { TransitSystem } from './TransitSystem';

const TICK = 1 / 60;
const CX = Math.floor(UNDERGROUND_WIDTH / 2);
const CY = Math.floor(UNDERGROUND_HEIGHT / 2);
// First earth row under the queen chamber: these tiles touch the colony's tunnels
const BELOW_QUEEN = CY + Math.floor(QUEEN_CHAMBER_SIZE / 2) + 1;

function setup() {
  const world = new World();
  const grid = new UndergroundGrid();
  const transit = new TransitSystem(world, grid);
  const excavation = new ExcavationSystem(world, grid, transit);

  function worker(x: number, y: number, state: AntState, layer: LayerValue = Layer.Underground) {
    const id = createAnt(world, x, y, AntRole.Worker);
    world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = layer;
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    ant.state = state;
    return { id, ant };
  }

  function step(frames = 1) {
    for (let i = 0; i < frames; i++) {
      excavation.update(TICK);
      transit.update(TICK);
    }
  }

  return { world, grid, transit, excavation, worker, step };
}

describe('ExcavationSystem — reaction to a new dig order', () => {
  it('reclaims an idle worker already walking up to the exit instead of letting it leave', () => {
    // Porters that finish a delivery go Idle and are put on an exit transit in
    // the same tick, so this is what "the idle hands underground" look like
    const { transit, excavation, worker, step } = setup();
    const { id, ant } = worker(CX + 0.5, CY + 1.5, AntState.Idle);
    transit.requestTransit(id, 'exit');
    expect(transit.isInTransit(id)).toBe(true);

    excavation.designateTile(CX, BELOW_QUEEN);
    step();

    expect(ant.state).toBe(AntState.GoingToDigSite);
    expect(transit.isInTransit(id)).toBe(false);
  });

  it('gives the order to the closest idle worker, not the first one in the registry', () => {
    const { excavation, worker, step } = setup();
    const far = worker(CX + 0.5, 3.5, AntState.Idle); // top of the entrance shaft
    const near = worker(CX + 0.5, CY + 1.5, AntState.Idle); // inside the queen chamber

    excavation.designateTile(CX, BELOW_QUEEN);
    step();

    expect(near.ant.state).toBe(AntState.GoingToDigSite);
    expect(far.ant.state).not.toBe(AntState.GoingToDigSite);
  });

  it('a digger that finishes a tile takes the marked tile behind it instead of leaving', () => {
    const { grid, transit, excavation, worker, step } = setup();
    const { id, ant } = worker(CX + 0.5, BELOW_QUEEN - 0.5, AntState.Idle);
    excavation.designateTile(CX, BELOW_QUEEN);
    excavation.designateTile(CX, BELOW_QUEEN + 1);

    let frames = 0;
    while (!grid.isWalkable(CX, BELOW_QUEEN) && frames < 600) {
      step();
      frames++;
    }
    expect(grid.isWalkable(CX, BELOW_QUEEN)).toBe(true);
    step();

    expect([AntState.GoingToDigSite, AntState.Excavating]).toContain(ant.state);
    expect(transit.isInTransit(id)).toBe(false);
  });

  it('does not count busy porters as dig workforce, so an idle surface worker is sent down', () => {
    const { world, transit, excavation, worker, step } = setup();
    // Two haulers busy underground, two riding the shaft down with food
    worker(CX - 5.5, CY + 0.5, AntState.Hauling);
    worker(CX - 5.5, CY + 1.5, AntState.Hauling);
    for (let i = 0; i < 2; i++) {
      const rider = worker(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, AntState.Hauling, Layer.Surface);
      transit.requestTransit(rider.id, 'enter');
    }
    const forager = worker(WORLD_WIDTH / 2 + 1, WORLD_HEIGHT / 2, AntState.Searching, Layer.Surface);

    excavation.designateTile(CX, BELOW_QUEEN);
    step();

    expect(transit.isInTransit(forager.id)).toBe(true);
    expect(world.getComponent<LayerComponent>(forager.id, COMPONENT.LAYER)!.layer).toBe(Layer.Surface);
  });
});
