import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../../engine/ecs/World';
import { TileGrid } from '../../simulation/world/TileGrid';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { TerrainType } from '../../simulation/world/types';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { createAnt, createMineral, createNest } from '../entities/factories';
import { AntRole, AntState, COMPONENT, ORE_LOAD, type AntComponent, type CarryingComponent } from '../components/components';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { AntAISystem } from './AntAISystem';
import { MovementSystem } from './MovementSystem';
import { TransitSystem } from './TransitSystem';
import { autoMinerTarget } from '../economy/minerAllocation';
import { issueMineOrders } from './helpers/resourceOrders';
import { issueMoveOrders, stopAnts } from './helpers/playerOrders';

const NX = Math.floor(WORLD_WIDTH / 2);
const NY = Math.floor(WORLD_HEIGHT / 2);
const TICK = 1 / 60;

function setup(workers: number) {
  const world = new World();
  const surface = new TileGrid();
  for (let dy = -14; dy <= 14; dy++) {
    for (let dx = -14; dx <= 14; dx++) surface.setTile(NX + dx, NY + dy, { terrain: TerrainType.Dirt, walkable: true });
  }
  const underground = new UndergroundGrid();
  createNest(world, NX, NY);
  const transit = new TransitSystem(world, underground);
  const modifiers = createDefaultModifiers();
  const fog = new VisibilityGrid(WORLD_WIDTH, WORLD_HEIGHT);
  const ai = new AntAISystem(world, surface, fog, modifiers);
  ai.setUndergroundAccess(underground, transit);
  const movement = new MovementSystem(world, surface, modifiers, underground);
  const ants: Array<{ id: number; ant: AntComponent }> = [];
  for (let i = 0; i < workers; i++) {
    const id = createAnt(world, NX + (i % 3) - 1, NY + Math.floor(i / 3) % 3 - 1, AntRole.Worker);
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    ant.state = AntState.Searching;
    ant.stateTimer = 1;
    ants.push({ id, ant });
  }
  // A field 12 tiles east: beyond a worker's 10-tile sight from the nest
  const nodes = [createMineral(world, NX + 12, NY), createMineral(world, NX + 12, NY + 1), createMineral(world, NX + 13, NY)];
  const think = (seconds: number) => {
    for (let t = 0; t < Math.round(seconds / TICK); t++) ai.update(TICK);
  };
  const live = (seconds: number) => {
    for (let t = 0; t < Math.round(seconds / TICK); t++) {
      ai.update(TICK);
      movement.update(TICK);
    }
  };
  const miners = () => ants.filter(({ ant }) => ant.mineralTargetId != null && ant.state === AntState.Mining);
  return { world, ai, fog, ants, nodes, think, live, miners, surface, transit };
}

afterEach(() => vi.restoreAllMocks());

describe('autonomous miner allocation', () => {
  it('starts at 2 miners and grows with the workforce', () => {
    expect(autoMinerTarget(3)).toBe(2);
    expect(autoMinerTarget(10)).toBe(2);
    expect(autoMinerTarget(20)).toBe(4);
    expect(autoMinerTarget(40)).toBe(8);
    expect(autoMinerTarget(1)).toBe(1);
    expect(autoMinerTarget(0)).toBe(0);
  });

  it('sends nobody to a field the colony has not found yet', () => {
    const { think, miners } = setup(8);
    think(2);
    expect(miners()).toHaveLength(0);
  });

  it('keeps the baseline of miners on a discovered field, without anyone seeing it', () => {
    const { fog, think, miners, nodes } = setup(8);
    fog.revealCircle(NX + 12, NY, 3);
    think(1);
    expect(miners()).toHaveLength(2);
    for (const { ant } of miners()) expect(nodes).toContain(ant.mineralTargetId);
  });

  it('replaces a miner that leaves the field', () => {
    const { fog, think, miners } = setup(8);
    fog.revealCircle(NX + 12, NY, 3);
    think(1);
    const [gone] = miners();
    gone.ant.mineralTargetId = null;
    gone.ant.state = AntState.Fleeing;
    think(1);
    expect(miners()).toHaveLength(2);
  });

  it('scales the baseline with the workforce', () => {
    const { fog, think, miners } = setup(20);
    fog.revealCircle(NX + 12, NY, 3);
    think(1);
    expect(miners()).toHaveLength(4);
  });
});

