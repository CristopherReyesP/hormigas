import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { TileGrid } from '../../simulation/world/TileGrid';
import { createAnt, createBeetle } from '../entities/factories';
import { createCrystalUnit } from '../rival/crystalFactories';
import { createHumanUnit } from '../rival/humanFactories';
import {
  AntRole,
  COMPONENT,
  Layer,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type RoleStatsComponent,
} from '../components/components';
import type { ShieldComponent } from '../rival/crystalShield';
import { armorOf } from '../systems/helpers/combatHelpers';
import { CombatSystem } from '../systems/CombatSystem';
import { EliteSystem } from '../systems/EliteSystem';
import { ELITE_AFFIXES, ELITE_TUNING, eliteOf, makeElite } from './eliteAffixes';
import { dealDamage, waveRuntimeFor } from './waveRuntime';
import { BEETLE_STATS } from '../../shared/constants';
import type { EntityId } from '../../shared/types';

function setup() {
  const world = new World();
  const combat = new CombatSystem(world, new TileGrid());
  const elites = new EliteSystem(world);
  const run = (seconds: number, dt = 1 / 20) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      elites.update(dt);
      combat.update(dt);
    }
  };
  return { world, combat, elites, run };
}

const underground = (world: World, id: EntityId) => {
  world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
  return id;
};
const hp = (world: World, id: EntityId) => world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
const speedOf = (world: World, id: EntityId) => world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS)!.speedMultiplier;

