import { describe, expect, it } from 'vitest';
import { World } from '../../../engine/ecs/World';
import { TileGrid } from '../../../simulation/world/TileGrid';
import { TerrainType } from '../../../simulation/world/types';
import {
  COMPONENT,
  CrystalUnitState,
  Layer,
  OrderKind,
  type CombatComponent,
  type CrystalUnitComponent,
  type HealthComponent,
  type PlayerOrderComponent,
  type PositionComponent,
} from '../../components/components';
import { createBeetle, createCrystalHive } from '../../entities/factories';
import { FactionId, FactionRegistry } from '../../factions/factions';
import { createCrystalUnit } from '../../rival/crystalFactories';
import { createDefaultModifiers } from '../../events/GlobalModifiers';
import { MovementSystem } from '../../systems/MovementSystem';
import { CombatSystem } from '../../systems/CombatSystem';
import { CrystalUnitAISystem } from '../../systems/CrystalUnitAISystem';
import { SelectionSystem } from '../../systems/SelectionSystem';
import { issueAttackOrders, issueHoldOrders, issueMoveOrders, stopAnts } from '../../systems/helpers/playerOrders';
import { CrystalPlayerUnitSystem } from './CrystalPlayerUnitSystem';

function setup() {
  const world = new World(undefined, new FactionRegistry([
    { id: FactionId.WILDLIFE, race: 'wildlife', controller: 'none' },
    { id: FactionId.PLAYER, race: 'crystal', controller: 'human' },
    { id: FactionId.RIVAL, race: 'crystal', controller: 'ai' },
  ]));
  const grid = new TileGrid();
  for (let y = 10; y <= 80; y++) for (let x = 10; x <= 110; x++) grid.setTile(x, y, { terrain: TerrainType.Dirt, walkable: true });
  const hive = createCrystalHive(world, 30, 45, FactionId.PLAYER);
  const systems = [
    new CrystalPlayerUnitSystem(world, grid),
    new CrystalUnitAISystem(world, grid),
    new CombatSystem(world, grid),
    new MovementSystem(world, grid, createDefaultModifiers()),
  ].sort((a, b) => a.priority - b.priority);
  const run = (seconds: number, dt = 1 / 30) => {
    for (let t = 0; t < seconds; t += dt) for (const s of systems) s.update(dt);
  };
  const drone = (x: number, y: number, faction: FactionId = FactionId.PLAYER) =>
    createCrystalUnit(world, 'drone', x, y, faction === FactionId.PLAYER ? hive : null, faction);
  const pos = (id: number) => world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
  const order = (id: number) => world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER);
  return { world, grid, hive, run, drone, pos, order };
}

describe('player orders on the Crystal Hive’s units', () => {
  it('a unit with no order stands guard where it is', () => {
    const { run, drone, order, pos } = setup();
    const id = drone(40, 45);
    run(0.2);
    expect(order(id)?.kind).toBe(OrderKind.Guard);
    expect(pos(id).x).toBeCloseTo(40, 0);
  });

  it('a move order walks it to the spot, then it guards there', () => {
    const { world, grid, run, drone, pos, order } = setup();
    const id = drone(40, 45);
    const result = issueMoveOrders(world, grid, [id], { x: 52, y: 50 });
    expect(result?.ordered).toEqual([id]);
    expect(order(id)?.kind).toBe(OrderKind.Move);
    run(20);
    expect(Math.hypot(pos(id).x - 52, pos(id).y - 50)).toBeLessThan(1);
    expect(order(id)?.kind).toBe(OrderKind.Guard);
  });

  it('the rival AI never overrides a player-owned unit', () => {
    const { world, grid, run, drone, pos } = setup();
    const id = drone(40, 45);
    // A rival-style state on a player's unit must not send it anywhere
    const unit = world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!;
    unit.state = CrystalUnitState.Assaulting;
    unit.goal = { x: 15, y: 15 };
    issueMoveOrders(world, grid, [id], { x: 60, y: 45 });
    run(25);
    expect(Math.hypot(pos(id).x - 60, pos(id).y - 45)).toBeLessThan(1);
  });

  it('an attack order chases one enemy and kills it', () => {
    const { world, grid, run, drone } = setup();
    const a = drone(40, 45);
    const b = drone(40, 47);
    const beetle = createBeetle(world, 50, 46, null);
    world.getComponent<HealthComponent>(beetle, COMPONENT.HEALTH)!.current = 60;
    expect(issueAttackOrders(world, grid, [a, b], beetle)?.ordered).toHaveLength(2);
    run(15);
    expect(world.hasEntity(beetle)).toBe(false);
  });

  it('attack-move fights what it meets on the way', () => {
    const { world, grid, run, drone } = setup();
    const id = drone(40, 45);
    const beetle = createBeetle(world, 48, 45, null);
    issueMoveOrders(world, grid, [id], { x: 70, y: 45 }, null, OrderKind.AttackMove);
    run(2.5);
    expect(world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!.targetEntityId).toBe(beetle);
  });

  it('hold position never chases', () => {
    const { world, run, drone, pos } = setup();
    const id = drone(40, 45);
    createBeetle(world, 45, 45, null);
    issueHoldOrders(world, [id]);
    run(2);
    expect(pos(id).x).toBeCloseTo(40, 1);
    expect(world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER)?.kind).toBe(OrderKind.Hold);
  });

  it('stop drops the order; the unit then guards its spot', () => {
    const { world, grid, run, drone, order } = setup();
    const id = drone(40, 45);
    issueMoveOrders(world, grid, [id], { x: 70, y: 45 });
    run(0.5);
    expect(stopAnts(world, [id])).toBe(1);
    run(0.2);
    expect(order(id)?.kind).toBe(OrderKind.Guard);
  });

  it('box selection and orders take the player’s crystal units, never the rival’s', () => {
    const { world, grid, drone } = setup();
    const mine = drone(40, 45);
    const theirs = drone(41, 45, FactionId.RIVAL);
    const selection = new SelectionSystem(world);
    selection.selectInBox({ minX: 38, minY: 43, maxX: 43, maxY: 47 }, Layer.Surface);
    expect(selection.getSelectedAnts()).toEqual([mine]);
    expect(issueMoveOrders(world, grid, [mine, theirs], { x: 50, y: 50 })?.ordered).toEqual([mine]);
  });
});
