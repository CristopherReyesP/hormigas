import { describe, expect, it } from 'vitest';
import {
  FarmAnimState,
  FarmStage,
  HARVEST_FX_SECONDS,
  carriedFoodSprite,
  farmGrowthProgress,
  farmGrowthStage,
  farmTileStatusLabel,
  farmTileVariant,
} from './fungusGrowth';

describe('fungus farm growth stages', () => {
  const CAP = 50;

  it('maps an empty tile to spores and mycelium', () => {
    expect(farmGrowthStage(0, CAP)).toBe(FarmStage.Spores);
    expect(farmGrowthStage(2, CAP)).toBe(FarmStage.Spores);
  });

  it('walks through sprouts, growing caps and mature mushrooms as the pile grows', () => {
    expect(farmGrowthStage(10, CAP)).toBe(FarmStage.Sprouts);
    expect(farmGrowthStage(25, CAP)).toBe(FarmStage.Caps);
    expect(farmGrowthStage(40, CAP)).toBe(FarmStage.Mature);
    expect(farmGrowthStage(49.5, CAP)).toBe(FarmStage.Mature);
  });

  it('is ready to harvest only when the tile is full', () => {
    expect(farmGrowthStage(50, CAP)).toBe(FarmStage.Ready);
    expect(farmGrowthStage(60, CAP)).toBe(FarmStage.Ready);
  });

  it('never goes backwards as the amount rises', () => {
    let last: number = FarmStage.Spores;
    for (let a = 0; a <= CAP; a += 0.5) {
      const s = farmGrowthStage(a, CAP);
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });

  it('reports progress as a clamped fraction, and survives a zero capacity', () => {
    expect(farmGrowthProgress(30, CAP)).toBeCloseTo(0.6);
    expect(farmGrowthProgress(80, CAP)).toBe(1);
    expect(farmGrowthProgress(-3, CAP)).toBe(0);
    expect(farmGrowthProgress(5, 0)).toBe(0);
    expect(farmGrowthStage(5, 0)).toBe(FarmStage.Spores);
  });

  it('labels the tile for the info card in Spanish', () => {
    expect(farmTileStatusLabel(30, CAP)).toBe('Granja de hongos · madurando 60%');
    expect(farmTileStatusLabel(50, CAP)).toBe('Granja de hongos · lista para cosechar');
    expect(farmTileStatusLabel(0, CAP)).toBe('Granja de hongos · madurando 0%');
  });
});

describe('per-tile variation', () => {
  it('is deterministic for the same tile', () => {
    expect(farmTileVariant(12, 30)).toEqual(farmTileVariant(12, 30));
  });

  it('stays within one art pixel of offset and a known set of shapes', () => {
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        const v = farmTileVariant(x, y);
        expect(Math.abs(v.dx)).toBeLessThanOrEqual(1);
        expect(Math.abs(v.dy)).toBeLessThanOrEqual(1);
        expect(Number.isInteger(v.dx) && Number.isInteger(v.dy)).toBe(true);
        expect([0, 1, 2]).toContain(v.shape);
        expect(v.phase).toBeGreaterThanOrEqual(0);
        expect(v.phase).toBeLessThan(1);
      }
    }
  });

  it('varies across neighbours so the field does not look tiled', () => {
    const seen = new Set<string>();
    for (let x = 0; x < 6; x++) {
      for (let y = 0; y < 6; y++) {
        const v = farmTileVariant(x, y);
        seen.add(`${v.dx},${v.dy},${v.shape},${v.flip}`);
      }
    }
    expect(seen.size).toBeGreaterThan(8);
  });
});

describe('farm animation state', () => {
  it('pops a tile when it advances a stage, but not on first sight or when harvested down', () => {
    const anim = new FarmAnimState();
    anim.observe(3, 4, FarmStage.Sprouts, 10);
    expect(anim.popAmount(3, 4, 10)).toBe(0);

    anim.observe(3, 4, FarmStage.Caps, 11);
    expect(anim.popAmount(3, 4, 11)).toBeGreaterThan(0.9);
    expect(anim.popAmount(3, 4, 11 + 1)).toBe(0);

    anim.observe(3, 4, FarmStage.Sprouts, 13);
    expect(anim.popAmount(3, 4, 13)).toBe(0);
  });

  it('turns a harvest event into a short pluck animation', () => {
    const anim = new FarmAnimState();
    anim.noteHarvest(5, 6, 20);
    expect(anim.isHarvesting(5, 6, 20.1)).toBe(true);
    const fx = anim.harvests(20 + HARVEST_FX_SECONDS / 2);
    expect(fx).toHaveLength(1);
    expect(fx[0]).toMatchObject({ x: 5, y: 6 });
    expect(fx[0].t).toBeCloseTo(0.5);

    expect(anim.harvests(20 + HARVEST_FX_SECONDS + 0.01)).toHaveLength(0);
    expect(anim.isHarvesting(5, 6, 22)).toBe(false);
  });

  it('does not restart the pluck while ants keep nibbling the same tile', () => {
    const anim = new FarmAnimState();
    anim.noteHarvest(1, 1, 0);
    anim.noteHarvest(1, 1, 0.1);
    anim.noteHarvest(1, 1, 0.2);
    expect(anim.harvests(0.2)).toHaveLength(1);
  });

  it('shows a pale violet mushroom on an ant carrying mushrooms', () => {
    expect(carriedFoodSprite('mushroom')).toBe('mushroom');
    expect(carriedFoodSprite('giant_mushroom')).toBe('mushroom');
    expect(carriedFoodSprite('leaf')).toBe('chunk');
    expect(carriedFoodSprite(null)).toBe(null);
  });
});
