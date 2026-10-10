import { describe, expect, it } from 'vitest';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { UndergroundTerrainType } from '../../simulation/world/types';
import { ENTRANCE_ROW, EXCAVATION_TIME, MAX_DIG_JOBS, UNDERGROUND_HEIGHT, UNDERGROUND_WIDTH } from '../../shared/constants';
import {
  DIG_CAP_PER_UPGRADE_LEVEL,
  DigTileClass,
  buildDigClassMap,
  classifyDigTile,
  digJobCap,
  digLevel,
  digLimitMessage,
  digSecondsPerTile,
  digStatus,
  estimateDigSeconds,
  formatDigCounter,
  formatDigEta,
  isDiggableClass,
  previewDigStroke,
  previewDigTile,
} from './digStatus';

const CX = Math.floor(UNDERGROUND_WIDTH / 2);
const CY = Math.floor(UNDERGROUND_HEIGHT / 2);

describe('dig cap', () => {
  it('is MAX_DIG_JOBS with no upgrade', () => {
    expect(digJobCap()).toBe(MAX_DIG_JOBS);
    expect(digJobCap(0)).toBe(20);
  });

  it("each level of the 'dig' upgrade adds room for more marks", () => {
    expect(DIG_CAP_PER_UPGRADE_LEVEL).toBe(5);
    expect(digJobCap(1)).toBe(25);
    expect(digJobCap(3)).toBe(35);
  });

  it('never drops below the base cap for odd input', () => {
    expect(digJobCap(-2)).toBe(MAX_DIG_JOBS);
  });
});

describe('dig counter numbers', () => {
  it('reads pending over cap', () => {
    const s = digStatus({ pending: 12, cap: 20, diggers: 4, secondsPerTile: 3 });
    expect(formatDigCounter(s)).toBe('Excavación: 12/20');
    expect(s.fraction).toBeCloseTo(0.6);
  });

  it('turns amber near the limit and red at the limit', () => {
    expect(digLevel(0, 20)).toBe('ok');
    expect(digLevel(14, 20)).toBe('ok');
    expect(digLevel(15, 20)).toBe('near');
    expect(digLevel(19, 20)).toBe('near');
    expect(digLevel(20, 20)).toBe('full');
    expect(digLevel(25, 20)).toBe('full');
  });

  it('the fraction is clamped to a full bar', () => {
    expect(digStatus({ pending: 30, cap: 20, diggers: 1, secondsPerTile: 3 }).fraction).toBe(1);
  });
});

describe('dig time estimate', () => {
  it('seconds per tile follow EXCAVATION_TIME, the upgrade and the run modifier', () => {
    expect(digSecondsPerTile(1, 1)).toBe(EXCAVATION_TIME);
    expect(digSecondsPerTile(1.5, 2)).toBeCloseTo(EXCAVATION_TIME / 3);
  });

  it('splits the queue between the ants digging, in whole rounds', () => {
    // 12 tiles, 4 diggers, 3 s each → 3 rounds → 9 s
    expect(estimateDigSeconds(12, 4, 3)).toBe(9);
    // 13 tiles need a fourth round
    expect(estimateDigSeconds(13, 4, 3)).toBe(12);
    // Fractions round up to a whole second
    expect(estimateDigSeconds(5, 1, 3 / 1.3)).toBe(12);
  });

  it('is zero with nothing marked and unknown with no one digging yet', () => {
    expect(estimateDigSeconds(0, 0, 3)).toBe(0);
    expect(estimateDigSeconds(6, 0, 3)).toBeNull();
  });

  it('formats the time and the crew', () => {
    const s = digStatus({ pending: 60, cap: 80, diggers: 4, secondsPerTile: 3 });
    expect(formatDigEta(s)).toBe('≈ 45 s · 4 cavando');
    const long = digStatus({ pending: 40, cap: 80, diggers: 1, secondsPerTile: 3 });
    expect(formatDigEta(long)).toBe('≈ 2 min · 1 cavando');
    const mixed = digStatus({ pending: 30, cap: 80, diggers: 1, secondsPerTile: 3 });
    expect(formatDigEta(mixed)).toBe('≈ 1 min 30 s · 1 cavando');
  });

  it('says so when the queue waits for workers or is empty', () => {
    expect(formatDigEta(digStatus({ pending: 6, cap: 20, diggers: 0, secondsPerTile: 3 }))).toBe('esperando obreras');
    expect(formatDigEta(digStatus({ pending: 0, cap: 20, diggers: 0, secondsPerTile: 3 }))).toBe('sin marcas');
  });
});

