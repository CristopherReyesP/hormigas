import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, AntRole, Layer, type LayerComponent, type PositionComponent } from '../components/components';
import { createAnt, createBeetle } from '../entities/factories';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { EXIT_GATE, type TransitSystem } from './TransitSystem';

vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('./RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

const TICK = 1 / 60;
const CX = Math.floor(WORLD_WIDTH / 2);
const CY = Math.floor(WORLD_HEIGHT / 2);

function setup() {
  const game = new GameManager(fakeCanvas(), { playerRace: 'swarm', rivalRace: 'wildlife' });
  finishIntro(game);
  const world = game['world'] as World;
  const transit = game['transitSystem'] as TransitSystem;
  const underground = game['undergroundGrid'] as UndergroundGrid;
  // Only the transit system runs: the test owns every ant
  const tickFor = (seconds: number) => {
    for (let t = 0; t < seconds; t += TICK) transit.update(TICK);
  };
  for (const other of world.query(COMPONENT.ANT)) world.destroyEntity(other);
  const entrance = underground.getEntrances()[0];
  /** An ant standing at the top of the shaft, asking to go out */
  const leaving = (role: AntRole) => {
    const id = createAnt(world, entrance.x + 0.5, entrance.y + 0.5, role);
    world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
    transit.requestTransit(id, 'exit');
    return id;
  };
  const outside = (id: number) => world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer === Layer.Surface;
  return { game, world, transit, tickFor, leaving, outside };
}

describe('the exit gate', () => {
  it('with no enemy by the entrance, ants walk out as before', () => {
    const { game, tickFor, leaving, outside } = setup();
    const worker = leaving(AntRole.Worker);
    tickFor(3);
    expect(outside(worker)).toBe(true);
    game.stop();
  });

  it('workers wait below while an enemy stands by the entrance, and come out once it is gone', () => {
    const { game, world, transit, tickFor, leaving, outside } = setup();
    const beetle = createBeetle(world, CX + 4, CY, null);
    const worker = leaving(AntRole.Worker);
    tickFor(6);
    expect(outside(worker)).toBe(false);
    expect(transit.heldCount()).toBe(1);

    const pos = world.getComponent<PositionComponent>(beetle, COMPONENT.POSITION)!;
    pos.x = pos.prevX = CX + EXIT_GATE.radius + 8;
    tickFor(1);
    expect(outside(worker)).toBe(true);
    game.stop();
  });

  it('soldiers gather at the shaft and sortie together', () => {
    const { game, world, tickFor, leaving, outside } = setup();
    createBeetle(world, CX + 4, CY, null);
    const first = [leaving(AntRole.Soldier), leaving(AntRole.Soldier), leaving(AntRole.Soldier)];
    const worker = leaving(AntRole.Worker);
    tickFor(5);
    expect(first.some(outside)).toBe(false);

    const fourth = leaving(AntRole.Soldier);
    tickFor(3);
    expect([...first, fourth].every(outside)).toBe(true);
    // The worker still waits: the fight is not hers
    expect(outside(worker)).toBe(false);
    game.stop();
  });

  it('nobody is kept below for ever', () => {
    const { game, world, tickFor, leaving, outside } = setup();
    createBeetle(world, CX + 4, CY, null);
    const worker = leaving(AntRole.Worker);
    tickFor(EXIT_GATE.maxWait + 4);
    expect(outside(worker)).toBe(true);
    game.stop();
  });
});
