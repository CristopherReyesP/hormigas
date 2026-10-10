import { describe, expect, it } from 'vitest';
import { World } from '../../../engine/ecs/World';
import { TileGrid } from '../../../simulation/world/TileGrid';
import { TerrainType } from '../../../simulation/world/types';
import { createDefaultModifiers } from '../../events/GlobalModifiers';
import { createBeetle } from '../../entities/factories';
import {
  COMPONENT,
  Layer,
  OrderKind,
  type CombatComponent,
  type PlayerOrderComponent,
  type PositionComponent,
} from '../../components/components';
import { FactionId } from '../../factions/factions';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../../shared/constants';
import { MovementSystem } from '../../systems/MovementSystem';
import { CombatSystem } from '../../systems/CombatSystem';
import { HumanUnitAISystem } from '../../systems/HumanUnitAISystem';
import { SelectionSystem } from '../../systems/SelectionSystem';
import { issueAttackOrders, issueHoldOrders, issueMoveOrders, stopAnts } from '../../systems/helpers/playerOrders';
import { createHumanBuilding, createHumanUnit } from '../../rival/humanFactories';
import { HumanPlayerUnitSystem } from './HumanPlayerUnitSystem';
import { createPlayerHumanBuilding, createPlayerHumanUnit } from './humanPlayerFactories';

const CX = Math.floor(WORLD_WIDTH / 2);
const CY = Math.floor(WORLD_HEIGHT / 2);
const TICK = 1 / 30;

function openGrid(): TileGrid {
  const surface = new TileGrid();
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) surface.setTile(x, y, { terrain: TerrainType.Dirt, walkable: true });
  }
  return surface;
}

/** A beetle that stands still (no BeetleAI runs here) and takes a while to kill */
function dummyBeetle(world: World, x: number, y: number): number {
  return createBeetle(world, x, y);
}

function setup() {
  const world = new World();
  const grid = openGrid();
  const core = createPlayerHumanBuilding(world, 'command_center', CX, CY);
  const units = new HumanPlayerUnitSystem(world, grid);
  const rivalAI = new HumanUnitAISystem(world, grid);
  const movement = new MovementSystem(world, grid, createDefaultModifiers());
  const combat = new CombatSystem(world, grid);
  const run = (seconds: number, withCombat = true) => {
    for (let i = 0; i < Math.round(seconds / TICK); i++) {
      units.update(TICK);
      rivalAI.update(TICK);
      if (withCombat) combat.update(TICK);
      movement.update(TICK);
    }
  };
  const pos = (id: number) => world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
  const order = (id: number) => world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER);
  return { world, grid, core, run, pos, order };
}

