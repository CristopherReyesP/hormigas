import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, Layer, type CombatComponent, type HealthComponent, type LayerComponent, type PositionComponent } from '../components/components';
import { createBeetle } from '../entities/factories';
import { fakeCanvas, finishIntro, CRYSTAL_RIVAL_SETUP } from '../../test/gameManagerMocks';
import { setAudioSink, type AudioEvent } from '../../audio/events';
import { NEST_CLEAR_GRACE, NEST_REALERT_SECONDS } from './nestAlert';

// Real manager, map and simulation; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

const DT = 1 / 30;

function setup() {
  const game = new GameManager(fakeCanvas(), CRYSTAL_RIVAL_SETUP);
  finishIntro(game);
  const world = game['world'] as World;
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) game['update'](DT);
  };
  const queen = world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.POSITION)[0];
  const queenPos = world.getComponent<PositionComponent>(queen, COMPONENT.POSITION)!;
  /** A beetle inside the nest at (x, y): sturdy and toothless, so the test decides when it leaves */
  const invade = (x: number, y: number) => {
    const id = createBeetle(world, x, y, null);
    world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
    const hp = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
    hp.max = hp.current = 1e6;
    const combat = world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (combat) combat.attackDamage = 0;
    hp.damage = 0;
    return id;
  };
  const nest = () => game.getStats().nestAlert!;
  return { game, world, run, queen, queenPos, invade, nest };
}

afterEach(() => setAudioSink(null));

describe('invaders inside the nest, in a real run', () => {
  it('counts the hostile units on each layer', () => {
    const { game, run, queenPos, invade } = setup();
    expect(game.getInvaderCount('underground')).toBe(0);
    invade(queenPos.x + 6, queenPos.y);
    invade(queenPos.x + 7, queenPos.y);
    run(DT);
    expect(game.getInvaderCount('underground')).toBe(2);
    // Wildlife roaming the surface is not an attack on the colony
    expect(game.getInvaderCount('surface')).toBe(0);
    game.stop();
  });

  it('raises the breach alert once, with the alarm, and tells the nest tab how many are inside', () => {
    const { game, run, queenPos, invade, nest } = setup();
    const heard: AudioEvent[] = [];
    setAudioSink((e) => heard.push(e));
    invade(queenPos.x + 8, queenPos.y);
    run(0.3);
    expect(nest()).toMatchObject({ nestInvaders: 1, alert: { kind: 'breach', invaders: 1 } });
    const firstId = nest().alert!.id;
    invade(queenPos.x + 9, queenPos.y);
    invade(queenPos.x + 9, queenPos.y + 1);
    run(1);
    expect(nest()).toMatchObject({ nestInvaders: 3, alert: { id: firstId, kind: 'breach', invaders: 3 } });
    expect(heard.filter((e) => e.type === 'nestAlarm')).toHaveLength(1);
    game.stop();
  });

  it('re-alerts when the queen is bitten, no sooner than 10 s after the last alert, with her health', () => {
    const { game, world, run, queen, queenPos, invade, nest } = setup();
    const heard: AudioEvent[] = [];
    setAudioSink((e) => heard.push(e));
    invade(queenPos.x + 0.5, queenPos.y);
    run(0.3);
    expect(nest().alert?.kind).toBe('breach');
    const hp = world.getComponent<HealthComponent>(queen, COMPONENT.HEALTH)!;
    hp.current = hp.max * 0.4;
    // She is bitten from the start, but the breach alert was just raised: no second alarm yet
    run(NEST_REALERT_SECONDS - 1);
    expect(nest().alert?.kind).not.toBe('queen');
    expect(heard.filter((e) => e.type === 'nestAlarm')).toHaveLength(1);
    run(1.5);
    expect(nest().alert).toMatchObject({ kind: 'queen', critical: true, queen: { max: hp.max } });
    expect(heard.filter((e) => e.type === 'nestAlarm')).toHaveLength(2);
    game.stop();
  });

  it('"Ir al nido" switches to the nest and centers the camera on the fight', () => {
    const { game, run, queenPos, invade } = setup();
    const x = queenPos.x + 6;
    const y = queenPos.y + 1;
    invade(x, y);
    run(0.3);
    expect(game.getActiveLayer()).toBe('surface');
    game.goToNestFight();
    expect(game.getActiveLayer()).toBe('underground');
    const view = game.getUndergroundView();
    expect(Math.abs(view.x + view.w / 2 - (x + 0.5))).toBeLessThan(1.5);
    expect(Math.abs(view.y + view.h / 2 - (y + 0.5))).toBeLessThan(1.5);
    game.stop();
  });

  it('says the nest is clear once the last invader is gone, and drops the badge', () => {
    const { game, world, run, queenPos, invade, nest } = setup();
    const id = invade(queenPos.x + 8, queenPos.y);
    run(0.3);
    world.destroyEntity(id);
    run(NEST_CLEAR_GRACE + 0.5);
    expect(nest()).toMatchObject({ nestInvaders: 0, alert: null, cleared: { id: expect.any(Number) } });
    expect(game.getInvaderCount('underground')).toBe(0);
    game.stop();
  });
});
