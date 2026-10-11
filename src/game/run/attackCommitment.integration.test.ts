import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import {
  AntRole,
  AntState,
  COMPONENT,
  ColonyPriority,
  OrderKind,
  type AntComponent,
  type PlayerOrderComponent,
  type PositionComponent,
} from '../components/components';
import { createAnt, createBeetle } from '../entities/factories';
import { SOLDIER_ATTACK_RANGE } from '../../shared/constants';
import { fakeCanvas, finishIntro, CRYSTAL_RIVAL_SETUP } from '../../test/gameManagerMocks';

// Real manager and map; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

/** A seeded Math.random (mulberry32), so the map and the run are the same every time. */
function seedRandom(seed: number) {
  let a = seed >>> 0;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// Player report: "hay un conflicto con los soldados cuando van a atacar, no se
// deciden si atacar o defender". Soldiers sent at the Crystal Hive shuffled in
// place by the nest: each re-plan of the ordered chase sent them back to the
// center of the tile they stood on, so the ones on a diagonal route never left
// home, and after 90 s the order timed out and left them on guard at the nest.
describe('soldiers sent to attack commit to it', () => {
  it('Atacar guarida on the hive, with Defend on and a threat at the nest: every soldier reaches it and bites', () => {
    seedRandom(1);
    const game = new GameManager(fakeCanvas(), CRYSTAL_RIVAL_SETUP);
    finishIntro(game);
    const world = game['world'] as World;
    const update = (dt: number) => game['update'](dt);
    // These test the controls on a bare base: no fortifications, no guard army
    world.removeSystem('RivalFortifySystem');
    const nest = world.getComponent<PositionComponent>(world.query(COMPONENT.NEST, COMPONENT.POSITION)[0], COMPONENT.POSITION)!;
    const hive = world.query(COMPONENT.CRYSTAL_HIVE)[0];
    const hivePos = world.getComponent<PositionComponent>(hive, COMPONENT.POSITION)!;

    const soldiers = Array.from({ length: 8 }, (_, i) =>
      createAnt(world, nest.x + 2 + (i % 4) * 0.5, nest.y + 2 + Math.floor(i / 4), AntRole.Soldier));
    game.setColonyPriority(ColonyPriority.Defend);
    update(1 / 30);
    expect(game.dispatchAttackWave(hive, soldiers.length)).toBe(soldiers.length);
    // Something to defend at home while they are away
    createBeetle(world, nest.x + 4, nest.y - 3);

    const bit = new Set<number>();
    const minDistToHive = new Map<number, number>();
    for (let t = 0; t < 75 * 30; t++) {
      update(1 / 30);
      for (const id of soldiers) {
        if (!world.hasEntity(id)) continue;
        // The attack order is never traded for a guard post or the colony AI on the way
        // (a guard of the hive may be fought first: the hive stays the goal)
        const order = world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER);
        expect(order?.kind).toBe(OrderKind.Attack);
        expect(order?.targetId === hive || order?.goalId === hive).toBe(true);
        const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        const d = Math.hypot(pos.x - hivePos.x, pos.y - hivePos.y);
        minDistToHive.set(id, Math.min(minDistToHive.get(id) ?? Infinity, d));
        if (world.getComponent<AntComponent>(id, COMPONENT.ANT)!.state === AntState.AttackingEnemy) bit.add(id);
      }
    }

    for (const id of soldiers) {
      expect({ id, closest: minDistToHive.get(id)! < SOLDIER_ATTACK_RANGE }).toEqual({ id, closest: true });
      expect(bit.has(id)).toBe(true);
    }
    game.stop();
  });
});
