// Headless test of the user-reported bug: hungry larvae + pantry with food but
// NO leaves (mushrooms only) + a moderately hungry queen → nurses must STILL
// feed the larvae. Old code: queen (<60%) outranked larvae and a global
// single-fetcher gate starved the brood line entirely.
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { NurseAISystem } from '../src/game/systems/NurseAISystem';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { createAnt, createQueen, createEgg } from '../src/game/entities/factories';
import {
  COMPONENT, AntRole, Layer,
  type LayerComponent, type QueenEntityComponent, type EggComponent,
} from '../src/game/components/components';

const world = new World();
const ug = new UndergroundGrid();
const surface = new TileGrid();
const modifiers = createDefaultModifiers();

const cx = Math.floor(ug.width / 2);
const cy = Math.floor(ug.height / 2);

// Queen at 50% hunger — proactive-feeding zone, NOT critical
const queenId = createQueen(world, cx + 0.5, cy + 0.5);
const queen = world.getComponent<QueenEntityComponent>(queenId, COMPONENT.QUEEN_ENTITY)!;
queen.hunger = queen.maxHunger * 0.5;

// Pantry: MUSHROOMS ONLY (the user's "hay comida pero no hojas")
const pantry = ug.getPantryTiles();
ug.depositFood(pantry[0].x, pantry[0].y, 'mushroom', 50);
ug.depositFood(pantry[1].x, pantry[1].y, 'mushroom', 50);

// 3 hungry larvae in the incubation chamber (right of the queen chamber)
const incubX = cx + 6;
const eggs: number[] = [];
for (let i = 0; i < 3; i++) eggs.push(createEgg(world, incubX + (i % 2), cy + Math.floor(i / 2), AntRole.Worker, 30));

// 2 nurses
for (let i = 0; i < 2; i++) {
  const n = createAnt(world, cx + 1.5 + i, cy + 1.5, AntRole.Nurse);
  world.getComponent<LayerComponent>(n, COMPONENT.LAYER)!.layer = Layer.Underground;
}

world.addSystem(new NurseAISystem(world, ug));
world.addSystem(new MovementSystem(world, surface, modifiers, ug));

for (let f = 0; f < 60 * 120; f++) world.update(1 / 60);

let fed = 0;
for (const e of eggs) {
  const egg = world.getComponent<EggComponent>(e, COMPONENT.EGG)!;
  if (egg.fedAmount >= egg.requiredFood) fed++;
  console.log(`egg ${e}: fed ${egg.fedAmount.toFixed(1)}/${egg.requiredFood}`);
}
console.log(`larvae fully fed: ${fed}/3 (with mushrooms only + queen at 50%)`);
console.log(`queen hunger: ${(100 * queen.hunger / queen.maxHunger).toFixed(0)}% (should ALSO have been topped up)`);
