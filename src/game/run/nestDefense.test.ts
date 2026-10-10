// The balance pass's nest defense rules: the queen bites invaders in reach,
// drafted foragers bite as hard as any draftee, no leaper den on the first
// days, and the Human command center shoots back.

import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { TileGrid } from '../../simulation/world/TileGrid';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import {
  AntRole,
  COMPONENT,
  Layer,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type NestComponent,
} from '../components/components';
import { createAnt, createBeetle, createNest, createQueen } from '../entities/factories';
import {
  CRICKET_DEN_GRACE_SECONDS,
  CRICKET_SPAWN_FOOD_THRESHOLD,
  INVASION_CIVILIAN_ATTACK_DAMAGE,
  QUEEN_ARMOR,
  QUEEN_BITE,
  ROLE_STATS,
  UNDERGROUND_HEIGHT,
  UNDERGROUND_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../shared/constants';
import { DayNightSystem } from '../systems/DayNightSystem';
import { TransitSystem } from '../systems/TransitSystem';
import { UndergroundInvasionSystem } from '../systems/UndergroundInvasionSystem';
import { CricketSpawnSystem } from '../systems/CricketSpawnSystem';
import { HUMAN_BUILDING_STATS } from '../rival/humanBase';
import { createPlayerHumanBuilding } from '../races/human/humanPlayerFactories';
import { armorOf } from '../systems/helpers/combatHelpers';
import { applyQueenUpgrades } from '../upgrades/applyUpgrades';

function nest() {
  const world = new World();
  const ug = new UndergroundGrid();
  const dayNight = new DayNightSystem(world, createDefaultModifiers());
  const invasion = new UndergroundInvasionSystem(world, ug, new TransitSystem(world, ug), dayNight);
  const qx = Math.floor(UNDERGROUND_WIDTH / 2) + 0.5;
  const qy = Math.floor(UNDERGROUND_HEIGHT / 2) + 0.5;
  const queen = createQueen(world, qx, qy);
  /** A wave beetle inside the nest at (x, y) */
  const invader = (x: number, y: number) => {
    const id = createBeetle(world, x, y, null);
    world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
    (invasion['invaders'] as Set<number>).add(id);
    return id;
  };
  const drive = () => (invasion as unknown as { driveDefenders(): void }).driveDefenders();
  return { world, invasion, queen, qx, qy, invader, drive };
}

describe('the queen defends herself', () => {
  it('has her own armor before any upgrade', () => {
    const { world, queen } = nest();
    applyQueenUpgrades(world);
    expect(armorOf(world, queen)).toBe(QUEEN_ARMOR);
  });

  it('bites the nearest invader in her reach, and nothing out of it', () => {
    const { world, queen, qx, qy, invader, drive } = nest();
    const combat = world.getComponent<CombatComponent>(queen, COMPONENT.COMBAT)!;
    expect(combat).toMatchObject({ attackDamage: QUEEN_BITE.damage, attackRange: QUEEN_BITE.range, targetEntityId: null });

    const far = invader(qx + 6, qy);
    drive();
    expect(combat.targetEntityId).toBeNull();

    const near = invader(qx + 1, qy);
    drive();
    expect(combat.targetEntityId).toBe(near);

    world.destroyEntity(near);
    drive();
    expect(combat.targetEntityId).toBeNull();
    expect(world.hasEntity(far)).toBe(true);
  });
});

describe('drafted foragers in the nest', () => {
  it('bite as hard as a draftee while the wave is inside, and go back to their own bite after', () => {
    const { world, invasion, qx, qy, invader, drive } = nest();
    const worker = createAnt(world, qx + 3, qy, AntRole.Worker);
    world.getComponent<LayerComponent>(worker, COMPONENT.LAYER)!.layer = Layer.Underground;
    // A forager that fought on the surface already carries its weak surface bite
    world.addComponent<CombatComponent>(worker, COMPONENT.COMBAT, {
      attackDamage: ROLE_STATS.worker.damage, attackRange: 1.2, attackCooldown: 1, attackTimer: 0, targetEntityId: null,
    });
    const beetle = invader(qx + 4, qy);
    drive();
    const combat = world.getComponent<CombatComponent>(worker, COMPONENT.COMBAT)!;
    expect(combat.targetEntityId).toBe(beetle);
    expect(combat.attackDamage).toBe(Math.max(ROLE_STATS.worker.damage, INVASION_CIVILIAN_ATTACK_DAMAGE));

    // The wave is gone: the draft is over
    world.destroyEntity(beetle);
    (invasion['invaders'] as Set<number>).clear();
    drive();
    expect(combat.attackDamage).toBe(world.getComponent<HealthComponent>(worker, COMPONENT.HEALTH)!.damage);
  });
});

describe('the draft only answers invaders inside the nest', () => {
  it('leaves the colony at work while the wave is still on the surface, and drafts it once they break in', () => {
    const { world, invasion, qx, qy, invader, drive } = nest();
    const worker = createAnt(world, qx + 3, qy, AntRole.Worker);
    world.getComponent<LayerComponent>(worker, COMPONENT.LAYER)!.layer = Layer.Underground;
    const ant = world.getComponent<{ state: string }>(worker, COMPONENT.ANT)!;
    ant.state = 'hauling';
    // A raider (or a marching beetle) on the surface: part of the wave, but not in the nest
    const outside = createBeetle(world, qx + 2, qy, null);
    (invasion['invaders'] as Set<number>).add(outside);
    drive();
    expect(ant.state).toBe('hauling');
    expect((invasion['drafted'] as Set<number>).has(worker)).toBe(false);

    // Inside, the whole nest fights
    invader(qx + 4, qy);
    drive();
    expect(ant.state).toBe('attacking_enemy');
    expect((invasion['drafted'] as Set<number>).has(worker)).toBe(true);
  });
});

describe('the leapers wait', () => {
  it('raise no den during the first days, however much food the colony holds', () => {
    const world = new World();
    const nestId = createNest(world, Math.floor(WORLD_WIDTH / 2), Math.floor(WORLD_HEIGHT / 2));
    world.getComponent<NestComponent>(nestId, COMPONENT.NEST)!.foodStored = CRICKET_SPAWN_FOOD_THRESHOLD * 4;
    const spawner = new CricketSpawnSystem(world, new TileGrid(), new UndergroundGrid(), createDefaultModifiers());
    const dt = 1;
    for (let t = 0; t < CRICKET_DEN_GRACE_SECONDS - 1; t += dt) spawner.update(dt);
    expect(world.query(COMPONENT.CRICKET_DEN)).toHaveLength(0);
    for (let t = 0; t < 5; t += dt) spawner.update(dt);
    expect(world.query(COMPONENT.CRICKET_DEN)).toHaveLength(1);
  });
});

describe('the Human command center', () => {
  it('shoots back like the Crystal Hive does', () => {
    expect(HUMAN_BUILDING_STATS.command_center.damage).toBeGreaterThan(0);
    const world = new World();
    const core = createPlayerHumanBuilding(world, 'command_center', 20, 20);
    expect(world.getComponent<CombatComponent>(core, COMPONENT.COMBAT)).toMatchObject({
      attackDamage: HUMAN_BUILDING_STATS.command_center.damage,
      attackRange: HUMAN_BUILDING_STATS.command_center.attackRange,
    });
  });
});