describe('elite affixes', () => {
  it('names every affix in Spanish with an icon and a color', () => {
    expect(Object.values(ELITE_AFFIXES).map((a) => a.name)).toEqual(['Explosivo', 'Sanador', 'Blindado', 'Veloz', 'Furioso']);
    for (const a of Object.values(ELITE_AFFIXES)) {
      expect(a.icon.length).toBeGreaterThan(0);
      expect(a.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('an elite is tougher than its plain kind and carries its affix', () => {
    const { world } = setup();
    const id = createBeetle(world, 5, 5);
    makeElite(world, id, 'swift');
    expect(eliteOf(world, id)?.affix).toBe('swift');
    expect(hp(world, id).max).toBe(Math.round(BEETLE_STATS.health * ELITE_TUNING.healthMult));
    expect(hp(world, id).current).toBe(hp(world, id).max);
  });

  it('Veloz moves faster', () => {
    const { world } = setup();
    const id = createBeetle(world, 5, 5);
    const base = speedOf(world, id);
    makeElite(world, id, 'swift');
    expect(speedOf(world, id)).toBeCloseTo(base * ELITE_TUNING.swiftSpeed);
  });

  it('Blindado adds armor to beetles and Human troops, and a bigger shield to Crystal units', () => {
    const { world } = setup();
    const beetle = createBeetle(world, 5, 5);
    makeElite(world, beetle, 'armored');
    expect(armorOf(world, beetle)).toBe(ELITE_TUNING.armoredArmor);

    const trooper = createHumanUnit(world, 'soldier', 8, 8);
    const before = armorOf(world, trooper);
    makeElite(world, trooper, 'armored');
    expect(armorOf(world, trooper)).toBe(before + ELITE_TUNING.armoredArmor);

    const drone = createCrystalUnit(world, 'drone', 10, 10);
    const shieldBefore = world.getComponent<ShieldComponent>(drone, COMPONENT.SHIELD)!.max;
    makeElite(world, drone, 'armored');
    const shield = world.getComponent<ShieldComponent>(drone, COMPONENT.SHIELD)!;
    expect(shield.max).toBe(shieldBefore + ELITE_TUNING.armoredShield);
    expect(shield.current).toBe(shield.max);
    expect(armorOf(world, drone)).toBe(0);
  });

  it('Furioso enrages once under 30% health: harder, faster hits and a quicker stride', () => {
    const { world, run } = setup();
    const id = underground(world, createBeetle(world, 5, 5));
    makeElite(world, id, 'furious');
    const combat = world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!;
    const damage = combat.attackDamage;
    const cooldown = combat.attackCooldown;
    const speed = speedOf(world, id);
    run(0.2);
    expect(eliteOf(world, id)!.enraged).toBe(false);
    hp(world, id).current = hp(world, id).max * 0.29;
    run(0.2);
    expect(eliteOf(world, id)!.enraged).toBe(true);
    expect(combat.attackDamage).toBe(Math.round(damage * ELITE_TUNING.furiousDamage));
    expect(combat.attackCooldown).toBeCloseTo(cooldown * ELITE_TUNING.furiousCooldown);
    expect(speedOf(world, id)).toBeCloseTo(speed * ELITE_TUNING.furiousSpeed);
    run(1);
    // Once only: it does not stack every tick
    expect(combat.attackDamage).toBe(Math.round(damage * ELITE_TUNING.furiousDamage));
  });

  it('Sanador heals hurt allies nearby on a pulse, never ants, and shows a green pulse', () => {
    const { world, run } = setup();
    const healer = underground(world, createBeetle(world, 5, 5));
    makeElite(world, healer, 'healer');
    const ally = underground(world, createBeetle(world, 6, 5));
    const far = underground(world, createBeetle(world, 20, 5));
    const ant = underground(world, createAnt(world, 5, 6, AntRole.Soldier));
    hp(world, ally).current = 100;
    hp(world, far).current = 100;
    hp(world, ant).current = 10;
    run(ELITE_TUNING.healerInterval + 0.1);
    expect(hp(world, ally).current).toBe(100 + Math.round(hp(world, ally).max * ELITE_TUNING.healerShare));
    expect(hp(world, far).current).toBe(100);
    expect(hp(world, ant).current).toBe(10);
    expect(waveRuntimeFor(world).fx.some((f) => f.kind === 'heal')).toBe(true);
  });

  it('Explosivo blows up after a short telegraph and only hurts ants in the blast', () => {
    const { world, run } = setup();
    const bomb = underground(world, createBeetle(world, 10, 10));
    makeElite(world, bomb, 'explosive');
    const near = underground(world, createAnt(world, 11, 10, AntRole.Soldier));
    const far = underground(world, createAnt(world, 10 + ELITE_TUNING.explosionRadius + 2, 10, AntRole.Soldier));
    const friend = underground(world, createBeetle(world, 10, 11));
    const nearHp = hp(world, near).current;
    dealDamage(world, bomb, 99999);
    run(0.1);
    expect(world.hasEntity(bomb)).toBe(false);
    const blast = waveRuntimeFor(world).explosions;
    expect(blast).toHaveLength(1);
    // The telegraph: nothing yet
    expect(hp(world, near).current).toBe(nearHp);
    run(ELITE_TUNING.explosionDelay + 0.1);
    expect(blast).toHaveLength(0);
    expect(hp(world, near).current).toBe(nearHp - ELITE_TUNING.explosionDamage);
    expect(hp(world, far).current).toBe(hp(world, far).max);
    expect(hp(world, friend).current).toBe(hp(world, friend).max);
  });

  it('an explosion that kills an ant buries it like any other death', () => {
    const { world, run } = setup();
    const bomb = underground(world, createBeetle(world, 10, 10));
    makeElite(world, bomb, 'explosive');
    const victim = underground(world, createAnt(world, 10.5, 10, AntRole.Worker));
    hp(world, victim).current = 5;
    dealDamage(world, bomb, 99999);
    run(ELITE_TUNING.explosionDelay + 0.3);
    expect(world.hasEntity(victim)).toBe(false);
  });

  it('works on every rival unit kind', () => {
    const { world } = setup();
    const units = [
      createBeetle(world, 1, 1),
      createCrystalUnit(world, 'drone', 2, 2),
      createHumanUnit(world, 'marksman', 3, 3),
    ];
    for (const id of units) {
      makeElite(world, id, 'furious');
      expect(eliteOf(world, id)?.affix).toBe('furious');
    }
  });
});
