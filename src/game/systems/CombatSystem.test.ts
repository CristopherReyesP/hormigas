import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { TileGrid } from '../../simulation/world/TileGrid';
import { createAnt, createBeetle, createBeetleDen, createCricket } from '../entities/factories';
import {
  AntRole,
  COMPONENT,
  FoodType,
  Layer,
  type BeetleDenComponent,
  type CombatComponent,
  type FoodSourceComponent,
  type HealthComponent,
  type LayerComponent,
} from '../components/components';
import { CombatSystem } from './CombatSystem';
import { combatVfxFor, type VfxSlot } from '../vfx/CombatVfx';

function setup() {
  const world = new World();
  const system = new CombatSystem(world, new TileGrid());
  const vfx = combatVfxFor(world);

  /** Give `id` a ready-to-swing attack on `target` */
  function arm(id: number, target: number, damage = 5) {
    world.addComponent<CombatComponent>(id, COMPONENT.COMBAT, {
      attackDamage: damage, attackRange: 2, attackCooldown: 1, attackTimer: 0, targetEntityId: target,
    });
  }

  function effects(kind: VfxSlot['kind']): VfxSlot[] {
    return [...vfx.particles, ...vfx.decals].filter((s) => s.alive && s.kind === kind);
  }

  return { world, system, vfx, arm, effects };
}

function meatOf(world: World, type: FoodType): number {
  return world.query(COMPONENT.FOOD_SOURCE)
    .filter((id) => world.getComponent<FoodSourceComponent>(id, COMPONENT.FOOD_SOURCE)!.resourceType === type)
    .length;
}

