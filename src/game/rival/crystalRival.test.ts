import { describe, expect, it } from 'vitest';
import {
  CRYSTAL_BUILD_ORDER,
  CRYSTAL_ECONOMY,
  CRYSTAL_MAX_FLOORS,
  CRYSTAL_SPIRE_STATS,
  CRYSTAL_UNIT_STATS,
  nextBuildAction,
  pickExpansionSite,
  raidSize,
  rivalGarrisonCap,
  spireInterval,
  type BuildAction,
  type RivalBuildState,
  type StandingStructure,
} from './crystalRival';
import { DAY_DURATION, NIGHT_DURATION } from '../../shared/constants';

/**
 * Plays the build order the way CrystalRivalSystem does: income every tick
 * (meteor energy plus each extractor), one action whenever it is affordable.
 */
function playBuildOrder(days: number, dt = 0.5): Array<{ day: number; t: number; action: BuildAction }> {
  let state: RivalBuildState = { next: 0, bank: CRYSTAL_ECONOMY.startBank };
  const standing: StandingStructure[] = [];
  const log: Array<{ day: number; t: number; action: BuildAction }> = [];
  const cycle = DAY_DURATION + NIGHT_DURATION;
  for (let t = 0; t < days * cycle; t += dt) {
    const day = Math.floor(t / cycle) + 1;
    const extractors = standing.filter((s) => s.kind === 'extractor').length;
    state = { ...state, bank: state.bank + (CRYSTAL_ECONOMY.passiveIncome + extractors * CRYSTAL_ECONOMY.extractorRate) * dt };
    const step = nextBuildAction(state, day, standing);
    state = step.state;
    if (!step.action) continue;
    log.push({ day, t, action: step.action });
    if (step.action.type === 'build') standing.push({ kind: step.action.kind, floors: 1 });
    else standing.find((s) => s.kind === step.action!.kind && s.floors < CRYSTAL_MAX_FLOORS)!.floors++;
  }
  return log;
}

describe('the Crystal Hive build order', () => {
  it('is deterministic: the same clock gives the same build, at the same moments', () => {
    expect(playBuildOrder(7)).toEqual(playBuildOrder(7));
  });

  it('opens with an extractor on the crater field, then the drone forge', () => {
    const log = playBuildOrder(1);
    expect(log[0].action).toMatchObject({ type: 'build', kind: 'extractor', site: 'crater' });
    expect(log[1].action).toMatchObject({ type: 'build', kind: 'forge' });
  });

  it('scales by night: a step never starts before its night, and the base keeps growing', () => {
    const log = playBuildOrder(7);
    for (const entry of log) expect(entry.day).toBeGreaterThanOrEqual(CRYSTAL_BUILD_ORDER[log.indexOf(entry)].day);
    const byDay = (d: number) => log.filter((e) => e.day <= d).length;
    expect(byDay(1)).toBeLessThan(byDay(3));
    expect(byDay(3)).toBeLessThan(byDay(7));
    expect(log.some((e) => e.action.kind === 'prism')).toBe(true);
    expect(log.some((e) => e.action.type === 'floor')).toBe(true);
    expect(log.some((e) => e.action.site === 'expansion')).toBe(true);
  });

  it('waits when the bank cannot pay, and spends exactly the step cost when it can', () => {
    const step = CRYSTAL_BUILD_ORDER[0];
    const poor = nextBuildAction({ next: 0, bank: step.cost - 1 }, 1, []);
    expect(poor.action).toBeNull();
    expect(poor.state).toEqual({ next: 0, bank: step.cost - 1 });
    const rich = nextBuildAction({ next: 0, bank: step.cost + 10 }, 1, []);
    expect(rich.action).not.toBeNull();
    expect(rich.state).toEqual({ next: 1, bank: 10 });
  });

  it('a floor goes on the first standing spire of its kind; with none standing it raises a new one', () => {
    const floorIndex = CRYSTAL_BUILD_ORDER.findIndex((s) => s.type === 'floor');
    const step = CRYSTAL_BUILD_ORDER[floorIndex];
    const withSpire = nextBuildAction({ next: floorIndex, bank: 999 }, 7, [{ kind: step.kind, floors: 1 }]);
    expect(withSpire.action).toMatchObject({ type: 'floor', kind: step.kind });
    const without = nextBuildAction({ next: floorIndex, bank: 999 }, 7, []);
    expect(without.action).toMatchObject({ type: 'build', kind: step.kind });
  });

  it('stops once the script is done', () => {
    const done = nextBuildAction({ next: CRYSTAL_BUILD_ORDER.length, bank: 9999 }, 9, []);
    expect(done.action).toBeNull();
  });
});

describe('Crystal production and raids', () => {
  it('each floor makes a spire produce faster', () => {
    expect(spireInterval('forge', 2)).toBeLessThan(spireInterval('forge', 1));
    expect(spireInterval('forge', 3)).toBeLessThan(spireInterval('forge', 2));
    expect(spireInterval('extractor', 1)).toBe(Infinity);
  });

  it('the garrison it keeps at home grows by night, up to a cap', () => {
    expect(rivalGarrisonCap(1)).toBeLessThan(rivalGarrisonCap(5));
    expect(rivalGarrisonCap(30)).toBe(rivalGarrisonCap(99));
  });

  it('raids start on day 2, grow by night and always leave one guard at home', () => {
    expect(raidSize(1, 10)).toBe(0);
    expect(raidSize(2, 10)).toBeGreaterThan(0);
    expect(raidSize(7, 10)).toBeGreaterThan(raidSize(2, 10));
    expect(raidSize(7, 1)).toBe(0);
    expect(raidSize(7, 3)).toBe(2);
  });

  it('expands to the nearest free mineral field, never one it already holds', () => {
    const hive = { x: 50, y: 50 };
    const fields = [{ x: 90, y: 50 }, { x: 60, y: 55 }, { x: 10, y: 10 }];
    expect(pickExpansionSite(hive, fields, [])).toEqual({ x: 60, y: 55 });
    expect(pickExpansionSite(hive, fields, [{ x: 60, y: 55 }])).toEqual({ x: 90, y: 50 });
    expect(pickExpansionSite(hive, [], [])).toBeNull();
  });
});

describe('Crystal unit stats', () => {
  it('every unit carries a shield on top of its health', () => {
    for (const stats of Object.values(CRYSTAL_UNIT_STATS)) {
      expect(stats.shield).toBeGreaterThan(0);
      expect(stats.health).toBeGreaterThan(0);
    }
    expect(CRYSTAL_SPIRE_STATS.shield).toBeGreaterThan(0);
  });

  it('the Sentinel shoots from range and is slower than the drone', () => {
    const { drone, sentinel } = CRYSTAL_UNIT_STATS;
    expect(sentinel.attackRange).toBeGreaterThan(drone.attackRange * 2);
    expect(sentinel.speed).toBeLessThan(drone.speed);
  });

  it('the Crystal Queen is the boss: far more health and shield than anything else', () => {
    const { drone, sentinel, queen } = CRYSTAL_UNIT_STATS;
    expect(queen.health).toBeGreaterThanOrEqual(10 * drone.health);
    expect(queen.shield).toBeGreaterThan(sentinel.shield * 5);
  });
});
