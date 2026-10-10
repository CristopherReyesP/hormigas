import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { TileGrid } from '../../simulation/world/TileGrid';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { TerrainType } from '../../simulation/world/types';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { createAnt, createBeetle, createNest } from '../entities/factories';
import {
  AntRole,
  AntState,
  COMPONENT,
  ColonyPriority,
  type AntComponent,
  type CarryingComponent,
  type HealthComponent,
  type HungerComponent,
  type NestComponent,
  type PositionComponent,
} from '../components/components';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { AntAISystem } from './AntAISystem';
import { MovementSystem } from './MovementSystem';
import { TransitSystem } from './TransitSystem';
import { ensureCombatComponent } from './helpers/combatHelpers';

const NX = Math.floor(WORLD_WIDTH / 2);
const NY = Math.floor(WORLD_HEIGHT / 2);
const TICK = 1 / 60;

function setup({ pantry = 100 }: { pantry?: number } = {}) {
  const world = new World();
  const surface = new TileGrid();
  for (let dy = -10; dy <= 10; dy++) {
    for (let dx = -10; dx <= 10; dx++) {
      const tile = surface.getTile(NX + dx, NY + dy);
      if (tile && !tile.walkable) surface.setTile(NX + dx, NY + dy, { terrain: TerrainType.Dirt, walkable: true });
    }
  }
  const underground = new UndergroundGrid();
  if (pantry > 0) {
    const tile = underground.getPantryTiles()[0];
    underground.depositFood(tile.x, tile.y, 'leaf', pantry);
  }
  const nest = world.getComponent<NestComponent>(createNest(world, NX, NY), COMPONENT.NEST)!;
  const transit = new TransitSystem(world, underground);
  const modifiers = createDefaultModifiers();
  const ai = new AntAISystem(world, surface, new VisibilityGrid(WORLD_WIDTH, WORLD_HEIGHT), modifiers);
  ai.setUndergroundAccess(underground, transit);
  const movement = new MovementSystem(world, surface, modifiers, underground);

  function ant(
    x: number,
    y: number,
    { role = AntRole.Worker, state, health = 1, hunger = 1 }: { role?: AntRole; state: AntState; health?: number; hunger?: number }
  ) {
    const id = createAnt(world, x, y, role);
    const a = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    a.state = state;
    a.stateTimer = 1; // past every "just switched state" grace window
    const hp = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
    hp.current = hp.max * health;
    const food = world.getComponent<HungerComponent>(id, COMPONENT.HUNGER)!;
    food.current = food.max * hunger;
    return {
      id,
      ant: a,
      carrying: world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!,
    };
  }

  return { world, ai, movement, transit, nest, ant };
}

describe('hurt ants heal by eating, never by parking at the nest', () => {
  it('a hurt but fed ant keeps working instead of walking home', () => {
    const { ai, ant } = setup();
    const { ant: a } = ant(NX + 6, NY, { state: AntState.Searching, health: 0.3 });

    ai.update(TICK);

    expect(a.state).not.toBe(AntState.ReturningHome);
  });

  it('a hurt but fed ant that reaches the nest goes back to work instead of standing there', () => {
    const { ai, transit, ant } = setup();
    const { id, ant: a } = ant(NX, NY, { state: AntState.ReturningHome, health: 0.3 });

    ai.update(TICK);

    expect(a.state).toBe(AntState.Searching);
    expect(transit.isInTransit(id)).toBe(false);
  });

  it('a wounded soldier keeps fighting instead of retreating home to heal', () => {
    const { world, ai, ant } = setup();
    const { id, ant: soldier } = ant(NX + 8, NY, { role: AntRole.Soldier, state: AntState.AttackingEnemy, health: 0.2 });
    const beetle = createBeetle(world, NX + 8.5, NY);
    ensureCombatComponent(world, id, beetle);

    ai.update(TICK);

    expect(soldier.state).toBe(AntState.AttackingEnemy);
  });

  it('a hungry ant that reaches the nest rides down to eat', () => {
    const { ai, transit, ant } = setup();
    const { id } = ant(NX, NY, { state: AntState.ReturningHome, hunger: 0.3 });

    ai.update(TICK);
    ai.update(TICK);

    expect(transit.isInTransit(id)).toBe(true);
  });

  it('a starving patrol soldier with nothing to eat below keeps patrolling instead of parking at the nest', () => {
    const { ai, ant } = setup({ pantry: 0 });
    ai.colonyPriority = ColonyPriority.Defend;
    const { ant: soldier } = ant(NX + 5, NY, { role: AntRole.Soldier, state: AntState.PatrollingNest, hunger: 0.2 });

    ai.update(TICK);

    expect(soldier.state).toBe(AntState.PatrollingNest);
  });
});

describe('entrance jam: non-worker foragers', () => {
  it.each([
    [AntRole.Soldier, 'leaf', 'foodStored'],
    [AntRole.Scout, 'mushroom', 'mushroomStored'],
    [AntRole.Soldier, 'meat', 'meatStored'],
  ] as const)(
    'a %s that brings %s home drops it on the nest stockpile instead of joining the worker-only porter chain',
    (role, type, counter) => {
      const { ai, transit, nest, ant } = setup();
      const before = { foodStored: nest.foodStored, mushroomStored: nest.mushroomStored, meatStored: nest.meatStored };
      const { id, ant: a, carrying } = ant(NX, NY, { role, state: AntState.ReturningHome });
      carrying.amount = 5;
      carrying.resourceType = type;

      ai.update(TICK);

      expect(a.state).toBe(AntState.Searching);
      expect(transit.isInTransit(id)).toBe(false);
      expect(carrying.amount).toBe(0);
      expect(nest.foodStored).toBe(before.foodStored + 5);
      if (counter !== 'foodStored') expect(nest[counter]).toBe(before[counter] + 5);
    }
  );

  it('a slow forager that reaches the entrance late still walks in instead of freezing there', () => {
    const { world, ai, movement, ant } = setup();
    const { id, ant: a, carrying } = ant(NX + 2, NY + 2, { state: AntState.ReturningHome });
    carrying.amount = 5;
    carrying.resourceType = 'leaf';
    a.stateTimer = 30; // past RETURNING_HOME_DROP_TIMEOUT, inside the entrance exemption
    const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;

    for (let t = 0; t < 3 * 60 && a.state === AntState.ReturningHome; t++) {
      ai.update(TICK);
      movement.update(TICK);
    }

    expect(Math.hypot(pos.x - NX, pos.y - NY)).toBeLessThan(2);
    expect(a.state).toBe(AntState.Hauling);
  });

  it('a worker that brings food home still carries it down itself', () => {
    const { ai, transit, nest, ant } = setup();
    const { id, ant: a, carrying } = ant(NX, NY, { state: AntState.ReturningHome });
    carrying.amount = 5;
    carrying.resourceType = 'leaf';

    ai.update(TICK);

    expect(a.state).toBe(AntState.Hauling);
    expect(transit.isInTransit(id)).toBe(true);
    expect(nest.foodStored).toBe(50);
  });
});
