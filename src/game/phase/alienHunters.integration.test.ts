import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, AntRole, type HealthComponent, type PositionComponent } from '../components/components';
import { createAnt, createBeetle } from '../entities/factories';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';
import { BEETLE_STATS, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { ALIEN_HUNTERS, JELLY_BURST, type AlienHunterSystem } from './AlienHunterSystem';
import { THREAT_SCALED_COMPONENT, threatMultipliers, type ThreatSystem } from './threat';
import { FRONTIER_CREATURE_STATS } from './frontierCreatures';

vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

const TICK = 1 / 60;

function setup() {
  const game = new GameManager(fakeCanvas(), { playerRace: 'swarm', rivalRace: 'wildlife' });
  finishIntro(game);
  const world = game['world'] as World;
  const hunters = game['alienHunters'] as AlienHunterSystem;
  const threat = game['threatSystem'] as ThreatSystem;
  const clock = game['dayNightSystem'] as { getDayNumber(): number };
  const tickFor = (seconds: number) => {
    for (let t = 0; t < seconds; t += TICK) (game as unknown as { update: (dt: number) => void }).update(TICK);
  };
  return { game, world, hunters, threat, clock, tickFor };
}

describe('the alien hunters', () => {
  it('each comes from its own day on, more of them as the threat rises', () => {
    const { game, hunters, threat, clock } = setup();
    expect(hunters.cap('centipede')).toBe(0);
    const day = vi.spyOn(clock, 'getDayNumber').mockReturnValue(ALIEN_HUNTERS.acid_spitter.firstDay);
    expect(hunters.cap('centipede')).toBe(1);
    expect(hunters.cap('spore_jelly')).toBe(2);
    expect(hunters.cap('acid_spitter')).toBe(1);
    threat.level = 24;
    expect(hunters.cap('centipede')).toBe(4);
    day.mockRestore();
    game.stop();
  });

  it('a spore jelly bursts on the first ants it touches, hurting everything around, and is gone', () => {
    const { game, world, hunters, tickFor } = setup();
    const [jelly] = hunters.spawn('spore_jelly');
    const cx = Math.floor(WORLD_WIDTH / 2);
    const cy = Math.floor(WORLD_HEIGHT / 2);
    for (const other of world.query(COMPONENT.ANT)) world.destroyEntity(other);
    const pos = world.getComponent<PositionComponent>(jelly, COMPONENT.POSITION)!;
    pos.x = pos.prevX = cx - 3;
    pos.y = pos.prevY = cy + 3;
    const near = createAnt(world, cx - 2, cy + 3, AntRole.Worker);
    const alsoNear = createAnt(world, cx - 1.5, cy + 4, AntRole.Worker);
    const far = createAnt(world, cx + 6, cy + 3, AntRole.Worker);
    const hp = (id: number) => world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    tickFor(0.2);
    expect(world.hasEntity(jelly)).toBe(false);
    for (const id of [near, alsoNear]) expect(!world.hasEntity(id) || hp(id)!.current < hp(id)!.max).toBe(true);
    expect(hp(far)!.current).toBe(hp(far)!.max);
    expect(JELLY_BURST.radius).toBeGreaterThan(2);
    game.stop();
  });

  it('an acid spitter stops at range and spits instead of closing in', () => {
    const { game, world, hunters, tickFor } = setup();
    const [spitter] = hunters.spawn('acid_spitter');
    const cx = Math.floor(WORLD_WIDTH / 2);
    const cy = Math.floor(WORLD_HEIGHT / 2);
    for (const other of world.query(COMPONENT.ANT)) world.destroyEntity(other);
    const pos = world.getComponent<PositionComponent>(spitter, COMPONENT.POSITION)!;
    pos.x = pos.prevX = cx - 4;
    pos.y = pos.prevY = cy + 3;
    const ant = createAnt(world, cx, cy + 3, AntRole.Worker);
    tickFor(0.1);
    const combat = world.getComponent<{ targetEntityId: number | null }>(spitter, COMPONENT.COMBAT)!;
    expect(combat.targetEntityId).toBe(ant);
    expect(FRONTIER_CREATURE_STATS.acid_spitter.attackRange).toBeGreaterThanOrEqual(4);
    game.stop();
  });
});

describe('enemies born later are stronger', () => {
  it('every enemy is born at the threat of its moment, and keeps it', () => {
    const { game, world, threat, tickFor } = setup();
    tickFor(0.1);
    const early = createBeetle(world, 10, 10, null);
    tickFor(0.1);
    const earlyMax = world.getComponent<HealthComponent>(early, COMPONENT.HEALTH)!.max;
    threat.level = 10;
    const late = createBeetle(world, 12, 12, null);
    tickFor(0.1);
    const lateMax = world.getComponent<HealthComponent>(late, COMPONENT.HEALTH)!.max;
    expect(lateMax).toBe(Math.round(BEETLE_STATS.health * threatMultipliers(10).health));
    expect(lateMax).toBeGreaterThan(earlyMax);
    // The early one keeps its level
    expect(world.getComponent<HealthComponent>(early, COMPONENT.HEALTH)!.max).toBe(earlyMax);
    expect(world.getComponent<{ level: number }>(late, THREAT_SCALED_COMPONENT)?.level).toBe(10);
    // The colony's own ants never scale
    const ant = createAnt(world, 14, 14, AntRole.Worker);
    tickFor(0.1);
    expect(world.getComponent(ant, THREAT_SCALED_COMPONENT)).toBeUndefined();
    game.stop();
  });
});
