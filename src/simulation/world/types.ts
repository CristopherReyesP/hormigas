import { PAL } from '../../engine/renderer/pixelart/palette';

export const TerrainType = {
  Dirt: 'dirt',
  Stone: 'stone',
  Sand: 'sand',
  Water: 'water',
  Grass: 'grass',
} as const;

export type TerrainType = typeof TerrainType[keyof typeof TerrainType];

export interface Tile {
  terrain: TerrainType;
  walkable: boolean;
  foodPheromone: number;
  homePheromone: number;
  dangerPheromone: number;
}

/**
 * Flat overview colors per terrain (the minimap), taken from the same alien
 * ramps the tile renderer paints with: `base` for most tiles, `fleck` for a
 * sparse lighter speckle.
 */
export const TERRAIN_COLORS: Record<TerrainType, { base: string; fleck: string }> = {
  [TerrainType.Dirt]: { base: PAL.soil[1], fleck: PAL.soil[2] }, // violet regolith
  [TerrainType.Stone]: { base: PAL.stone[1], fleck: PAL.stone[2] }, // alien outcrops
  [TerrainType.Sand]: { base: PAL.dust[0], fleck: PAL.dust[1] }, // pale ash flats
  [TerrainType.Water]: { base: PAL.water[1], fleck: PAL.water[2] }, // ink pools
  [TerrainType.Grass]: { base: PAL.grass[1], fleck: PAL.grass[2] }, // bioluminescent moss
};

export const UndergroundTerrainType = {
  Earth: 'earth',
  Tunnel: 'tunnel',
  Chamber: 'chamber',
  Reinforced: 'reinforced',
} as const;
export type UndergroundTerrainType = typeof UndergroundTerrainType[keyof typeof UndergroundTerrainType];

export const ChamberType = {
  Queen: 'queen',
  Egg: 'egg',
  FoodStorage: 'food_storage',
  General: 'general',
  Incubation: 'incubation',
  FungusFarm: 'fungus_farm',
  Defense: 'defense',
} as const;
export type ChamberType = typeof ChamberType[keyof typeof ChamberType];
