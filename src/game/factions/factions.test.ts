import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { AntRole, COMPONENT, type OwnerComponent } from '../components/components';
import {
  createAnt,
  createBeetle,
  createBeetleDen,
  createCricket,
  createCricketDen,
  createEgg,
  createFood,
  createNest,
  createQueen,
} from '../entities/factories';
import { FactionId, FactionRegistry, isHostile, ownerOf, relation, type Relation } from './factions';

const { WILDLIFE, PLAYER, RIVAL } = FactionId;

describe('relation between factions', () => {
  it('follows the ally / neutral / enemy matrix', () => {
    const matrix: Array<[FactionId, FactionId, Relation]> = [
      [PLAYER, PLAYER, 'ally'],
      [RIVAL, RIVAL, 'ally'],
      [WILDLIFE, WILDLIFE, 'ally'],
      [PLAYER, RIVAL, 'enemy'],
      [RIVAL, PLAYER, 'enemy'],
      [PLAYER, WILDLIFE, 'neutral'],
      [WILDLIFE, PLAYER, 'neutral'],
      [RIVAL, WILDLIFE, 'neutral'],
      [WILDLIFE, RIVAL, 'neutral'],
    ];
    for (const [a, b, expected] of matrix) expect(relation(a, b), `${a} vs ${b}`).toBe(expected);
  });

  it('treats everything but an ally as hostile', () => {
    expect(isHostile('ally')).toBe(false);
    expect(isHostile('neutral')).toBe(true);
    expect(isHostile('enemy')).toBe(true);
  });
});

describe('ownerOf', () => {
  /** A bare entity carrying one marker component and no OWNER */
  function bare(world: World, component: string): number {
    const id = world.createEntity();
    world.addComponent(id, component, {});
    return id;
  }

  it('falls back to the player for colony entities without OWNER', () => {
    const world = new World();
    for (const component of [COMPONENT.ANT, COMPONENT.NEST, COMPONENT.QUEEN, COMPONENT.QUEEN_ENTITY, COMPONENT.EGG]) {
      expect(ownerOf(world, bare(world, component)), component).toBe(PLAYER);
    }
  });

  it('falls back to wildlife for beetles, crickets and their dens without OWNER', () => {
    const world = new World();
    for (const component of [COMPONENT.BEETLE, COMPONENT.CRICKET, COMPONENT.BEETLE_DEN, COMPONENT.CRICKET_DEN]) {
      expect(ownerOf(world, bare(world, component)), component).toBe(WILDLIFE);
    }
  });

  it('returns null for unowned things and missing entities', () => {
    const world = new World();
    expect(ownerOf(world, bare(world, COMPONENT.FOOD_SOURCE))).toBeNull();
    expect(ownerOf(world, world.createEntity())).toBeNull();
    expect(ownerOf(world, 9999)).toBeNull();
  });

  it('reads OWNER first, over the component fallback', () => {
    const world = new World();
    const rivalAnt = bare(world, COMPONENT.ANT);
    world.addComponent<OwnerComponent>(rivalAnt, COMPONENT.OWNER, { faction: RIVAL });
    const tamedBeetle = bare(world, COMPONENT.BEETLE);
    world.addComponent<OwnerComponent>(tamedBeetle, COMPONENT.OWNER, { faction: PLAYER });
    const wildFood = bare(world, COMPONENT.FOOD_SOURCE);
    world.addComponent<OwnerComponent>(wildFood, COMPONENT.OWNER, { faction: WILDLIFE });

    expect(ownerOf(world, rivalAnt)).toBe(RIVAL);
    expect(ownerOf(world, tamedBeetle)).toBe(PLAYER);
    expect(ownerOf(world, wildFood)).toBe(WILDLIFE);
  });
});

describe('factory owners', () => {
  const stamped = (world: World, id: number) => world.getComponent<OwnerComponent>(id, COMPONENT.OWNER)?.faction;

  it('stamps the player on ants, the nest, the queen and eggs by default', () => {
    const world = new World();
    expect(stamped(world, createAnt(world, 5, 5))).toBe(PLAYER);
    expect(stamped(world, createAnt(world, 5, 5, AntRole.Soldier))).toBe(PLAYER);
    expect(stamped(world, createNest(world, 5, 5))).toBe(PLAYER);
    expect(stamped(world, createQueen(world, 5, 5))).toBe(PLAYER);
    expect(stamped(world, createEgg(world, 5, 5, AntRole.Worker, 10))).toBe(PLAYER);
  });

  it('stamps a given faction on colony entities', () => {
    const world = new World();
    expect(stamped(world, createAnt(world, 5, 5, AntRole.Worker, RIVAL))).toBe(RIVAL);
    expect(stamped(world, createNest(world, 5, 5, RIVAL))).toBe(RIVAL);
    expect(stamped(world, createQueen(world, 5, 5, RIVAL))).toBe(RIVAL);
    expect(stamped(world, createEgg(world, 5, 5, AntRole.Worker, 10, RIVAL))).toBe(RIVAL);
  });

  it('stamps wildlife on beetles, crickets and both dens, and leaves food unowned', () => {
    const world = new World();
    expect(stamped(world, createBeetle(world, 5, 5))).toBe(WILDLIFE);
    expect(stamped(world, createCricket(world, 5, 5))).toBe(WILDLIFE);
    expect(stamped(world, createBeetleDen(world, 5, 5))).toBe(WILDLIFE);
    expect(stamped(world, createCricketDen(world, 5, 5))).toBe(WILDLIFE);
    expect(stamped(world, createFood(world, 5, 5))).toBeUndefined();
  });
});

describe('the faction registry', () => {
  it('holds one human Swarm player and the wildlife by default', () => {
    const world = new World();
    expect(world.factions.list()).toEqual([
      { id: WILDLIFE, race: 'wildlife', controller: 'none' },
      { id: PLAYER, race: 'swarm', controller: 'human' },
    ]);
    expect(world.factions.get(PLAYER)).toMatchObject({ race: 'swarm', controller: 'human' });
    expect(world.factions.has(RIVAL)).toBe(false);
    expect(world.factions.get(RIVAL)).toBeUndefined();
  });

  it('is instance state: each world gets its own registry and faction records', () => {
    const a = new World();
    const b = new World();
    expect(a.factions).not.toBe(b.factions);
    a.factions.get(PLAYER)!.coreId = 42;
    expect(b.factions.get(PLAYER)!.coreId).toBeUndefined();
    expect(new FactionRegistry().get(PLAYER)!.coreId).toBeUndefined();
  });

  it('takes a custom roster and rejects a repeated id', () => {
    const registry = new FactionRegistry([
      { id: PLAYER, race: 'swarm', controller: 'human' },
      { id: RIVAL, race: 'crystal', controller: 'ai' },
    ]);
    expect(registry.list().map((faction) => faction.id)).toEqual([PLAYER, RIVAL]);
    expect(() => new FactionRegistry([
      { id: RIVAL, race: 'crystal', controller: 'ai' },
      { id: RIVAL, race: 'human', controller: 'ai' },
    ])).toThrow(/faction 2/);
  });

  it('can be handed to a world', () => {
    const registry = new FactionRegistry();
    expect(new World(undefined, registry).factions).toBe(registry);
  });
});
