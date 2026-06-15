// Headless test of the new economy rules:
// 1. Foragers carry harvest DOWN to the pantry (no surface stockpile deposits).
// 2. Pantry full → ants HOLD the food in their mouths (never drop it).
// 3. Hungry ants eat from their own mouths (no starvation while loaded).
// 4. Healing ants descend and eat LOOSE underground food (invader meat).
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../src/simulation/world/VisibilityGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { AntAISystem } from '../src/game/systems/AntAISystem';
import { PorterSystem } from '../src/game/systems/PorterSystem';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { UndergroundHealingSystem } from '../src/game/systems/UndergroundHealingSystem';
import { HungerSystem } from '../src/game/systems/HungerSystem';
import { createNest, createAnt, createFood } from '../src/game/entities/factories';
import {
  COMPONENT, AntRole, AntState, Layer, FoodType,
  type NestComponent, type AntComponent, type CarryingComponent,
  type HungerComponent, type LayerComponent, type HealthComponent,
} from '../src/game/components/components';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../src/shared/constants';
import { TerrainType } from '../src/simulation/world/types';

function makeWorld() {
  const world = new World();
  const surface = new TileGrid();
  const ug = new UndergroundGrid();
  const visibility = new VisibilityGrid();
  const modifiers = createDefaultModifiers();
  const nx = Math.floor(WORLD_WIDTH / 2);
  const ny = Math.floor(WORLD_HEIGHT / 2);
  for (let dy = -10; dy <= 10; dy++) {
    for (let dx = -10; dx <= 10; dx++) {
      const t = surface.getTile(nx + dx, ny + dy);
      if (t && !t.walkable) surface.setTile(nx + dx, ny + dy, { terrain: TerrainType.Dirt, walkable: true });
    }
  }
  const nestId = createNest(world, nx, ny);
  const nest = world.getComponent<NestComponent>(nestId, COMPONENT.NEST)!;
  nest.foodStored = 0; nest.mushroomStored = 0; nest.meatStored = 0;

  const antAI = new AntAISystem(world, surface, visibility, modifiers);
  const transit = new TransitSystem(world, ug);
  antAI.setUndergroundAccess(ug, transit);
  world.addSystem(antAI);
  world.addSystem(new PorterSystem(world, ug, surface, transit));
  world.addSystem(new MovementSystem(world, surface, modifiers, ug));
  world.addSystem(new UndergroundHealingSystem(world, ug, transit));
  world.addSystem(new HungerSystem(world, modifiers));
  world.addSystem(transit);
  return { world, surface, ug, nest, nx, ny };
}

// ── Test 1: forage → descend → pantry deposit (surface stockpile stays 0) ──
{
  const { world, ug, nest, nx, ny } = makeWorld();
  createFood(world, nx + 4, ny, 60, FoodType.Leaf);
  const w = createAnt(world, nx + 1, ny, AntRole.Worker);
  void w;
  for (let f = 0; f < 60 * 60; f++) world.update(1 / 60);
  const stored = ug.getPantryStored();
  console.log(`T1 pantry leaf=${stored.leaf.toFixed(0)} (expect >0) | surface stockpile=${nest.foodStored.toFixed(1)} (expect 0)`);
}

// ── Test 2: pantry FULL → ant holds the load in its mouth, never drops it ──
{
  const { world, ug, nx, ny } = makeWorld();
  // Fill pantry completely
  for (;;) {
    const t = ug.findDepositTile('leaf');
    if (!t) break;
    if (ug.depositFood(t.x, t.y, 'leaf', 50) <= 0) break;
  }
  createFood(world, nx + 4, ny, 40, FoodType.Leaf);
  const w = createAnt(world, nx + 1, ny, AntRole.Worker);
  const carrying = world.getComponent<CarryingComponent>(w, COMPONENT.CARRYING)!;
  for (let f = 0; f < 60 * 60; f++) world.update(1 / 60);
  const ant = world.getComponent<AntComponent>(w, COMPONENT.ANT)!;
  const layer = world.getComponent<LayerComponent>(w, COMPONENT.LAYER)!;
  console.log(`T2 pantry full → carrying=${carrying.amount.toFixed(1)} (expect >0, held in mouth) state=${ant.state}@${layer.layer}`);
}

// ── Test 3: starving loaded ant eats from its own mouth ──
{
  const { world, nx, ny } = makeWorld();
  const w = createAnt(world, nx + 1, ny, AntRole.Worker);
  const carrying = world.getComponent<CarryingComponent>(w, COMPONENT.CARRYING)!;
  carrying.amount = 10;
  carrying.resourceType = 'leaf';
  const hunger = world.getComponent<HungerComponent>(w, COMPONENT.HUNGER)!;
  hunger.current = hunger.max * 0.1;
  for (let f = 0; f < 60 * 30; f++) world.update(1 / 60);
  console.log(`T3 mouth-eating: alive=${world.hasEntity(w)} hunger=${(100 * hunger.current / hunger.max).toFixed(0)}% carrying=${carrying.amount.toFixed(1)} (food → belly)`);
}

// ── Test 4: starving hurt ant + ONLY loose meat underground → descends and eats it ──
{
  const { world, nx, ny } = makeWorld();
  // Loose invader meat underground (no pantry piles at all)
  const ug2x = Math.floor(45); // entrance-ish area is walkable
  const meat = createFood(world, ug2x, 5, 80, FoodType.BeetleMeat);
  world.getComponent<LayerComponent>(meat, COMPONENT.LAYER)!.layer = Layer.Underground;

  const w = createAnt(world, nx + 1, ny, AntRole.Worker);
  const hunger = world.getComponent<HungerComponent>(w, COMPONENT.HUNGER)!;
  const health = world.getComponent<HealthComponent>(w, COMPONENT.HEALTH)!;
  hunger.current = hunger.max * 0.3;
  health.current = health.max * 0.5;
  const ant = world.getComponent<AntComponent>(w, COMPONENT.ANT)!;
  ant.state = AntState.Healing; // at nest, needs food+healing

  let wentDown = false;
  for (let f = 0; f < 60 * 90; f++) {
    world.update(1 / 60);
    if (world.getComponent<LayerComponent>(w, COMPONENT.LAYER)!.layer === Layer.Underground) wentDown = true;
  }
  console.log(`T4 loose-food healing: wentDown=${wentDown} alive=${world.hasEntity(w)} hunger=${(100 * hunger.current / hunger.max).toFixed(0)}% hp=${health.current.toFixed(0)}/${health.max}`);
}
