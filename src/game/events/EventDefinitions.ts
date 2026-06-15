import type { GlobalModifiers } from './GlobalModifiers';
import type { World } from '../../engine/ecs/World';
import type { TileGrid } from '../../simulation/world/TileGrid';
import { createFood } from '../entities/factories';
import { FoodType } from '../components/components';

export type EventType = 'rain' | 'drought' | 'disease' | 'enemyRaid' | 'resourceBloom' | 'panicMode' | 'deadBird' | 'leafFall';

export interface EventDefinition {
  type: EventType;
  name: string;
  icon: string;            // shown in HUD while active
  announcement: string;    // notification when the event starts
  severity: 'info' | 'warning' | 'danger' | 'success';
  duration: number;        // seconds
  cooldown: number;        // seconds before this can trigger again
  probability: number;     // chance per check interval (0-1)
  minGameTime: number;     // seconds since game start before eligible
  modifiers: Partial<GlobalModifiers>;  // what it changes
  onStart?: (context: EventContext) => void;
  onEnd?: (context: EventContext) => void;
}

export interface EventContext {
  world: World;
  grid: TileGrid;
  nestX: number;
  nestY: number;
}

export interface ActiveEvent {
  definition: EventDefinition;
  remainingTime: number;
  totalTime: number;
}

export const EVENT_REGISTRY: EventDefinition[] = [
  {
    type: 'rain',
    name: 'Lluvia',
    icon: '🌧️',
    announcement: '🌧️ Empezó a llover — los rastros de feromonas se borran y las hormigas avanzan más lento',
    severity: 'warning',
    duration: 45,
    cooldown: 90,
    probability: 0.15,
    minGameTime: 60,
    modifiers: {
      pheromoneDecayMultiplier: 2.5,
      movementSpeedMultiplier: 0.8,
    },
  },
  {
    type: 'drought',
    name: 'Sequía',
    icon: '☀️',
    announcement: '☀️ Sequía — la comida escasea y el hambre aprieta',
    severity: 'warning',
    duration: 60,
    cooldown: 120,
    probability: 0.1,
    minGameTime: 120,
    modifiers: {
      hungerDecayMultiplier: 1.5,
      foodSpawnMultiplier: 0.3,
      pheromoneDecayMultiplier: 0.5,
    },
  },
  {
    type: 'disease',
    name: 'Enfermedad',
    icon: '🦠',
    announcement: '🦠 Una enfermedad recorre la colonia — hormigas lentas y hambrientas',
    severity: 'danger',
    duration: 30,
    cooldown: 150,
    probability: 0.08,
    minGameTime: 180,
    modifiers: {
      movementSpeedMultiplier: 0.6,
      hungerDecayMultiplier: 2.0,
    },
  },
  {
    type: 'enemyRaid',
    name: 'Incursión enemiga',
    icon: '⚠️',
    announcement: '⚠️ ¡Incursión enemiga! Hay peligro en los bordes del territorio',
    severity: 'danger',
    duration: 40,
    cooldown: 100,
    probability: 0.12,
    minGameTime: 90,
    modifiers: {
      decisionNoiseMultiplier: 1.5,
    },
    onStart: (ctx: EventContext) => {
      const edgePositions: Array<{x: number; y: number}> = [];
      for (let i = 0; i < 3; i++) {
        const side = Math.floor(Math.random() * 4);
        let x: number, y: number;
        switch (side) {
          case 0: x = 0; y = Math.floor(Math.random() * ctx.grid.height); break;
          case 1: x = ctx.grid.width - 1; y = Math.floor(Math.random() * ctx.grid.height); break;
          case 2: x = Math.floor(Math.random() * ctx.grid.width); y = 0; break;
          default: x = Math.floor(Math.random() * ctx.grid.width); y = ctx.grid.height - 1; break;
        }
        edgePositions.push({x, y});
      }
      for (const pos of edgePositions) {
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const tile = ctx.grid.getTile(pos.x + dx, pos.y + dy);
            if (tile) {
              tile.dangerPheromone = Math.min(255, tile.dangerPheromone + 200);
            }
          }
        }
      }
    },
  },
  {
    type: 'resourceBloom',
    name: 'Floración',
    icon: '🌸',
    announcement: '🌸 ¡Floración! El territorio rebosa de comida — momento de cosechar',
    severity: 'success',
    duration: 50,
    cooldown: 80,
    probability: 0.12,
    minGameTime: 60,
    modifiers: {
      foodSpawnMultiplier: 3.0,
      pheromoneDecayMultiplier: 0.7,
    },
  },
  {
    type: 'panicMode',
    name: 'Pánico',
    icon: '😱',
    announcement: '😱 ¡Pánico en la colonia! Las hormigas corren sin rumbo',
    severity: 'danger',
    duration: 20,
    cooldown: 180,
    probability: 0.05,
    minGameTime: 240,
    modifiers: {
      decisionNoiseMultiplier: 3.0,
      movementSpeedMultiplier: 1.3,
      hungerDecayMultiplier: 1.8,
    },
  },
  {
    type: 'leafFall',
    name: 'Caída de hojas',
    icon: '🍂',
    announcement: '🍂 ¡Caída de hojas! Hojas gigantes cubren el territorio — alimento y materia prima para la granja',
    severity: 'success',
    duration: 60, // the leaves stay; the "event" marks the harvest window
    cooldown: 150,
    probability: 0.12,
    minGameTime: 90,
    modifiers: {},
    onStart: (ctx: EventContext) => {
      // Scatter 4-6 giant leaves at 6-20 tiles from the nest, on walkable ground.
      // Closer and more numerous than the dead bird: leaves are bulk, not a prize.
      const drops = 4 + Math.floor(Math.random() * 3);
      let placed = 0;
      for (let attempt = 0; attempt < 60 && placed < drops; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 6 + Math.random() * 14;
        const x = Math.round(ctx.nestX + Math.cos(angle) * dist);
        const y = Math.round(ctx.nestY + Math.sin(angle) * dist);
        if (x < 2 || y < 2 || x >= ctx.grid.width - 2 || y >= ctx.grid.height - 2) continue;
        if (!ctx.grid.isWalkable(x, y)) continue;
        createFood(ctx.world, x, y, 80 + Math.floor(Math.random() * 60), FoodType.Leaf);
        placed++;
      }
    },
  },
  {
    type: 'deadBird',
    name: 'Festín',
    icon: '🐦',
    announcement: '🐦 ¡Un pájaro muerto cayó en el territorio! Festín de carne lejos del nido',
    severity: 'success',
    duration: 90, // the meat stays; the "event" just marks the opportunity window
    cooldown: 240,
    probability: 0.08,
    minGameTime: 150,
    modifiers: {},
    onStart: (ctx: EventContext) => {
      // Drop a big meat carcass 18-30 tiles away from the nest, on walkable ground
      for (let attempt = 0; attempt < 30; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 18 + Math.random() * 12;
        const x = Math.round(ctx.nestX + Math.cos(angle) * dist);
        const y = Math.round(ctx.nestY + Math.sin(angle) * dist);
        if (x < 2 || y < 2 || x >= ctx.grid.width - 2 || y >= ctx.grid.height - 2) continue;
        if (!ctx.grid.isWalkable(x, y)) continue;
        // A carcass is a feast: 3 meat chunks clustered together
        createFood(ctx.world, x, y, 150, FoodType.BeetleMeat);
        createFood(ctx.world, x + 1, y, 100, FoodType.BeetleMeat);
        createFood(ctx.world, x, y + 1, 100, FoodType.BeetleMeat);
        break;
      }
    },
  },
];
