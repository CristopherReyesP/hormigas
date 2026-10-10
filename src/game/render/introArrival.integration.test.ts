import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import { TILE_SIZE } from '../../shared/constants';
import { COMPONENT, type PositionComponent } from '../components/components';
import { HUMAN_COMPONENT, type HumanBuildingComponent } from '../rival/humanComponents';
import type { RunSetup } from '../run/RunSetup';
import type { IntroArrival } from './introArrival';
import { fakeCanvas } from '../../test/gameManagerMocks';

// Real manager, map, rival bases and intro director; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
/** What the GameManager handed the (fake) render system for the opening */
const staged: Array<{ crater: { x: number; y: number }; arrival: IntroArrival | undefined }> = [];
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem({
  startMeteorIntro(crater: { x: number; y: number }, _nest: unknown, _clock: unknown, arrival?: IntroArrival) {
    staged.push({ crater, arrival });
  },
}));
vi.stubGlobal('window', new EventTarget());

const games: GameManager[] = [];

function run(rivalRace: RunSetup['rivalRace']) {
  staged.length = 0;
  const game = new GameManager(fakeCanvas(), { playerRace: 'swarm', rivalRace });
  games.push(game);
  expect(staged).toHaveLength(1);
  const director = game['introDirector'] as unknown as { impact: { x: number; y: number } };
  return { game, ...staged[0], directorTarget: director.impact };
}

const center = (t: { x: number; y: number }) => ({ x: t.x * TILE_SIZE + TILE_SIZE / 2, y: t.y * TILE_SIZE + TILE_SIZE / 2 });

afterEach(() => {
  for (const game of games.splice(0)) game.stop();
});

describe('the opening lands on the chosen rival', () => {
  it('Colmena de Cristal: the meteor strikes the hive site, the crater', () => {
    const { game, crater, arrival, directorTarget } = run('crystal');
    expect(arrival?.variant).toBe('crystal');
    expect(arrival?.target).toEqual(game.getCraterSite());
    const hive = game['world'].query(COMPONENT.CRYSTAL_HIVE, COMPONENT.POSITION)[0];
    const pos = game['world'].getComponent<PositionComponent>(hive, COMPONENT.POSITION)!;
    expect({ x: Math.round(pos.x), y: Math.round(pos.y) }).toEqual(arrival?.target);
    expect(crater).toEqual(game.getCraterSite());
    expect(directorTarget).toEqual(center(game.getCraterSite()));
    expect(arrival?.rivalLine).toBe('RIVAL: COLMENA DE CRISTAL');
  });

  it('Humanos: the dropship lands on the command center, away from the crater', () => {
    const { game, crater, arrival, directorTarget } = run('human');
    expect(arrival?.variant).toBe('human');
    const world = game['world'];
    const core = world.query(HUMAN_COMPONENT.BUILDING, COMPONENT.POSITION)
      .find((id) => world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind === 'command_center')!;
    const pos = world.getComponent<PositionComponent>(core, COMPONENT.POSITION)!;
    const site = { x: Math.round(pos.x), y: Math.round(pos.y) };
    expect(arrival?.target).toEqual(site);
    expect(site).not.toEqual(game.getCraterSite());
    // The camera chase and the lit trail go to the base, not the crater
    expect(directorTarget).toEqual(center(site));
    // The crater stays where it is (its shard field is still a resource)
    expect(crater).toEqual(game.getCraterSite());
    // The arrival raises the real base: every building and the starting troops
    expect(arrival?.base?.buildings.map((b) => b.kind).sort()).toEqual(['barracks', 'bunker', 'command_center', 'supply_depot']);
    expect(arrival?.base?.buildings[0]).toMatchObject({ kind: 'command_center', ...site });
    expect(arrival?.base?.troops.length).toBeGreaterThanOrEqual(2);
    expect(arrival?.rivalLine).toBe('RIVAL: HUMANOS');
  });

  it('Fauna salvaje: a plain impact on the crater, with no base to bring in', () => {
    const { game, arrival, directorTarget } = run('wildlife');
    expect(arrival?.variant).toBe('wildlife');
    expect(arrival?.target).toEqual(game.getCraterSite());
    expect(arrival?.base).toBeUndefined();
    expect(directorTarget).toEqual(center(game.getCraterSite()));
    expect(arrival?.rivalLine).toBe('RIVAL: FAUNA SALVAJE');
  });
});