describe('the miner target (Mineras: N)', () => {
  it('raises and lowers the number of autonomous miners', () => {
    const { ai, fog, think, miners } = setup(10);
    fog.revealCircle(NX + 12, NY, 3);
    ai.setMinerTarget(5);
    think(1);
    expect(miners()).toHaveLength(5);
    expect(ai.getMinerStatus()).toMatchObject({ autonomous: 5, target: 5, auto: false });

    ai.setMinerTarget(1);
    think(1);
    expect(miners()).toHaveLength(1);

    ai.setMinerTarget(0);
    think(1);
    expect(miners()).toHaveLength(0);

    ai.setMinerTarget(null);
    think(1);
    expect(ai.getMinerStatus()).toMatchObject({ target: 2, auto: true });
    expect(miners()).toHaveLength(2);
  });

  it('lets a miner bring its ore home before releasing it', () => {
    const { ai, fog, think, miners, world } = setup(6);
    fog.revealCircle(NX + 12, NY, 3);
    think(1);
    const [loaded] = miners();
    const load = world.getComponent<CarryingComponent>(loaded.id, COMPONENT.CARRYING)!;
    load.amount = 5;
    load.resourceType = ORE_LOAD;
    ai.setMinerTarget(0);
    think(0.1);
    // Released on the first check except the loaded one, which banks its ore first...
    expect(miners().filter(({ id }) => id !== loaded.id)).toHaveLength(0);
    think(1);
    // ...and is released once the ore is in the bank
    expect(world.minerals.stored).toBe(5);
    expect(miners()).toHaveLength(0);
  });
});

describe('the mine order', () => {
  it('loops: the ordered workers keep mining and banking ore until told otherwise', () => {
    const { world, ai, ants, nodes, live } = setup(3);
    ai.setMinerTarget(0); // only the order mines
    const ordered = ants.slice(0, 2).map(({ id }) => id);
    expect(issueMineOrders(world, ordered, nodes[0])).toEqual(ordered);
    live(60);
    // Each trip carries 5: several trips each, so it went back after every delivery
    expect(world.minerals.stored).toBeGreaterThanOrEqual(20);
    for (const id of ordered) {
      const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      expect(ant.resourceOrder).toBe('mine');
      expect(ant.mineralTargetId).toBe(nodes[0]);
    }
    // The workers that were not ordered stayed off the field
    expect(ants[2].ant.mineralTargetId ?? null).toBeNull();
  });

  it('only workers take it, and it needs a mineral node', () => {
    const { world, nodes } = setup(1);
    const soldier = createAnt(world, NX, NY, AntRole.Soldier);
    expect(issueMineOrders(world, [soldier], nodes[0])).toEqual([]);
    const worker = world.query(COMPONENT.ANT).find((id) => id !== soldier)!;
    expect(issueMineOrders(world, [worker], soldier)).toEqual([]);
  });

  it('moves on to the next node of the field when its node runs out', () => {
    const { world, ai, ants, nodes, live, fog } = setup(1);
    fog.revealCircle(NX + 12, NY, 3);
    ai.setMinerTarget(0);
    world.getComponent<{ amount: number }>(nodes[0], COMPONENT.MINERAL)!.amount = 5;
    issueMineOrders(world, [ants[0].id], nodes[0]);
    live(30);
    expect(world.hasEntity(nodes[0])).toBe(false);
    expect(ants[0].ant.resourceOrder).toBe('mine');
    expect([nodes[1], nodes[2]]).toContain(ants[0].ant.mineralTargetId);
  });

  it('ends with a new order or Detener, and the ordered miners never count toward the target', () => {
    const { world, ai, ants, nodes, think, surface } = setup(3);
    ai.setMinerTarget(0);
    issueMineOrders(world, [ants[0].id, ants[1].id], nodes[0]);
    think(1);
    expect(ants[0].ant.resourceOrder).toBe('mine');
    expect(ai.getMinerStatus()).toMatchObject({ autonomous: 0, ordered: 2, miners: 2 });

    expect(stopAnts(world, [ants[0].id])).toBe(1);
    expect(ants[0].ant.resourceOrder).toBeUndefined();
    expect(ants[0].ant.mineralTargetId ?? null).toBeNull();

    issueMoveOrders(world, surface, [ants[1].id], { x: NX - 4, y: NY });
    expect(ants[1].ant.resourceOrder).toBeUndefined();
    expect(ants[1].ant.mineralTargetId ?? null).toBeNull();
  });
});
