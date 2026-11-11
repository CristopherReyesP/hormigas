// Veteran ants, boss trophies and day events, on a real GameManager.
import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, AntRole, type CombatComponent, type HealthComponent, type PositionComponent } from '../components/components';
import { createAnt, createBeetle } from '../entities/factories';
import { fakeCanvas, finishIntro, CRYSTAL_RIVAL_SETUP } from '../../test/gameManagerMocks';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { MAX_RANK, VETERAN, creditKill, rankFor, veteranMultiplier, veteranOf, veteranTitle } from './veterans';
import { retrofitAntStats } from './antStats';
import { TROPHIES, claimTrophy, trophySummary } from './trophies';
import { createFrontierCreature } from '../phase/frontierCreatures';
import { captureSave, restoreSave } from '../save/snapshot';
import { DAY_EVENT, consumeWaveRewardMult, dayEventExtraInvaders, dayEventMeatMult, type DayEventSystem } from './dayEvents';

vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

const TICK = 1 / 60;
const CX = Math.floor(WORLD_WIDTH / 2);
const CY = Math.floor(WORLD_HEIGHT / 2);

function setup() {
  const game = new GameManager(fakeCanvas(), CRYSTAL_RIVAL_SETUP);
  finishIntro(game);
  const world = game['world'] as World;
  const update = (dt: number) => (game as unknown as { update: (dt: number) => void }).update(dt);
  const tickFor = (seconds: number) => {
    for (let t = 0; t < seconds; t += TICK) update(TICK);
  };
  return { game, world, tickFor };
}

