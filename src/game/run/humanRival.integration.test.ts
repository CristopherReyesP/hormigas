import { describe, expect, it, vi } from 'vitest';
import { GameManager, type GameOverStats } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, type HealthComponent, type PositionComponent } from '../components/components';
import { FactionId, ownerOf } from '../factions/factions';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent } from '../rival/humanFactories';

// Real manager and map; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

const DT = 1 / 30;

function setup() {
  const game = new GameManager(fakeCanvas(), { playerRace: 'swarm', rivalRace: 'human' });
  finishIntro(game);
  const world = game['world'] as World;
  const state = game as unknown as { gameOver: GameOverStats | null; update: (dt: number) => void };
  const buildings = () => world.query(HUMAN_COMPONENT.BUILDING);
  const kindOf = (id: number) => world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind;
  const core = () => buildings().find((id) => kindOf(id) === 'command_center')!;
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) state.update(DT);
  };
  return { game, world, state, buildings, kindOf, core, run };
}

describe('the Humans as the rival', () => {
  it('spawns the human base and no Crystal Hive', () => {
    const { game, world, buildings, kindOf, core } = setup();
    expect(world.query(COMPONENT.CRYSTAL_HIVE)).toHaveLength(0);
    expect(buildings().map(kindOf).sort()).toEqual(['barracks', 'bunker', 'command_center', 'supply_depot']);
    expect(ownerOf(world, core())).toBe(FactionId.RIVAL);
    expect(world.factions.get(FactionId.RIVAL)).toMatchObject({ race: 'human', controller: 'ai', coreId: core() });
    game.stop();
  });

  it('puts the base on the far side of the map, away from the nest and the crater', () => {
    const { game, world, core } = setup();
    const pos = world.getComponent<PositionComponent>(core(), COMPONENT.POSITION)!;
    const nest = world.getComponent<PositionComponent>(world.query(COMPONENT.NEST)[0], COMPONENT.POSITION)!;
    const crater = game.getCraterSite();
    expect(Math.hypot(pos.x - nest.x, pos.y - nest.y)).toBeGreaterThan(25);
    expect(Math.hypot(pos.x - crater.x, pos.y - crater.y)).toBeGreaterThan(15);
    game.stop();
  });

  it('the night waves come from the human base', () => {
    const { game, world, core, run } = setup();
    const corePos = world.getComponent<PositionComponent>(core(), COMPONENT.POSITION)!;
    const dayNight = game['dayNightSystem'] as unknown as { phaseTimer: number };
    dayNight.phaseTimer = 0.5;
    run(1);
    const assaulting = world.query(HUMAN_COMPONENT.UNIT).filter(
      (id) => world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.state === 'assaulting',
    );
    expect(assaulting.length).toBeGreaterThanOrEqual(2);
    for (const id of assaulting) {
      const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      expect(Math.hypot(pos.x - corePos.x, pos.y - corePos.y)).toBeLessThan(10);
    }
    const info = game.getStats().invasion;
    expect(info.active).toBe(true);
    expect(world.notifications.some((n) => /human/i.test(n.message))).toBe(true);
    game.stop();
  });

  it('destroying the command center wins the run', () => {
    const { game, world, state, core } = setup();
    world.getComponent<HealthComponent>(core(), COMPONENT.HEALTH)!.current = 0;
    world.destroyEntity(core());
    state.update(DT);
    expect(state.gameOver?.outcome).toBe('victory');
    expect(state.gameOver?.rivalCoreDestroyed).toBe('human');
    game.stop();
  });

  it('the run goes on while the command center stands, even with other buildings down', () => {
    const { game, world, state, buildings, kindOf } = setup();
    for (const id of buildings()) if (kindOf(id) !== 'command_center') world.destroyEntity(id);
    state.update(DT);
    expect(state.gameOver).toBeNull();
    game.stop();
  });

  it('a dead queen still loses the run', () => {
    const { game, world, state, core } = setup();
    world.destroyEntity(core());
    for (const queen of world.query(COMPONENT.QUEEN_ENTITY)) {
      world.getComponent<HealthComponent>(queen, COMPONENT.HEALTH)!.current = 0;
    }
    state.update(DT);
    expect(state.gameOver?.outcome).toBe('defeat');
    game.stop();
  });

  it('the base can be selected and shows its card', () => {
    const { game, world, core } = setup();
    const selection = game['selectionSystem'] as unknown as { selectOnly(id: number): void };
    selection.selectOnly(core());
    const sel = game.getSelectedEntity();
    expect(sel?.type).toBe('human_building');
    expect(sel?.human?.name).toBe('Centro de Mando');
    expect(world.getComponent(core(), COMPONENT.SELECTABLE)).toBeTruthy();
    game.stop();
  });
});
