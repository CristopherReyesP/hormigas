import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { TileGrid } from '../../simulation/world/TileGrid';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { TerrainType } from '../../simulation/world/types';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { createAnt, createBeetle, createBeetleDen, createCricketDen, createCrystalHive, createNest } from '../entities/factories';
import {
  AntRole,
  AntState,
  COMPONENT,
  ColonyPriority,
  Layer,
  OrderKind,
  type AntComponent,
  type BeetleDenComponent,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type PlayerOrderComponent,
  type PositionComponent,
} from '../components/components';
import { GUARD_HOME_RADIUS, ORDER_SETTLE_RADIUS, SOLDIER_ATTACK_RANGE, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { AntAISystem } from './AntAISystem';
import { MovementSystem } from './MovementSystem';
import { CombatSystem } from './CombatSystem';
import { TransitSystem } from './TransitSystem';
import {
  dispatchDenAttack,
  findEnemyAt,
  isFreeSoldier,
  issueAttackOrders,
  issueHoldOrders,
  issueMoveOrders,
  soundRetreatHorn,
  stopAnts,
} from './helpers/playerOrders';

const NX = Math.floor(WORLD_WIDTH / 2);
const NY = Math.floor(WORLD_HEIGHT / 2);
const TICK = 1 / 60;

/** Open dirt around the nest, the AI, movement and melee: wildlife stands still (no beetle AI). */
function setup() {
  const world = new World();
  const surface = new TileGrid();
  for (let dy = -24; dy <= 24; dy++) {
    for (let dx = -30; dx <= 30; dx++) {
      surface.setTile(NX + dx, NY + dy, { terrain: TerrainType.Dirt, walkable: true });
    }
  }
  const underground = new UndergroundGrid();
  createNest(world, NX, NY);
  const transit = new TransitSystem(world, underground);
  const modifiers = createDefaultModifiers();
  const ai = new AntAISystem(world, surface, new VisibilityGrid(WORLD_WIDTH, WORLD_HEIGHT), modifiers);
  ai.setUndergroundAccess(underground, transit);
  const movement = new MovementSystem(world, surface, modifiers, underground);
  const combat = new CombatSystem(world, surface);
  const tick = () => {
    ai.update(TICK);
    movement.update(TICK);
    combat.update(TICK);
  };
  const run = (seconds: number, until: () => boolean = () => false, each: () => void = () => {}) => {
    for (let i = 0; i < seconds * 60 && !until(); i++) {
      tick();
      each();
    }
  };
  const antOf = (id: number) => world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
  const posOf = (id: number) => world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
  const orderOf = (id: number) => world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER);
  const combatOf = (id: number) => world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
  const healthOf = (id: number) => world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
  const place = (id: number, x: number, y: number) => {
    const pos = posOf(id);
    pos.x = pos.prevX = x;
    pos.y = pos.prevY = y;
  };
  const dist = (id: number, x: number, y: number) => Math.hypot(posOf(id).x - x, posOf(id).y - y);
  const beetle = (x: number, y: number, health: number) => {
    const id = createBeetle(world, x, y);
    healthOf(id).current = health;
    return id;
  };
  return { world, surface, transit, ai, run, antOf, posOf, orderOf, combatOf, healthOf, place, dist, beetle };
}

