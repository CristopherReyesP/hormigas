// Headless test: with policy 'mushroom', a nurse feeding the hungry queen must
// fetch MUSHROOMS even when a leaf pile is closer. Reproduces the user report
// "las nodrizas dan de comer hojas y no siguen la orden".
import { World } from '../src/engine/ecs/World';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { NurseAISystem } from '../src/game/systems/NurseAISystem';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { createAnt, createQueen } from '../src/game/entities/factories';
import {
  COMPONENT, AntRole, Layer,
  type AntComponent, type LayerComponent, type PositionComponent,
  type CarryingComponent, type QueenEntityComponent,
} from '../src/game/components/components';

function runScenario(priority: 'leaf' | 'mushroom'): string[] {
  const world = new World();
  const ug = new UndergroundGrid();
  const surface = new TileGrid();
  const modifiers = createDefaultModifiers();
  ug.setConsumptionPriority(priority);

  // Queen at the center of her chamber
  const cx = Math.floor(ug.width / 2);
  const cy = Math.floor(ug.height / 2);
  const queenId = createQueen(world, cx + 0.5, cy + 0.5);
  const queen = world.getComponent<QueenEntityComponent>(queenId, COMPONENT.QUEEN_ENTITY)!;
  queen.hunger = queen.maxHunger * 0.1; // very hungry → priority 1 feeding

  // Pantry: leaf pile CLOSE to the queen path, mushroom pile FARTHER away
  const pantry = ug.getPantryTiles();
  // sort pantry tiles by distance to queen: nearest gets leaves, farthest gets mushrooms
  pantry.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  ug.depositFood(pantry[0].x, pantry[0].y, 'leaf', 50);
  ug.depositFood(pantry[pantry.length - 1].x, pantry[pantry.length - 1].y, 'mushroom', 50);

  // Nurse next to the queen, underground
  const nurseId = createAnt(world, cx + 2.5, cy + 0.5, AntRole.Nurse);
  world.getComponent<LayerComponent>(nurseId, COMPONENT.LAYER)!.layer = Layer.Underground;

  const nurseAI = new NurseAISystem(world, ug);
  const movement = new MovementSystem(world, surface, modifiers, ug);
  world.addSystem(nurseAI);
  world.addSystem(movement);

  // Run until the nurse has picked something up (or timeout)
  const carriedTypes: string[] = [];
  const carrying = world.getComponent<CarryingComponent>(nurseId, COMPONENT.CARRYING)!;
  for (let f = 0; f < 60 * 60; f++) {
    world.update(1 / 60);
    if (carrying.amount > 0 && carrying.resourceType) {
      if (carriedTypes[carriedTypes.length - 1] !== carrying.resourceType) {
        carriedTypes.push(carrying.resourceType);
      }
    }
  }
  void world.getComponent<AntComponent>(nurseId, COMPONENT.ANT);
  void world.getComponent<PositionComponent>(nurseId, COMPONENT.POSITION);
  return carriedTypes;
}

const leafFirst = runScenario('leaf');
const mushFirst = runScenario('mushroom');
console.log("policy 'leaf'     → nurse carried:", leafFirst.join(', ') || '(nothing)');
console.log("policy 'mushroom' → nurse carried:", mushFirst.join(', ') || '(nothing)');
console.log('---');
console.log('mushroom policy respected:', mushFirst.length > 0 && mushFirst[0] === 'mushroom');