describe('refusal at the limit', () => {
  it('names the cap and tells the player what to do', () => {
    expect(digLimitMessage(20)).toBe('Límite de excavación alcanzado (20). Espera a que terminen o cancela marcas.');
    expect(digLimitMessage(25)).toContain('(25)');
  });
});

describe('diggable classification', () => {
  const grid = new UndergroundGrid();
  // Rock pockets are random: pin the plain-earth sample tile
  Object.assign(grid.getTile(5, CY)!, { terrain: UndergroundTerrainType.Earth, walkable: false });
  const at = (x: number, y: number) => classifyDigTile(grid.getTile(x, y)!, x, y, grid.width, grid.height);

  it('plain earth is diggable', () => {
    expect(at(5, CY)).toBe(DigTileClass.Diggable);
    expect(isDiggableClass(DigTileClass.Diggable)).toBe(true);
  });

  it('the map border can never be dug', () => {
    expect(at(0, CY)).toBe(DigTileClass.Border);
    expect(at(UNDERGROUND_WIDTH - 1, 10)).toBe(DigTileClass.Border);
    expect(at(10, 0)).toBe(DigTileClass.Border);
    expect(at(10, UNDERGROUND_HEIGHT - 1)).toBe(DigTileClass.Border);
    expect(isDiggableClass(DigTileClass.Border)).toBe(false);
  });

  it('rock pockets inside the map are rock, not border', () => {
    const tile = grid.getTile(6, 6)!;
    tile.terrain = UndergroundTerrainType.Reinforced;
    expect(at(6, 6)).toBe(DigTileClass.Rock);
    expect(isDiggableClass(DigTileClass.Rock)).toBe(false);
  });

  it('earth on the entrance row is diggable but flagged: it opens an entrance', () => {
    expect(at(5, ENTRANCE_ROW)).toBe(DigTileClass.Entrance);
    expect(isDiggableClass(DigTileClass.Entrance)).toBe(true);
  });

  it('open ground (tunnels, the queen chamber) has nothing to dig', () => {
    expect(at(CX, CY)).toBe(DigTileClass.Open);
    expect(at(CX, 3)).toBe(DigTileClass.Open);
    expect(isDiggableClass(DigTileClass.Open)).toBe(false);
  });

  it('builds a whole-map class map in one pass', () => {
    const map = buildDigClassMap(grid);
    expect(map.length).toBe(UNDERGROUND_WIDTH * UNDERGROUND_HEIGHT);
    expect(map[CY * UNDERGROUND_WIDTH + 0]).toBe(DigTileClass.Border);
    expect(map[CY * UNDERGROUND_WIDTH + CX]).toBe(DigTileClass.Open);
    expect(map[CY * UNDERGROUND_WIDTH + 5]).toBe(DigTileClass.Diggable);
  });
});

describe('dig preview', () => {
  it('a diggable tile under the cap previews ok, at the cap it previews over', () => {
    expect(previewDigTile(DigTileClass.Diggable, false, 19, 20)).toBe('ok');
    expect(previewDigTile(DigTileClass.Diggable, false, 20, 20)).toBe('over');
    expect(previewDigTile(DigTileClass.Entrance, false, 3, 20)).toBe('ok');
  });

  it('rock, border, open ground and already marked tiles are invalid', () => {
    expect(previewDigTile(DigTileClass.Rock, false, 0, 20)).toBe('invalid');
    expect(previewDigTile(DigTileClass.Border, false, 0, 20)).toBe('invalid');
    expect(previewDigTile(DigTileClass.Open, false, 0, 20)).toBe('invalid');
    expect(previewDigTile(DigTileClass.Diggable, true, 0, 20)).toBe('invalid');
  });

  it('a stroke goes red from the first tile beyond the limit', () => {
    const earth = { cls: DigTileClass.Diggable, marked: false };
    const rock = { cls: DigTileClass.Rock, marked: false };
    const stroke = [earth, earth, rock, earth, earth, earth];
    // 17 pending of 20: three more fit, the rock in between takes no slot
    expect(previewDigStroke(stroke, 17, 20)).toEqual(['ok', 'ok', 'invalid', 'ok', 'over', 'over']);
  });
});
