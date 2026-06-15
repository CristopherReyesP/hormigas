export interface GlobalModifiers {
  pheromoneDecayMultiplier: number;    // 1.0 = normal, >1 = faster decay, <1 = slower
  movementSpeedMultiplier: number;     // 1.0 = normal
  hungerDecayMultiplier: number;       // 1.0 = normal, >1 = hungrier faster
  foodSpawnMultiplier: number;         // 1.0 = normal, >1 = more food spawns
  decisionNoiseMultiplier: number;     // 1.0 = normal, >1 = more random decisions
  enemySpawnMultiplier: number;        // 1.0 = normal, >1 = predators spawn faster (night, events)
}

export function createDefaultModifiers(): GlobalModifiers {
  return {
    pheromoneDecayMultiplier: 1.0,
    movementSpeedMultiplier: 1.0,
    hungerDecayMultiplier: 1.0,
    foodSpawnMultiplier: 1.0,
    decisionNoiseMultiplier: 1.0,
    enemySpawnMultiplier: 1.0,
  };
}