describe('CombatSystem — combat VFX', () => {
  it('a soldier biting a beetle spits acid droplets, flashes a cross and chips its chitin', () => {
    const { world, system, arm, effects } = setup();
    const soldier = createAnt(world, 10, 10, AntRole.Soldier);
    const beetle = createBeetle(world, 11, 10);
    arm(soldier, beetle);

    system.update(1 / 60);

    expect(effects('droplet').length).toBeGreaterThanOrEqual(3);
    expect(effects('cross')).toHaveLength(1);
    expect(effects('debris').every((d) => d.style === 'chitin')).toBe(true);
    expect(effects('debris').length).toBeGreaterThan(0);
  });

  it('a beetle biting an ant throws Swarm flesh, no acid', () => {
    const { world, system, effects } = setup();
    const ant = createAnt(world, 10, 10);
    const beetle = createBeetle(world, 11, 10);
    const bite = world.getComponent<CombatComponent>(beetle, COMPONENT.COMBAT)!;
    bite.targetEntityId = ant;
    bite.attackTimer = 0;

    system.update(1 / 60);

    expect(effects('droplet')).toHaveLength(0);
    expect(effects('debris').length).toBeGreaterThan(0);
    expect(effects('debris').every((d) => d.style === 'flesh')).toBe(true);
  });

  it('a slain beetle leaves its carcass AND still drops meat', () => {
    const { world, system, arm, effects } = setup();
    const soldier = createAnt(world, 10, 10, AntRole.Soldier);
    const beetle = createBeetle(world, 11, 10);
    world.getComponent<HealthComponent>(beetle, COMPONENT.HEALTH)!.current = 1;
    arm(soldier, beetle, 50);

    system.update(1 / 60);

    expect(world.hasEntity(beetle)).toBe(false);
    const carcass = effects('carcass');
    expect(carcass).toHaveLength(1);
    expect(carcass[0].style).toBe('beetle');
    expect(effects('flash')).toHaveLength(1);
    expect(meatOf(world, FoodType.BeetleMeat)).toBe(1);
  });

  it('a slain cricket leaves a cricket carcass and cricket meat', () => {
    const { world, system, arm, effects } = setup();
    const soldier = createAnt(world, 10, 10, AntRole.Soldier);
    const cricket = createCricket(world, 11, 10);
    world.getComponent<HealthComponent>(cricket, COMPONENT.HEALTH)!.current = 1;
    arm(soldier, cricket, 50);

    system.update(1 / 60);

    expect(effects('carcass')[0].style).toBe('cricket');
    expect(meatOf(world, FoodType.CricketMeat)).toBe(1);
  });

  it('a slain ant leaves Swarm goo on the layer it died on', () => {
    const { world, system, effects } = setup();
    const ant = createAnt(world, 10, 10);
    world.getComponent<LayerComponent>(ant, COMPONENT.LAYER)!.layer = Layer.Underground;
    world.getComponent<HealthComponent>(ant, COMPONENT.HEALTH)!.current = 1;
    const beetle = createBeetle(world, 11, 10);
    world.getComponent<LayerComponent>(beetle, COMPONENT.LAYER)!.layer = Layer.Underground;
    const bite = world.getComponent<CombatComponent>(beetle, COMPONENT.COMBAT)!;
    bite.targetEntityId = ant;
    bite.attackTimer = 0;
    bite.attackDamage = 50;

    system.update(1 / 60);

    const goo = effects('goo');
    expect(goo).toHaveLength(1);
    expect(goo[0].layer).toBe(Layer.Underground);
    expect(effects('carcass')).toHaveLength(0);
  });

  it('a destroyed den collapses in a dust ring with crystal shards', () => {
    const { world, system, arm, effects } = setup();
    const soldier = createAnt(world, 10, 10, AntRole.Soldier);
    const den = createBeetleDen(world, 11, 10);
    world.getComponent<BeetleDenComponent>(den, COMPONENT.BEETLE_DEN)!.health = 1;
    arm(soldier, den, 50);

    system.update(1 / 60);

    expect(effects('ring')).toHaveLength(1);
    expect(effects('debris').some((d) => d.style === 'shard')).toBe(true);
  });

  it('ages its effects in game time: no ticks while paused, gone after their life', () => {
    const { world, system, vfx, arm } = setup();
    const soldier = createAnt(world, 10, 10, AntRole.Soldier);
    const beetle = createBeetle(world, 11, 10);
    arm(soldier, beetle);
    system.update(1 / 60);
    // Drop the target so no new hits spawn while we wait
    world.getComponent<CombatComponent>(soldier, COMPONENT.COMBAT)!.targetEntityId = null;
    world.getComponent<CombatComponent>(beetle, COMPONENT.COMBAT)!.targetEntityId = null;
    const spawned = vfx.countAlive();
    expect(spawned).toBeGreaterThan(0);

    system.update(0);
    expect(vfx.countAlive()).toBe(spawned);

    for (let i = 0; i < 60 * 5; i++) system.update(1 / 60);
    expect(vfx.countAlive()).toBe(0);
  });
});

describe('CombatSystem — meat piles', () => {
  function slay(world: World, system: CombatSystem, arm: (id: number, target: number, damage?: number) => void, x: number, y: number) {
    const soldier = createAnt(world, x - 1, y, AntRole.Soldier);
    const beetle = createBeetle(world, x, y);
    world.getComponent<HealthComponent>(beetle, COMPONENT.HEALTH)!.current = 1;
    arm(soldier, beetle, 50);
    system.update(1 / 60);
    world.destroyEntity(soldier);
  }

  it('kills on the same spot pile their meat together', () => {
    const { world, system, arm } = setup();
    slay(world, system, arm, 10, 10);
    const pile = world.query(COMPONENT.FOOD_SOURCE)[0];
    const one = world.getComponent<FoodSourceComponent>(pile, COMPONENT.FOOD_SOURCE)!.amount;
    slay(world, system, arm, 10.5, 10);

    expect(meatOf(world, FoodType.BeetleMeat)).toBe(1);
    const food = world.getComponent<FoodSourceComponent>(pile, COMPONENT.FOOD_SOURCE)!;
    expect(food.amount).toBe(one * 2);
    expect(food.maxAmount).toBe(one * 2);
  });

  it('a kill farther away leaves a pile of its own', () => {
    const { world, system, arm } = setup();
    slay(world, system, arm, 10, 10);
    slay(world, system, arm, 20, 10);
    expect(meatOf(world, FoodType.BeetleMeat)).toBe(2);
  });
});
