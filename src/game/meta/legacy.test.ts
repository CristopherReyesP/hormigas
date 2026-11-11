import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_DNA, LEGACY_KEY, PERKS, bankRun, buyPerk, earnedAchievements, emptyLegacy, loadLegacy, perkCost, runDna,
  sanitizeLegacy, saveLegacy, type LegacyStorage, type RunFeats,
} from './legacy';

function memoryStorage(): LegacyStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const FEATS: RunFeats = { nights: 0, trophies: 0, trophyKinds: 0, tarantulas: 0, captains: 0, redMoons: 0, victory: false, peakAnts: 13 };

describe('the legacy between runs', () => {
  it('a run is worth its nights, relics, captains and victory', () => {
    expect(runDna(FEATS)).toBe(0);
    expect(runDna({ ...FEATS, nights: 4, trophies: 2, captains: 1, victory: true })).toBe(20 + 20 + 5 + 30);
  });

  it('feats earn achievements', () => {
    expect(earnedAchievements(FEATS)).toEqual([]);
    expect(earnedAchievements({ ...FEATS, nights: 10, tarantulas: 1, trophyKinds: 3, captains: 1, redMoons: 1, victory: true, peakAnts: 60 }))
      .toEqual(['firstNight', 'night5', 'night10', 'tarantula', 'collector', 'captain', 'redMoon', 'victory', 'army']);
  });

  it('banking again only adds what the run earned since, and an achievement pays once ever', () => {
    const storage = memoryStorage();
    const first = bankRun({ ...FEATS, nights: 1 }, 0, storage);
    expect(first.unlocked).toEqual(['firstNight']);
    expect(first.gained).toBe(5 + ACHIEVEMENT_DNA);
    const second = bankRun({ ...FEATS, nights: 2 }, 5, storage);
    expect(second.unlocked).toEqual([]);
    expect(second.gained).toBe(5);
    expect(loadLegacy(storage).dna).toBe(20);
    // The same call again banks nothing
    expect(bankRun({ ...FEATS, nights: 2 }, 10, storage).gained).toBe(0);
    // A new run earns its nights again, but not the achievement
    expect(bankRun({ ...FEATS, nights: 1 }, 0, storage).gained).toBe(5);
  });

  it('with no storage, an achievement the run already unlocked is not repeated', () => {
    const first = bankRun({ ...FEATS, nights: 1 }, 0, null);
    expect(first.unlocked).toEqual(['firstNight']);
    const second = bankRun({ ...FEATS, nights: 2 }, 5, null, first.unlocked);
    expect(second.unlocked).toEqual([]);
    expect(second.gained).toBe(5);
  });

  it('ADN buys perk levels up to the max, never on credit', () => {
    const storage = memoryStorage();
    expect(buyPerk('brood', storage)).toBe(false);
    saveLegacy({ ...emptyLegacy(), dna: 65 }, storage);
    expect(buyPerk('brood', storage)).toBe(true); // 20
    expect(buyPerk('brood', storage)).toBe(true); // 40
    expect(buyPerk('brood', storage)).toBe(false); // 70 > 5 left
    const legacy = loadLegacy(storage);
    expect(legacy.dna).toBe(5);
    expect(legacy.perks.brood).toBe(2);
    expect(perkCost({ ...legacy, perks: { ...legacy.perks, brood: PERKS.brood.costs.length } }, 'brood')).toBeNull();
  });

  it('survives a missing, broken or tampered store', () => {
    expect(loadLegacy(null)).toEqual(emptyLegacy());
    const storage = memoryStorage();
    storage.setItem(LEGACY_KEY, '{not json');
    expect(loadLegacy(storage)).toEqual(emptyLegacy());
    expect(sanitizeLegacy({ dna: -5, perks: { brood: 99, nope: 3 }, achievements: ['firstNight', 'firstNight', 'fake', 7] }))
      .toEqual({ ...emptyLegacy(), perks: { ...emptyLegacy().perks, brood: PERKS.brood.costs.length }, achievements: ['firstNight'] });
  });
});