describe('attack-target order', () => {
  it('chases its target past a closer enemy until it dies, then goes to defend the nest', () => {
    const { world, surface, run, antOf, orderOf, combatOf, healthOf, beetle } = setup();
    const soldier = createAnt(world, NX, NY, AntRole.Soldier);
    const target = beetle(NX + 10, NY, 30);
    const closer = beetle(NX - 3, NY, 30);

    const result = issueAttackOrders(world, surface, [soldier], target);
    expect(result?.ordered).toEqual([soldier]);
    expect(orderOf(soldier)).toMatchObject({ kind: OrderKind.Attack, targetId: target });

    run(30, () => !world.hasEntity(target), () => {
      if (!world.hasEntity(target)) return;
      expect(orderOf(soldier)?.kind).toBe(OrderKind.Attack);
      expect([target, null, undefined]).toContain(combatOf(soldier)?.targetEntityId);
    });
    expect(world.hasEntity(target)).toBe(false);
    expect(healthOf(closer).current).toBe(30);

    // The attack is done: no guard post out there, the colony AI takes over
    // and answers the predator sitting at the nest
    run(TICK * 2);
    expect(orderOf(soldier)).toBeUndefined();
    expect(antOf(soldier).state).not.toBe(AntState.Guarding);
    run(15, () => combatOf(soldier)?.targetEntityId === closer);
    expect(combatOf(soldier)?.targetEntityId).toBe(closer);
  });

  it('with Defend on, a soldier whose target died walks back to patrol the nest', () => {
    const { world, surface, ai, run, antOf, orderOf, dist, beetle } = setup();
    ai.colonyPriority = ColonyPriority.Defend;
    const soldier = createAnt(world, NX + 16, NY, AntRole.Soldier);
    const target = beetle(NX + 22, NY, 10);
    issueAttackOrders(world, surface, [soldier], target);
    run(20, () => !world.hasEntity(target));
    expect(world.hasEntity(target)).toBe(false);
    run(TICK * 2);
    expect(orderOf(soldier)).toBeUndefined();
    run(30, () => antOf(soldier).state === AntState.PatrollingNest && dist(soldier, NX, NY) < 8);
    expect(antOf(soldier).state).toBe(AntState.PatrollingNest);
    expect(dist(soldier, NX, NY)).toBeLessThan(8);
  });

  it('a worker goes back to its job once the target is dead', () => {
    const { world, surface, run, antOf, orderOf, beetle } = setup();
    const worker = createAnt(world, NX, NY, AntRole.Worker);
    const target = beetle(NX + 4, NY, 2);
    issueAttackOrders(world, surface, [worker], target);
    run(20, () => !world.hasEntity(target));
    expect(world.hasEntity(target)).toBe(false);
    run(TICK * 3);
    expect(orderOf(worker)).toBeUndefined();
    // Back to foraging: the kill even left meat right there
    expect([AntState.Searching, AntState.GoingToFood]).toContain(antOf(worker).state);
  });

  it('a scout, which cannot bite, walks to the target instead of fighting it', () => {
    const { world, surface, orderOf, beetle } = setup();
    const scout = createAnt(world, NX, NY, AntRole.Scout);
    const soldier = createAnt(world, NX, NY + 1, AntRole.Soldier);
    const target = beetle(NX + 8, NY, 30);
    const result = issueAttackOrders(world, surface, [scout, soldier], target);
    expect(result?.ordered.sort()).toEqual([scout, soldier].sort());
    expect(orderOf(soldier)?.kind).toBe(OrderKind.Attack);
    expect(orderOf(scout)?.kind).toBe(OrderKind.Move);
  });
});

describe('an ordered soldier commits to a far target', () => {
  // The ordered chase re-plans every ORDER_CHASE_REPATH_SECONDS, and A* starts
  // on the ant's own tile. Walking back to that tile's center first undid the
  // progress of each re-plan, so a soldier sent to a far den shuffled on the
  // spot (by the nest, looking like it stayed home to defend) until the order
  // timed out and left it on guard right there.
  for (const [label, dx, dy] of [['along a diagonal', 1, 1], ['along a row', 1, 0], ['along a column', 0, -1]] as const) {
    it(`walks all the way to a den ${label} and bites it`, () => {
      const { world, surface, run, antOf, orderOf, dist } = setup();
      const from = { x: NX - 14 * dx, y: NY - 14 * dy };
      const den = createBeetleDen(world, NX + 14 * dx, NY + 14 * dy);
      const denPos = world.getComponent<PositionComponent>(den, COMPONENT.POSITION)!;
      const soldiers = [0, 1, 2, 3].map((i) => createAnt(world, from.x + (i % 2) * 0.3, from.y + (i >> 1) * 0.3, AntRole.Soldier));
      issueAttackOrders(world, surface, soldiers, den);

      // About 28 tiles at soldier pace (1.7 tiles/s): well inside 30 seconds
      const allBiting = () => soldiers.every((id) => antOf(id).state === AntState.AttackingEnemy);
      run(30, allBiting, () => {
        for (const id of soldiers) expect(orderOf(id)?.kind).toBe(OrderKind.Attack);
      });
      for (const id of soldiers) {
        expect(orderOf(id)).toMatchObject({ kind: OrderKind.Attack, targetId: den });
        expect(dist(id, denPos.x, denPos.y)).toBeLessThan(SOLDIER_ATTACK_RANGE);
      }
    });
  }

  it('closes in on a far moving quarry instead of shuffling in place', () => {
    const { world, surface, run, orderOf, posOf, dist, beetle } = setup();
    const soldier = createAnt(world, NX - 12, NY - 12, AntRole.Soldier);
    const prey = beetle(NX + 12, NY + 12, 500);
    issueAttackOrders(world, surface, [soldier], prey);
    const start = dist(soldier, posOf(prey).x, posOf(prey).y);
    run(8);
    expect(orderOf(soldier)?.kind).toBe(OrderKind.Attack);
    // 8 seconds at 1.7 tiles/s covers most of the ~34 tiles
    expect(dist(soldier, posOf(prey).x, posOf(prey).y)).toBeLessThan(start - 8);
  });
});

