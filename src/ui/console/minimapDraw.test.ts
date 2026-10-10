import { describe, expect, it } from 'vitest';
import { PAL } from '../../engine/renderer/pixelart/palette';
import { TERRAIN_COLORS, TerrainType } from '../../simulation/world/types';
import { surfaceTileColor } from './minimapDraw';

/** The ramp the tile renderer paints each terrain with (TerrainRenderer). */
const TILE_RAMPS: Record<TerrainType, readonly string[]> = {
  [TerrainType.Dirt]: PAL.soil,
  [TerrainType.Grass]: PAL.grass,
  [TerrainType.Sand]: PAL.dust,
  [TerrainType.Stone]: PAL.stone,
  [TerrainType.Water]: PAL.water,
};
const TERRAINS = Object.values(TerrainType);

describe('surface minimap colors', () => {
  it('come from the same alien ramps the world tiles are painted with', () => {
    for (const terrain of TERRAINS) {
      expect(TILE_RAMPS[terrain], terrain).toContain(TERRAIN_COLORS[terrain].base);
      expect(TILE_RAMPS[terrain], terrain).toContain(TERRAIN_COLORS[terrain].fleck);
    }
  });

  it('paints sand tiles as pale ash flats, not straw', () => {
    for (let x = 0; x < 10; x++) expect(PAL.dust).toContain(surfaceTileColor(TerrainType.Sand, x, 0));
  });

  it('flecks the minimap with the lighter shade on a sparse pattern', () => {
    for (const terrain of TERRAINS) {
      const colors = new Set<string>();
      for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) colors.add(surfaceTileColor(terrain, x, y));
      expect([...colors].sort()).toEqual([TERRAIN_COLORS[terrain].base, TERRAIN_COLORS[terrain].fleck].sort());
    }
  });
});
