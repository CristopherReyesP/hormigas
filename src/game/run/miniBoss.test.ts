import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { TileGrid } from '../../simulation/world/TileGrid';
import { createAnt } from '../entities/factories';
import { createCrystalUnit } from '../rival/crystalFactories';
import { createHumanUnit } from '../rival/humanFactories';
import { HUMAN_COMPONENT, type HumanUnitComponent } from '../rival/humanComponents';
import { HUMAN_UNIT_STATS } from '../rival/humanBase';
import {
  AntRole,
  COMPONENT,
  CrystalUnitState,
  Layer,
  type CombatComponent,
  type CrystalUnitComponent,
  type HealthComponent,
  type LayerComponent,
  type RoleStatsComponent,
} from '../components/components';
import type { ShieldComponent } from '../rival/crystalShield';
import { armorOf } from '../systems/helpers/combatHelpers';
import { applyHumanSplash } from '../systems/HumanCombat';
import { CombatSystem } from '../systems/CombatSystem';
import { WaveBossSystem } from '../systems/WaveBossSystem';
import { BOSS_TUNING, MINI_BOSSES, bossOf, createColossus, makeMiniBoss } from './miniBoss';
import { BEETLE_STATS } from '../../shared/constants';
import type { EntityId } from '../../shared/types';

function setup() {
  const world = new World();
  const spawned: EntityId[] = [];
  const bosses = new WaveBossSystem(world, { onSpawn: (id) => spawned.push(id) });
  const combat = new CombatSystem(world, new TileGrid());
  const run = (seconds: number, dt = 1 / 20) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      bosses.update(dt);
      combat.update(dt);
    }
  };
  return { world, bosses, run, spawned };
}

const hp = (world: World, id: EntityId) => world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
const speedOf = (world: World, id: EntityId) => world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS)!.speedMultiplier;
const underground = (world: World, id: EntityId) => {
  world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
  return id;
};