describe('attack-move order', () => {
  it('fights an enemy that comes into view, then resumes the walk and arrives', () => {
    const { world, surface, run, antOf, orderOf, combatOf, dist, beetle } = setup();
    const soldier = createAnt(world, NX - 12, NY, AntRole.Soldier);
    const slot = { x: NX + 12, y: NY };
    const prey = beetle(NX, NY + 4, 20);
    issueMoveOrders(world, surface, [soldier], slot, null, OrderKind.AttackMove);
    expect(orderOf(soldier)?.kind).toBe(OrderKind.AttackMove);

    let fought = false;
    run(30, () => !world.hasEntity(prey), () => {
      if (combatOf(soldier)?.targetEntityId === prey) fought = true;
    });
    expect(fought).toBe(true);
    expect(world.hasEntity(prey)).toBe(false);
    expect(orderOf(soldier)?.kind).toBe(OrderKind.AttackMove);

    // Arrived with nothing left to fight: the order is done, no guard post
    run(30, () => !orderOf(soldier));
    expect(orderOf(soldier)).toBeUndefined();
    expect(dist(soldier, slot.x, slot.y)).toBeLessThanOrEqual(ORDER_SETTLE_RADIUS + 1);
    expect(antOf(soldier).state).not.toBe(AntState.Guarding);
  });

  it('onto a den: attacks the den on arrival until it falls, then the order ends', () => {
    const { world, surface, run, orderOf, antOf } = setup();
    const den = createBeetleDen(world, NX + 12, NY);
    const denComp = world.getComponent<BeetleDenComponent>(den, COMPONENT.BEETLE_DEN)!;
    denComp.health = 40;
    const soldiers = [createAnt(world, NX - 12, NY, AntRole.Soldier), createAnt(world, NX - 12, NY + 1, AntRole.Soldier)];
    issueMoveOrders(world, surface, soldiers, { x: NX + 12, y: NY }, null, OrderKind.AttackMove);

    let attackedDen = false;
    run(40, () => !world.hasEntity(den), () => {
      if (soldiers.some((id) => orderOf(id)?.kind === OrderKind.Attack && orderOf(id)?.targetId === den)) attackedDen = true;
      for (const id of soldiers) expect(orderOf(id)?.kind).not.toBe(OrderKind.Guard);
    });
    expect(attackedDen).toBe(true);
    expect(world.hasEntity(den)).toBe(false);
    run(TICK * 2);
    for (const id of soldiers) {
      expect(orderOf(id)).toBeUndefined();
      expect(antOf(id).state).not.toBe(AntState.Guarding);
    }
  });

  it('a plain move walks past the same enemy', () => {
    const { world, surface, run, orderOf, combatOf, healthOf, beetle } = setup();
    const soldier = createAnt(world, NX - 12, NY, AntRole.Soldier);
    const prey = beetle(NX, NY + 4, 20);
    issueMoveOrders(world, surface, [soldier], { x: NX + 12, y: NY });
    run(30, () => orderOf(soldier)?.kind === OrderKind.Guard, () => {
      expect(combatOf(soldier)?.targetEntityId ?? null).toBeNull();
    });
    expect(orderOf(soldier)?.kind).toBe(OrderKind.Guard);
    expect(healthOf(prey).current).toBe(20);
  });
});