describe('veteran ants', () => {
  it('ranks come at 3, 8 and 15 kills', () => {
    expect([0, 2, 3, 7, 8, 14, 15, 99].map(rankFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(veteranMultiplier(MAX_RANK)).toBeCloseTo(1 + VETERAN.perRank * 3);
  });

  it('a promoted ant hits harder and is tougher, earns a name at the top, and keeps it through a retrofit', () => {
    const { game, world } = setup();
    const ant = createAnt(world, CX + 2, CY + 2, AntRole.Soldier);
    const health = world.getComponent<HealthComponent>(ant, COMPONENT.HEALTH)!;
    const base = { max: health.max, damage: health.damage };
    for (let k = 0; k < VETERAN.rankKills[0]; k++) creditKill(world, ant);
    expect(veteranOf(world, ant)?.rank).toBe(1);
    expect(health.max).toBe(Math.round(base.max * veteranMultiplier(1)));
    expect(health.current).toBe(health.max);
    expect(health.damage).toBe(Math.round(base.damage * veteranMultiplier(1)));
    for (let k = VETERAN.rankKills[0]; k < VETERAN.rankKills[2]; k++) creditKill(world, ant);
    const vet = veteranOf(world, ant)!;
    expect(vet.rank).toBe(MAX_RANK);
    expect(vet.name).toBeTruthy();
    expect(veteranTitle(vet)).toContain('Capitana');
    // An upgrade or mutation retrofit must not wipe the rank's bonus
    retrofitAntStats(world);
    expect(health.max).toBe(Math.round(base.max * veteranMultiplier(MAX_RANK)));
    expect(health.damage).toBe(Math.round(base.damage * veteranMultiplier(MAX_RANK)));
    game.stop();
  });

  it('the ant that lands the killing bite is credited in real combat', () => {
    const { game, world, tickFor } = setup();
    for (const other of world.query(COMPONENT.ANT)) world.destroyEntity(other);
    const ant = createAnt(world, CX + 3, CY + 3, AntRole.Soldier);
    const beetle = createBeetle(world, CX + 3.5, CY + 3, null);
    world.getComponent<HealthComponent>(beetle, COMPONENT.HEALTH)!.current = 1;
    const combat = world.getComponent<CombatComponent>(ant, COMPONENT.COMBAT);
    if (combat) combat.targetEntityId = beetle;
    tickFor(4);
    expect(world.hasEntity(beetle)).toBe(false);
    expect(veteranOf(world, ant)?.kills).toBe(1);
    game.stop();
  });
});

describe('boss trophies', () => {
  it('a dead tarantula leaves its fang: the whole colony bites harder, up to the stack cap', () => {
    const { game, world } = setup();
    const run = world.runModifiers;
    const before = run.antDamageMult;
    const kill = () => claimTrophy(world, createFrontierCreature(world, 'tarantula', CX + 5, CY + 5, null));
    expect(kill()).toBe(true);
    expect(run.antDamageMult).toBeCloseTo(before * TROPHIES.fang.factor);
    expect(trophySummary(world)).toEqual([expect.objectContaining({ id: 'fang', count: 1 })]);
    kill();
    kill();
    const minerals = world.minerals.stored;
    // Past the cap the kill pays minerals and the stat stays
    expect(kill()).toBe(false);
    expect(run.getTrophyCount('fang')).toBe(TROPHIES.fang.maxStacks);
    expect(run.antDamageMult).toBeCloseTo(before * TROPHIES.fang.factor ** 3);
    expect(world.minerals.stored).toBeGreaterThan(minerals);
    game.stop();
  });

  it('an ordinary enemy leaves nothing', () => {
    const { game, world } = setup();
    expect(claimTrophy(world, createBeetle(world, CX + 5, CY + 5, null))).toBe(false);
    expect(claimTrophy(world, createFrontierCreature(world, 'spider', CX + 5, CY + 5, null))).toBe(false);
    expect(trophySummary(world)).toEqual([]);
    game.stop();
  });
});

describe('day events', () => {
  it('none comes before day 3; then a dawn offers two days and the player picks one', () => {
    const { game, world, tickFor } = setup();
    const clock = game['dayNightSystem'] as { getDayNumber(): number };
    const events = game['dayEventSystem'] as DayEventSystem;
    events.random = () => 0; // always rolls, always the first of the pool
    const day = vi.spyOn(clock, 'getDayNumber');
    day.mockReturnValue(2);
    tickFor(TICK);
    expect(world.dayEvent.id).toBeNull();
    expect(world.dayEvent.offer).toBeNull();
    day.mockReturnValue(3);
    tickFor(TICK);
    // Two different days on offer, nothing started yet
    const offer = world.dayEvent.offer!;
    expect(offer).toHaveLength(2);
    expect(offer[0]).not.toBe(offer[1]);
    expect(world.dayEvent.id).toBeNull();
    expect(game.getStats().dayEventOffer?.options.map((o) => o.id)).toEqual(offer);
    // One that is not on offer is refused; the second one is taken
    const other = (['calm', 'hunt', 'migration', 'redMoon'] as const).find((id) => !offer.includes(id))!;
    expect(game.chooseDayEvent(other)).toBe(false);
    expect(game.chooseDayEvent(offer[1])).toBe(true);
    expect(world.dayEvent.id).toBe(offer[1]);
    expect(world.dayEvent.offer).toBeNull();
    tickFor(1);
    expect(world.dayEvent.id).toBe(offer[1]);
    // The next dawn never offers yesterday's
    day.mockReturnValue(4);
    tickFor(TICK);
    expect(world.dayEvent.id).toBeNull();
    expect(world.dayEvent.offer).not.toContain(offer[1]);
    game.stop();
  });

  it('an unanswered offer starts its first day when the countdown runs out', () => {
    const { game, world, tickFor } = setup();
    const events = game['dayEventSystem'] as DayEventSystem;
    events.random = () => 0;
    tickFor(TICK); // the first tick settles day 1
    events.offer(null);
    const first = world.dayEvent.offer![0];
    tickFor(DAY_EVENT.chooseSeconds + 0.5);
    expect(world.dayEvent.id).toBe(first);
    expect(world.dayEvent.offer).toBeNull();
    game.stop();
  });

  it('Día de caza doubles the meat, Luna roja swells the wave and pays double once', () => {
    const { game, world } = setup();
    const events = game['dayEventSystem'] as DayEventSystem;
    expect(dayEventMeatMult(world)).toBe(1);
    expect(dayEventExtraInvaders(world, 10)).toBe(0);
    events.start(null, 'hunt');
    expect(dayEventMeatMult(world)).toBe(DAY_EVENT.hunt.meat);
    events.start(null, 'redMoon');
    expect(dayEventMeatMult(world)).toBe(1);
    expect(dayEventExtraInvaders(world, 10)).toBe(4);
    expect(consumeWaveRewardMult(world)).toBe(DAY_EVENT.redMoon.rewardMult);
    expect(consumeWaveRewardMult(world)).toBe(1);
    game.stop();
  });

  it('Migración brings a herd of leapers in from the edge', () => {
    const { game, world } = setup();
    const events = game['dayEventSystem'] as DayEventSystem;
    const before = world.query(COMPONENT.CRICKET).length;
    events.start(null, 'migration');
    const herd = world.query(COMPONENT.CRICKET).length - before;
    expect(herd).toBeGreaterThan(0);
    expect(herd).toBeLessThanOrEqual(DAY_EVENT.migration.herd);
    expect(world.query(COMPONENT.CRICKET, COMPONENT.POSITION).every((id) => world.getComponent<PositionComponent>(id, COMPONENT.POSITION) !== undefined)).toBe(true);
    game.stop();
  });
});

describe('saving', () => {
  it('a save keeps the ranks, the relics and today\'s event', () => {
    const { game, world } = setup();
    const ant = createAnt(world, CX + 2, CY + 2, AntRole.Soldier);
    for (let k = 0; k < VETERAN.rankKills[2]; k++) creditKill(world, ant);
    claimTrophy(world, createFrontierCreature(world, 'tarantula', CX + 5, CY + 5, null));
    (game['dayEventSystem'] as DayEventSystem).start(null, 'redMoon');
    const save = JSON.parse(JSON.stringify(captureSave(game)));
    game.stop();
    const loaded = restoreSave(fakeCanvas(), save);
    const after = loaded['world'] as World;
    expect(veteranOf(after, ant)).toEqual(expect.objectContaining({ rank: MAX_RANK, kills: VETERAN.rankKills[2] }));
    expect(after.runModifiers.getTrophyCount('fang')).toBe(1);
    expect(after.runModifiers.antDamageMult).toBeCloseTo(TROPHIES.fang.factor);
    expect(after.dayEvent).toEqual(expect.objectContaining({ id: 'redMoon', redMoonReward: true }));
    loaded.stop();
  });
});

describe('game feel and quality of life', () => {
  it('bites on one enemy merge into a single damage number; small hits on ants stay quiet', async () => {
    const { advanceFeedback, addDamage, feedbackFor, FEEDBACK, pushImpact, impactShake, impactFlash } = await import('../vfx/feedbackFx');
    const { game, world } = setup();
    const at = { x: 5, y: 5, layer: 'surface' as const };
    addDamage(world, 900, at, 8, false);
    addDamage(world, 900, at, 6, false);
    addDamage(world, 901, at, 5, true); // a colony ant: below the quiet threshold
    advanceFeedback(world, FEEDBACK.damageWindow + 0.01);
    expect(feedbackFor(world).texts.map((t) => t.text)).toEqual(['-14']);
    advanceFeedback(world, FEEDBACK.textLife + 0.1);
    expect(feedbackFor(world).texts).toEqual([]);
    // An impact shakes and flashes, then is gone
    pushImpact(world, 6, '255,0,0', 0.4);
    advanceFeedback(world, 0.05);
    expect(Math.abs(impactShake(world).x) + Math.abs(impactShake(world).y)).toBeGreaterThan(0);
    expect(impactFlash(world)?.alpha).toBeGreaterThan(0);
    advanceFeedback(world, 0.5);
    expect(impactShake(world)).toEqual({ x: 0, y: 0 });
    expect(impactFlash(world)).toBeNull();
    game.stop();
  });

  it('a promotion toast knows where it happened, and focusOn takes the camera there', () => {
    const { game, world } = setup();
    const ant = createAnt(world, CX + 6, CY + 4, AntRole.Soldier);
    for (let k = 0; k < VETERAN.rankKills[2]; k++) creditKill(world, ant);
    const toast = world.notifications.find((n) => n.message.includes('Capitana'));
    expect(toast?.at).toEqual(expect.objectContaining({ x: CX + 6, y: CY + 4 }));
    const camera = game['camera'] as { centerOn(x: number, y: number): void };
    const centerOn = vi.spyOn(camera, 'centerOn');
    game.focusOn(CX + 6, CY + 4);
    expect(centerOn).toHaveBeenCalled();
    game.stop();
  });

  it('a badly hurt veteran pulls out and heads home; with the retreat off it fights on', async () => {
    const { shouldRetreat } = await import('./veterans');
    const { AntState } = await import('../components/components');
    const { game, world, tickFor } = setup();
    const ant = createAnt(world, CX + 8, CY + 6, AntRole.Soldier);
    for (let k = 0; k < VETERAN.rankKills[0]; k++) creditKill(world, ant);
    const health = world.getComponent<HealthComponent>(ant, COMPONENT.HEALTH)!;
    expect(shouldRetreat(world, ant)).toBe(false);
    health.current = health.max * 0.2;
    expect(shouldRetreat(world, ant)).toBe(true);
    game.toggleVeteranRetreat();
    expect(shouldRetreat(world, ant)).toBe(false);
    game.toggleVeteranRetreat();
    tickFor(0.5);
    // The starting pantry has food, so going home can heal it
    expect((game['antAISystem'] as unknown as { undergroundFoodAvailable: boolean }).undergroundFoodAvailable).toBe(true);
    const state = world.getComponent<{ state: string }>(ant, COMPONENT.ANT)!.state;
    expect([AntState.ReturningHome, AntState.Healing]).toContain(state);
    game.stop();
  });
});

describe('the legacy between runs', () => {
  it('a run that ends reports the ADN it banked, its best veteran and its relics', () => {
    const { game, world } = setup();
    const ant = createAnt(world, CX + 2, CY + 2, AntRole.Soldier);
    for (let k = 0; k < VETERAN.rankKills[2]; k++) creditKill(world, ant);
    claimTrophy(world, createFrontierCreature(world, 'tarantula', CX + 5, CY + 5, null));
    const clock = game['dayNightSystem'] as { getDayNumber(): number };
    vi.spyOn(clock, 'getDayNumber').mockReturnValue(4); // three nights survived
    const summary = (game as unknown as { legacySummary(victory: boolean): NonNullable<import('../GameManager').GameOverStats['legacy']> }).legacySummary(false);
    // 3 nights x5 + 1 trophy x10 + 1 captain x5 = 30, plus the achievements they unlock
    const achievements = summary.achievements.map((a) => a.name);
    expect(achievements).toEqual(expect.arrayContaining(['Primer amanecer', 'Matatarántulas', 'Leyenda viva']));
    expect(summary.dnaGained).toBe(30 + achievements.length * 10);
    expect(summary.bestVeteran).toEqual({ title: expect.stringContaining('Capitana'), kills: VETERAN.rankKills[2] });
    expect(summary.trophies).toEqual([{ name: TROPHIES.fang.name, count: 1 }]);
    game.stop();
  });
});