describe('player orders on Human units', () => {
  it('a move order walks the soldier there, and the rival AI does not pull it back home', () => {
    const { world, grid, core, run, pos, order } = setup();
    const soldier = createPlayerHumanUnit(world, 'soldier', CX + 2, CY + 2, core);
    const result = issueMoveOrders(world, grid, [soldier], { x: CX + 20, y: CY + 10 });
    expect(result?.ordered).toEqual([soldier]);
    run(25);
    expect(Math.hypot(pos(soldier).x - (CX + 20), pos(soldier).y - (CY + 10))).toBeLessThan(1.5);
    // A warrior keeps the spot as its guard post
    expect(order(soldier)?.kind).toBe(OrderKind.Guard);
  });

  it('an attack order chases one enemy and shoots it until it dies', () => {
    const { world, grid, core, run } = setup();
    const soldiers = [0, 1, 2].map((i) => createPlayerHumanUnit(world, 'soldier', CX + 2, CY + i, core));
    const beetle = dummyBeetle(world, CX + 16, CY);
    expect(issueAttackOrders(world, grid, soldiers, beetle)?.ordered).toHaveLength(3);
    run(40);
    expect(world.hasEntity(beetle)).toBe(false);
  });

  it('attack-move fights what it meets on the way, then goes on to the goal', () => {
    const { world, grid, core, run, pos } = setup();
    const soldiers = [0, 1, 2, 3].map((i) => createPlayerHumanUnit(world, 'soldier', CX + 2, CY + i - 1, core));
    const beetle = dummyBeetle(world, CX + 12, CY);
    issueMoveOrders(world, grid, soldiers, { x: CX + 24, y: CY }, null, OrderKind.AttackMove);
    run(4);
    const engaged = soldiers.some((id) => world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!.targetEntityId === beetle);
    expect(engaged).toBe(true);
    run(60);
    expect(world.hasEntity(beetle)).toBe(false);
    for (const id of soldiers) expect(pos(id).x).toBeGreaterThan(CX + 19);
  });

  it('hold position stands still: it shoots what is in range and never chases', () => {
    const { world, core, run, pos } = setup();
    const soldier = createPlayerHumanUnit(world, 'soldier', CX + 4, CY, core);
    issueHoldOrders(world, [soldier]);
    const far = dummyBeetle(world, CX + 10.5, CY);
    run(2, false);
    expect(pos(soldier).x).toBeCloseTo(CX + 4, 3);
    expect(world.getComponent<CombatComponent>(soldier, COMPONENT.COMBAT)!.targetEntityId).toBeNull();
    const near = dummyBeetle(world, CX + 7, CY);
    run(1, false);
    expect(world.getComponent<CombatComponent>(soldier, COMPONENT.COMBAT)!.targetEntityId).toBe(near);
    expect(pos(soldier).x).toBeCloseTo(CX + 4, 3);
    expect(world.hasEntity(far)).toBe(true);
  });

  it('an idle soldier shoots an enemy that comes into range on its own', () => {
    const { world, core, run } = setup();
    const soldier = createPlayerHumanUnit(world, 'soldier', CX + 4, CY, core);
    const beetle = dummyBeetle(world, CX + 8, CY);
    run(0.5, false);
    expect(world.getComponent<CombatComponent>(soldier, COMPONENT.COMBAT)!.targetEntityId).toBe(beetle);
  });

  it('Detener drops the order', () => {
    const { world, grid, core, order } = setup();
    const soldier = createPlayerHumanUnit(world, 'soldier', CX + 2, CY, core);
    issueMoveOrders(world, grid, [soldier], { x: CX + 20, y: CY });
    expect(stopAnts(world, [soldier])).toBe(1);
    expect(order(soldier)).toBeUndefined();
  });

  it('the rival AI still drives its own troops, and player orders never touch them', () => {
    const { world, grid } = setup();
    const rival = createHumanUnit(world, 'soldier', CX + 30, CY, null, FactionId.RIVAL);
    expect(issueMoveOrders(world, grid, [rival], { x: CX, y: CY })).toBeNull();
  });
});

describe('selecting Human units', () => {
  it('a box takes the player\'s units only: not rival troops, not buildings', () => {
    const { world, core } = setup();
    const mine = [0, 1].map((i) => createPlayerHumanUnit(world, 'soldier', CX + 3 + i, CY + 3, core));
    createHumanUnit(world, 'soldier', CX + 4, CY + 4, null, FactionId.RIVAL);
    createHumanBuilding(world, 'bunker', CX + 5, CY + 3, FactionId.RIVAL);
    const selection = new SelectionSystem(world);
    selection.selectInBox({ minX: CX - 3, minY: CY - 3, maxX: CX + 8, maxY: CY + 8 }, Layer.Surface);
    expect([...selection.getSelectedAnts()].sort()).toEqual([...mine].sort());
  });

  it('a click on the command center selects it', () => {
    const { world, core } = setup();
    const selection = new SelectionSystem(world);
    selection.selectAt(CX, CY - 1, { layer: Layer.Surface });
    expect(selection.getSelectedEntityId()).toBe(core);
    expect(selection.getSelectedAnts()).toEqual([]);
  });

  it('ctrl-click takes every unit of the same type on screen', () => {
    const { world, core } = setup();
    const soldiers = [0, 1, 2].map((i) => createPlayerHumanUnit(world, 'soldier', CX + 3 + i, CY + 4, core));
    createPlayerHumanUnit(world, 'builder', CX + 3, CY + 6, core);
    const selection = new SelectionSystem(world);
    selection.selectSameCaste(CX + 3, CY + 4, { minX: 0, minY: 0, maxX: WORLD_WIDTH, maxY: WORLD_HEIGHT }, Layer.Surface);
    expect([...selection.getSelectedAnts()].sort()).toEqual([...soldiers].sort());
  });
});