describe('hold position', () => {
  it('fights only what comes into attack range and never chases', () => {
    const { world, run, antOf, posOf, orderOf, combatOf, healthOf, place, beetle } = setup();
    const soldier = createAnt(world, NX + 5, NY + 5, AntRole.Soldier);
    const enemy = beetle(NX + 8, NY + 5, 200);
    expect(issueHoldOrders(world, [soldier])).toEqual([soldier]);
    expect(orderOf(soldier)?.kind).toBe(OrderKind.Hold);
    const still = () => {
      expect(posOf(soldier).x).toBeCloseTo(NX + 5, 5);
      expect(posOf(soldier).y).toBeCloseTo(NY + 5, 5);
    };

    // In plain sight, out of reach: it stays put
    run(3, () => false, still);
    expect(combatOf(soldier)?.targetEntityId ?? null).toBeNull();
    expect(antOf(soldier).state).toBe(AntState.Holding);

    // Steps into reach: bitten, without a step toward it
    place(enemy, NX + 6, NY + 5);
    run(3, () => false, still);
    expect(healthOf(enemy).current).toBeLessThan(200);
    expect(combatOf(soldier)?.targetEntityId).toBe(enemy);

    // Backs off: the soldier lets it go
    place(enemy, NX + 9, NY + 5);
    run(3, () => false, still);
    expect(combatOf(soldier)?.targetEntityId ?? null).toBeNull();
    expect(orderOf(soldier)?.kind).toBe(OrderKind.Hold);
  });
});

describe('guard point', () => {
  it('a warrior that arrived fights what comes near its post, then walks back', () => {
    const { world, surface, run, orderOf, combatOf, dist, beetle } = setup();
    const soldier = createAnt(world, NX + 2, NY, AntRole.Soldier);
    issueMoveOrders(world, surface, [soldier], { x: NX + 10, y: NY + 6 });
    run(30, () => orderOf(soldier)?.kind === OrderKind.Guard);
    const post = { ...orderOf(soldier)!.target };
    expect(dist(soldier, post.x, post.y)).toBeLessThanOrEqual(ORDER_SETTLE_RADIUS);

    // Far from the post: ignored, even inside its vision
    const far = beetle(post.x + 10, post.y - 8, 20);
    const near = beetle(post.x + 5, post.y, 20);
    let fought = false;
    run(30, () => !world.hasEntity(near), () => {
      if (combatOf(soldier)?.targetEntityId === near) fought = true;
    });
    expect(fought).toBe(true);
    expect(world.hasEntity(near)).toBe(false);

    run(10, () => dist(soldier, post.x, post.y) <= GUARD_HOME_RADIUS);
    expect(dist(soldier, post.x, post.y)).toBeLessThanOrEqual(GUARD_HOME_RADIUS);
    // ...and it does not wander off to forage or patrol
    run(20);
    expect(orderOf(soldier)?.kind).toBe(OrderKind.Guard);
    expect(dist(soldier, post.x, post.y)).toBeLessThanOrEqual(GUARD_HOME_RADIUS);
    expect(world.hasEntity(far)).toBe(true);
  });

  it('a worker that arrives goes back to work instead', () => {
    const { world, surface, run, orderOf } = setup();
    const worker = createAnt(world, NX + 2, NY, AntRole.Worker);
    issueMoveOrders(world, surface, [worker], { x: NX + 8, y: NY });
    run(20, () => !orderOf(worker));
    expect(orderOf(worker)).toBeUndefined();
  });
});