describe('mini-bosses', () => {
  it('each rival has its named boss with a unique ability', () => {
    expect(MINI_BOSSES.colossus.name).toBe('Acorazado Colosal');
    expect(MINI_BOSSES.prism.name).toBe('Prisma Guardián');
    expect(MINI_BOSSES.colonel.name).toBe('Coronel en Tanque Pesado');
    const abilities = new Set(Object.values(MINI_BOSSES).map((b) => b.ability));
    expect(abilities.size).toBe(3);
  });

  it('the Acorazado Colosal is a huge underground beetle that grows with each boss wave', () => {
    const { world } = setup();
    const first = createColossus(world, 10, 10, 1);
    const second = createColossus(world, 20, 10, 2);
    expect(world.getComponent<LayerComponent>(first, COMPONENT.LAYER)!.layer).toBe(Layer.Underground);
    expect(world.getComponent(first, COMPONENT.BEETLE)).toBeDefined();
    expect(bossOf(world, first)?.kind).toBe('colossus');
    expect(hp(world, first).max).toBeGreaterThan(BEETLE_STATS.health * 3);
    expect(hp(world, second).max).toBeGreaterThan(hp(world, first).max);
  });

  it('the Acorazado Colosal winds up, then charges its prey: fast, ramming every ant in its way once', () => {
    const { world, run } = setup();
    const boss = createColossus(world, 10, 10, 1);
    const prey = underground(world, createAnt(world, 15, 10, AntRole.Soldier));
    const inTheWay = underground(world, createAnt(world, 10.6, 10, AntRole.Soldier));
    world.getComponent<CombatComponent>(boss, COMPONENT.COMBAT)!.targetEntityId = prey;
    const base = speedOf(world, boss);
    const state = bossOf(world, boss)!;
    run(BOSS_TUNING.colossus.firstCharge + 0.05);
    expect(state.phase).toBe('windup');
    expect(speedOf(world, boss)).toBeLessThan(base); // it digs in before the charge
    run(BOSS_TUNING.colossus.windup + 0.05);
    expect(state.phase).toBe('charging');
    expect(speedOf(world, boss)).toBeCloseTo(base * BOSS_TUNING.colossus.chargeSpeed);
    const hpAfterRam = hp(world, inTheWay).current;
    expect(hpAfterRam).toBe(hp(world, inTheWay).max - BOSS_TUNING.colossus.chargeDamage);
    run(0.3);
    expect(hp(world, inTheWay).current).toBe(hpAfterRam); // once per charge
    run(BOSS_TUNING.colossus.chargeTime);
    expect(state.phase).toBe('idle');
    expect(speedOf(world, boss)).toBeCloseTo(base);
  });

  it('the Acorazado Colosal does not charge prey that is already in its jaws or too far', () => {
    const { world, run } = setup();
    const boss = createColossus(world, 10, 10, 1);
    const prey = underground(world, createAnt(world, 10.8, 10, AntRole.Soldier));
    world.getComponent<CombatComponent>(boss, COMPONENT.COMBAT)!.targetEntityId = prey;
    run(BOSS_TUNING.colossus.firstCharge + 1);
    expect(bossOf(world, boss)!.phase).toBe('idle');
  });

  it('the Prisma Guardián is a heavily shielded crystal that keeps spawning small shards', () => {
    const { world, run, spawned } = setup();
    const prism = createCrystalUnit(world, 'drone', 30, 30);
    const unit = world.getComponent<CrystalUnitComponent>(prism, COMPONENT.CRYSTAL_UNIT)!;
    unit.state = CrystalUnitState.Assaulting;
    unit.goal = { x: 60, y: 45 };
    makeMiniBoss(world, prism, 'prism', 2);
    expect(bossOf(world, prism)?.name).toBe('Prisma Guardián');
    expect(unit.kind).toBe('sentinel');
    const shield = world.getComponent<ShieldComponent>(prism, COMPONENT.SHIELD)!;
    expect(shield.max).toBeGreaterThanOrEqual(BOSS_TUNING.prism.shield);
    run(BOSS_TUNING.prism.spawnInterval + 0.1);
    expect(spawned).toHaveLength(BOSS_TUNING.prism.shardsPerSpawn);
    for (const id of spawned) {
      const shard = world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!;
      expect(shard.state).toBe(CrystalUnitState.Assaulting);
      expect(shard.goal).toEqual({ x: 60, y: 45 });
      expect(hp(world, id).max).toBeLessThan(150);
    }
    run(BOSS_TUNING.prism.spawnInterval * 10);
    expect(spawned.length).toBeLessThanOrEqual(BOSS_TUNING.prism.maxShards);
    expect(spawned.filter((id) => world.hasEntity(id))).toHaveLength(BOSS_TUNING.prism.maxShards);
  });

  it('the Coronel en Tanque Pesado drives a heavy tank whose shells splash wider', () => {
    const { world } = setup();
    const colonel = createHumanUnit(world, 'soldier', 30, 30);
    makeMiniBoss(world, colonel, 'colonel', 1);
    expect(world.getComponent<HumanUnitComponent>(colonel, HUMAN_COMPONENT.UNIT)!.type).toBe('tank');
    expect(hp(world, colonel).max).toBeGreaterThan(HUMAN_UNIT_STATS.tank.health * 2);
    const target = createAnt(world, 34, 30, AntRole.Soldier);
    const wide = createAnt(world, 34 + HUMAN_UNIT_STATS.tank.splashRadius + 0.5, 30, AntRole.Soldier);
    const before = hp(world, wide).current;
    applyHumanSplash(world, colonel, target, 40);
    expect(hp(world, wide).current).toBeLessThan(before);
  });

  it('the Coronel armors the Human troops around him while he lives', () => {
    const { world, run } = setup();
    const colonel = createHumanUnit(world, 'soldier', 30, 30);
    makeMiniBoss(world, colonel, 'colonel', 1);
    const near = createHumanUnit(world, 'soldier', 32, 30);
    const far = createHumanUnit(world, 'soldier', 30 + BOSS_TUNING.colonel.auraRadius + 3, 30);
    const base = armorOf(world, far);
    run(0.2);
    expect(armorOf(world, near)).toBe(base + BOSS_TUNING.colonel.auraArmor);
    expect(armorOf(world, far)).toBe(base);
    world.destroyEntity(colonel);
    run(0.2);
    expect(armorOf(world, near)).toBe(base);
  });
});
