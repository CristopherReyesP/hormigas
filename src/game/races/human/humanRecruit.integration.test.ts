import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../../GameManager';
import type { World } from '../../../engine/ecs/World';
import type { EntityId } from '../../../shared/types';
import { COMPONENT, type PositionComponent } from '../../components/components';
import { FactionId, ownerOf } from '../../factions/factions';
import { fakeCanvas, finishIntro } from '../../../test/gameManagerMocks';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent } from '../../rival/humanComponents';
import { HUMAN_BUILDING_STATS, HUMAN_UNIT_STATS } from '../../rival/humanBase';
import type { SelectionSystem } from '../../systems/SelectionSystem';
import { HUMAN_PLAYER_COMPONENT, type HumanProducerComponent } from './humanPlayerComponents';
import { PLAYER_HUMAN_START } from './humanPlayerRules';

// Real manager and map; browser-only adapters are replaced.
vi.mock('../../../engine/input/InputManager', async () =>
  (await import('../../../test/gameManagerMocks')).mockInputManager());
vi.mock('../../systems/RenderSystem', async () => (await import('../../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

const DT = 1 / 30;
const NO_BARRACKS = 'Necesitas un Cuartel: selecciona un constructor → Construir → Cuartel';

function start() {
  const game = new GameManager(fakeCanvas(), { playerRace: 'human', rivalRace: 'crystal' });
  finishIntro(game);
  const world = game['world'] as World;
  const selection = game['selectionSystem'] as SelectionSystem;
  const state = game as unknown as { update: (dt: number) => void };
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) state.update(DT);
  };
  const mine = (type: string) => world.query(HUMAN_COMPONENT.UNIT).filter((id) => ownerOf(world, id) === FactionId.PLAYER
    && world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type === type);
  const myBuildings = (kind: string) => world.query(HUMAN_COMPONENT.BUILDING).filter((id) => ownerOf(world, id) === FactionId.PLAYER
    && world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind === kind);
  const pos = (id: EntityId) => world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
  return { game, world, selection, run, mine, myBuildings, pos, human: game.getHumanPlayer()! };
}

describe('recruiting soldiers in a Humans run', () => {
  it('starts with a finished Cuartel beside the command center and the reduced mineral bank', () => {
    const { game, world, myBuildings, pos } = start();
    const [barracks] = myBuildings('barracks');
    expect(barracks).toBeDefined();
    expect(world.getComponent<HumanBuildingComponent>(barracks, HUMAN_COMPONENT.BUILDING)!.constructing).toBe(0);
    const [core] = myBuildings('command_center');
    expect(Math.hypot(pos(barracks).x - pos(core).x, pos(barracks).y - pos(core).y)).toBeLessThanOrEqual(8);
    expect(game.getStats().human!.minerals).toBe(PLAYER_HUMAN_START.minerals);
    game.stop();
  });

  it('Entrenar Soldado on the command center queues at the Cuartel, and the soldier walks out of it', () => {
    const { game, world, run, mine, myBuildings, pos, human } = start();
    const [barracks] = myBuildings('barracks');
    expect(human.selectCore()).toBe(true);
    const card = game.getStats().human!.selected!;
    expect(card.kind).toBe('command_center');
    expect(card.trains.map((t) => t.type)).toEqual(['builder', 'soldier', 'marksman', 'tank']);
    expect(card.trains.find((t) => t.type === 'soldier')!.reason).toBeNull();
    expect(card.trains.find((t) => t.type === 'tank')!.reason).toMatch(/^Necesitas una Fábrica/);

    const soldiersBefore = mine('soldier');
    expect(human.train('soldier')).toBeNull();
    const producer = world.getComponent<HumanProducerComponent>(barracks, HUMAN_PLAYER_COMPONENT.PRODUCER)!;
    expect(producer.queue).toEqual(['soldier']);
    // Not at the command center
    const coreQueue = world.getComponent<HumanProducerComponent>(myBuildings('command_center')[0], HUMAN_PLAYER_COMPONENT.PRODUCER)!;
    expect(coreQueue.queue).toEqual([]);
    // A tank has nowhere to queue
    expect(human.train('tank')).toMatch(/^Necesitas una Fábrica/);

    run(HUMAN_UNIT_STATS.soldier.trainTime + 1);
    const fresh = mine('soldier').filter((id) => !soldiersBefore.includes(id));
    expect(fresh).toHaveLength(1);
    const b = pos(barracks);
    const s = pos(fresh[0]);
    expect(Math.hypot(s.x - b.x, s.y - b.y)).toBeLessThan(HUMAN_BUILDING_STATS.barracks.halfWidth + 3);
    game.stop();
  });

  it('without a Cuartel, the command center explains how to get one', () => {
    const { game, world, myBuildings, human } = start();
    world.destroyEntity(myBuildings('barracks')[0]);
    human.selectCore();
    const soldier = game.getStats().human!.selected!.trains.find((t) => t.type === 'soldier')!;
    expect(soldier.reason).toBe(NO_BARRACKS);
    expect(human.train('soldier')).toBe(NO_BARRACKS);
    game.stop();
  });

  it('Construir Cuartel selects the nearest idle builder and starts the placement ghost', () => {
    const { game, world, selection, mine, human } = start();
    world.minerals.deposit(200);
    human.selectCore();
    expect(human.startBarracksPlacement()).toBeNull();
    const picked = selection.getSelectedAnts();
    expect(picked).toHaveLength(1);
    expect(mine('builder')).toContain(picked[0]);
    expect(human.isPlacing()).toBe(true);
    expect(game.getStats().human!.placing?.kind).toBe('barracks');
    game.stop();
  });

  it('Construir Cuartel says why when the bank is short', () => {
    const { game, human } = start();
    human.selectCore();
    expect(human.startBarracksPlacement()).toMatch(/minerales/);
    expect(human.isPlacing()).toBe(false);
    game.stop();
  });

  it('the empty Soldados chip selects the Cuartel and says where soldiers are trained', () => {
    const { game, world, selection, mine, myBuildings } = start();
    for (const id of mine('soldier')) world.destroyEntity(id);
    const result = game.quickSelect('human-soldier');
    expect(result.selected).toBe(0);
    expect(result.notice).toBe('Entrena soldados en el Cuartel');
    expect(selection.getSelectedEntityId()).toBe(myBuildings('barracks')[0]);
    expect(game.getStats().human!.selected?.kind).toBe('barracks');
    game.stop();
  });
});