describe('den attack from the command card', () => {
  it('gives the closest free soldiers a real attack order on the den', () => {
    const { world, surface, run, orderOf, antOf } = setup();
    const den = createBeetleDen(world, NX + 15, NY);
    const near = createAnt(world, NX + 12, NY, AntRole.Soldier);
    const mid = createAnt(world, NX + 10, NY, AntRole.Soldier);
    const far = createAnt(world, NX + 6, NY, AntRole.Soldier);
    const busy = createAnt(world, NX + 14, NY, AntRole.Soldier);
    issueMoveOrders(world, surface, [busy], { x: NX, y: NY + 10 });
    const worker = createAnt(world, NX + 13, NY, AntRole.Worker);
    const below = createAnt(world, NX + 13, NY + 1, AntRole.Soldier);
    world.getComponent<LayerComponent>(below, COMPONENT.LAYER)!.layer = Layer.Underground;
    for (const id of [near, mid, far, below]) antOf(id).state = AntState.Searching;

    expect([near, mid, far, busy, worker, below].filter((id) => isFreeSoldier(world, id))).toEqual([near, mid, far]);
    expect(dispatchDenAttack(world, surface, den, 2)).toEqual([near, mid]);
    for (const id of [near, mid]) expect(orderOf(id)).toMatchObject({ kind: OrderKind.Attack, targetId: den });
    expect(orderOf(far)).toBeUndefined();
    expect(orderOf(busy)?.kind).toBe(OrderKind.Move);
    expect(isFreeSoldier(world, far)).toBe(true);

    const denHealth = () => world.getComponent<BeetleDenComponent>(den, COMPONENT.BEETLE_DEN)!.health;
    const full = denHealth();
    run(10, () => denHealth() < full);
    expect(denHealth()).toBeLessThan(full);
  });

  it('refuses anything that is not a den', () => {
    const { world, surface, beetle } = setup();
    createAnt(world, NX + 2, NY, AntRole.Soldier);
    expect(dispatchDenAttack(world, surface, beetle(NX + 4, NY, 30), 5)).toEqual([]);
  });
});

describe('orders end on command', () => {
  function orderedSquad() {
    const made = setup();
    const { world, surface, beetle } = made;
    const mover = createAnt(world, NX + 2, NY, AntRole.Worker);
    issueMoveOrders(world, surface, [mover], { x: NX + 15, y: NY });
    const attacker = createAnt(world, NX + 3, NY, AntRole.Soldier);
    issueAttackOrders(world, surface, [attacker], beetle(NX + 12, NY + 4, 200));
    const holder = createAnt(world, NX + 4, NY, AntRole.Soldier);
    issueHoldOrders(world, [holder]);
    const guard = createAnt(world, NX + 5, NY, AntRole.Soldier);
    issueMoveOrders(world, surface, [guard], { x: NX + 5, y: NY });
    made.run(1, () => made.orderOf(guard)?.kind === OrderKind.Guard);
    expect(made.orderOf(guard)?.kind).toBe(OrderKind.Guard);
    return { ...made, mover, attacker, holder, guard };
  }

  it('the retreat horn clears every order and sends everybody home', () => {
    const { world, antOf, orderOf, mover, attacker, holder, guard } = orderedSquad();
    const porter = createAnt(world, NX + 1, NY, AntRole.Worker);
    antOf(porter).state = AntState.FetchingFood;

    expect(soundRetreatHorn(world)).toBe(4);
    for (const id of [mover, attacker, holder, guard]) expect(orderOf(id)).toBeUndefined();
    expect(antOf(mover).state).toBe(AntState.ReturningHome);
    for (const id of [attacker, holder, guard]) expect(antOf(id).state).toBe(AntState.PatrollingNest);
    expect(antOf(porter).state).toBe(AntState.FetchingFood);
  });

  it('Detener drops every kind of order; autonomous ants are untouched', () => {
    const { world, antOf, orderOf, combatOf, mover, attacker, holder, guard } = orderedSquad();
    const forager = createAnt(world, NX + 6, NY, AntRole.Worker);
    antOf(forager).state = AntState.GoingToFood;

    expect(stopAnts(world, [mover, attacker, holder, guard, forager])).toBe(4);
    for (const id of [mover, attacker, holder, guard]) {
      expect(orderOf(id)).toBeUndefined();
      expect(antOf(id).state).toBe(AntState.Idle);
    }
    expect(combatOf(attacker)?.targetEntityId ?? null).toBeNull();
    expect(antOf(forager).state).toBe(AntState.GoingToFood);
  });
});

