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

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.Dirt]: '#3d2b1f',
  [TerrainType.Stone]: '#555555',
  [TerrainType.Sand]: '#c2a645',
  [TerrainType.Water]: '#1a3a5c',
  [TerrainType.Grass]: '#2d5a1e',
};

// Natural color palettes with variation for terrain rendering
export const TERRAIN_PALETTES: Record<TerrainType, { base: [number, number, number]; variation: number }> = {
  [TerrainType.Dirt]: { base: [130, 95, 50], variation: 8 },
  [TerrainType.Stone]: { base: [105, 100, 95], variation: 6 },
  [TerrainType.Sand]: { base: [220, 190, 110], variation: 6 },
  [TerrainType.Water]: { base: [40, 90, 150], variation: 5 },
  [TerrainType.Grass]: { base: [45, 140, 30], variation: 8 },
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