describe('picking the enemy under a right-click', () => {
  it('finds a seen beetle or a known den near the click, and nothing on bare ground', () => {
    const { world, beetle } = setup();
    const seen = beetle(NX + 5, NY, 30);
    const hidden = beetle(NX - 5, NY, 30);
    const den = createBeetleDen(world, NX, NY + 12);
    const below = beetle(NX + 5, NY + 6, 30);
    world.getComponent<LayerComponent>(below, COMPONENT.LAYER)!.layer = Layer.Underground;
    // Beetles show only where the colony sees now; dens stay on explored ground
    const canSee = (x: number, _y: number, den: boolean) => (den ? true : x > NX);

    expect(findEnemyAt(world, { x: NX + 5.8, y: NY + 0.6 }, canSee)).toBe(seen);
    expect(findEnemyAt(world, { x: NX - 5, y: NY }, canSee)).toBeNull();
    expect(findEnemyAt(world, { x: NX + 1, y: NY + 12.8 }, canSee)).toBe(den);
    expect(findEnemyAt(world, { x: NX + 5, y: NY + 6 }, canSee)).toBeNull();
    expect(findEnemyAt(world, { x: NX + 9, y: NY - 7 }, canSee)).toBeNull();
    expect(world.hasEntity(hidden)).toBe(true);
  });

  // Player report: "sigo sin poder atacar bases". Bases are big sprites (a den
  // spans 2.5 tiles, the hive's spires rise about 3.5 tiles above its core),
  // but only a click within 1.5 tiles of the center hit them: a click on the
  // rest of the sprite became a plain move, and the soldiers never attacked.
  it('a click anywhere on a base sprite hits the base, not the ground next to it', () => {
    const { world } = setup();
    const beetleDen = createBeetleDen(world, NX - 10, NY);
    const cricketDen = createCricketDen(world, NX + 10, NY);
    const hive = createCrystalHive(world, NX, NY + 12);
    const canSee = () => true;

    for (const [den, x] of [[beetleDen, NX - 10], [cricketDen, NX + 10]] as const) {
      // The corners of the 2.5-tile sprite
      expect(findEnemyAt(world, { x: x + 1.15, y: NY - 1.15 }, canSee)).toBe(den);
      expect(findEnemyAt(world, { x: x - 1.15, y: NY + 1.15 }, canSee)).toBe(den);
      expect(findEnemyAt(world, { x: x + 2.5, y: NY }, canSee)).toBeNull();
    }
    // The hive's crown of spires above it, and its crater rim at the sides
    expect(findEnemyAt(world, { x: NX + 0.5, y: NY + 12 - 3.2 }, canSee)).toBe(hive);
    expect(findEnemyAt(world, { x: NX - 1.8, y: NY + 12 - 0.5 }, canSee)).toBe(hive);
    expect(findEnemyAt(world, { x: NX + 1.5, y: NY + 12 + 1.2 }, canSee)).toBe(hive);
    expect(findEnemyAt(world, { x: NX, y: NY + 12 + 3 }, canSee)).toBeNull();
    expect(findEnemyAt(world, { x: NX + 3.5, y: NY + 12 }, canSee)).toBeNull();
  });
});

describe('an attack on a base fights its guards first', () => {
  it('ignores a threat far from the base that is not biting it', () => {
    const { world, surface, run, orderOf, beetle } = setup();
    const den = createBeetleDen(world, NX + 20, NY);
    const soldier = createAnt(world, NX + 4, NY, AntRole.Soldier);
    issueAttackOrders(world, surface, [soldier], den);
    beetle(NX + 2, NY + 3, 40); // back home, standing still
    run(2);
    expect(orderOf(soldier)).toMatchObject({ kind: OrderKind.Attack, targetId: den });
  });

  it('turns on a guard that comes close on the way, then goes back to the base', () => {
    const { world, surface, run, orderOf, combatOf, healthOf, beetle } = setup();
    const den = createBeetleDen(world, NX + 20, NY);
    const soldier = createAnt(world, NX + 4, NY, AntRole.Soldier);
    issueAttackOrders(world, surface, [soldier], den);
    // A guard by the den, on the soldier's way
    const guard = beetle(NX + 14, NY + 2, 40);
    run(15, () => orderOf(soldier)?.targetId === guard);
    // The guard is the fight now; the den stays the goal
    expect(orderOf(soldier)).toMatchObject({ kind: OrderKind.Attack, targetId: guard, goalId: den });
    run(30, () => !world.hasEntity(guard) || healthOf(guard).current <= 0);
    expect(!world.hasEntity(guard) || healthOf(guard).current <= 0).toBe(true);
    run(1);
    expect(orderOf(soldier)).toMatchObject({ kind: OrderKind.Attack, targetId: den });
    expect(combatOf(soldier)?.targetEntityId === den || combatOf(soldier)?.targetEntityId === null).toBe(true);
  });
});
