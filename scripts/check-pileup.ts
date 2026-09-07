// Regression check for the entrance pile-up.
//
// Symptom: hurt ants stood frozen at the nest entrance instead of working.
//
// Root cause: the health/hunger checks sent an ant home whenever it was hurt,
// with no regard for whether the colony had any food to heal with. With an
// empty pantry the ant walked home, found nothing, and bounced between Healing
// and Searching forever. The famine-cycle escape hatch that was supposed to
// break this could not: it signalled "keep foraging" through `stateTimer`, but
// that one field also gates action scoring — negative freezes the ant, positive
// re-triggers the trip home. No value of it can mean both.
//
// Fix: never walk home for food the colony does not have, and carry the
// "forced foraging" flag in its own field (AntComponent.forageGrace).
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../src/simulation/world/VisibilityGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { AntAISystem } from '../src/game/systems/AntAISystem';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { HungerSystem } from '../src/game/systems/HungerSystem';
import { UndergroundHealingSystem } from '../src/game/systems/UndergroundHealingSystem';
import { createNest, createAnt, createFood } from '../src/game/entities/factories';
import {
  COMPONENT, AntRole, Layer, FoodType,
  type NestComponent, type HealthComponent, type PositionComponent, type LayerComponent, type AntComponent,
} from '../src/game/components/components';
import { TerrainType as TT } from '../src/simulation/world/types';
import { WORLD_WIDTH, WORLD_HEIGHT, HEAL_NEST_RANGE } from '../src/shared/constants';

let seed = 0x9e3779b9;
Math.random = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};


const results: Array<[string, boolean, string]> = [];
const check = (n: string, ok: boolean, d: string) => results.push([n, ok, d]);

function run(pantryStock: number) {
const world = new World();
const ug = new UndergroundGrid();
const surface = new TileGrid();
const visibility = new VisibilityGrid();
const modifiers = createDefaultModifiers();
const nx = Math.floor(WORLD_WIDTH / 2), ny = Math.floor(WORLD_HEIGHT / 2);
for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
  const t = surface.getTile(nx + dx, ny + dy);
  if (t && !t.walkable) surface.setTile(nx + dx, ny + dy, { terrain: TT.Dirt, walkable: true });
}
const nestId = createNest(world, nx, ny);
const nest = world.getComponent<NestComponent>(nestId, COMPONENT.NEST)!;
nest.foodStored = 5000; nest.mushroomStored = 0; nest.meatStored = 0;
if (pantryStock > 0) for (const t of ug.getPantryTiles()) ug.depositFood(t.x, t.y, 'leaf', pantryStock);

// Surface food exists — the realistic famine case: pantry empty, food outside.
// This is exactly when hurt ants MUST give up on healing and go forage.
{
  for (let i = 0; i < 6; i++) createFood(world, nx + 5 + (i % 3) * 2, ny - 4 + Math.floor(i / 3) * 8, 120, FoodType.Leaf);
}

// 10 BADLY HURT workers — this is the state that parks ants at the entrance
const antIds: number[] = [];
for (let i = 0; i < 10; i++) {
  const id = createAnt(world, nx + 1 + (i % 3), ny + 1 + Math.floor(i / 3), AntRole.Worker);
  const h = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
  h.current = h.max * 0.3;
  antIds.push(id);
}

const antAI = new AntAISystem(world, surface, visibility, modifiers);
const transit = new TransitSystem(world, ug);
antAI.setUndergroundAccess(ug, transit);
world.addSystem(antAI);
world.addSystem(new MovementSystem(world, surface, modifiers, ug));
world.addSystem(new HungerSystem(world, modifiers));
world.addSystem(new UndergroundHealingSystem(world, ug, transit));
world.addSystem(transit);

const nestPos = world.getComponent<PositionComponent>(nestId, COMPONENT.POSITION)!;
const stateTicks = new Map<string, number>();
const parked = new Map<number, number>(), worst = new Map<number, number>();
for (const id of antIds) { parked.set(id, 0); worst.set(id, 0); }
for (let f = 0; f < 60 * 180; f++) {
  world.update(1 / 60);
  for (const id of antIds) {
    if (!world.hasEntity(id)) continue;
    const st = world.getComponent<AntComponent>(id, COMPONENT.ANT)!.state;
    stateTicks.set(st, (stateTicks.get(st) ?? 0) + 1);
    const l = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
    const p = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const near = l.layer === Layer.Surface && Math.hypot(p.x - nestPos.x, p.y - nestPos.y) < HEAL_NEST_RANGE + 0.5;
    const run = near ? parked.get(id)! + 1 : 0;
    parked.set(id, run);
    if (run > worst.get(id)!) worst.set(id, run);
  }
}
const states = new Map<string, number>();
for (const id of antIds) {
  if (!world.hasEntity(id)) { states.set('MUERTA', (states.get('MUERTA') ?? 0) + 1); continue; }
  const a = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
  const l = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
  states.set(`${a.state}@${l.layer}`, (states.get(`${a.state}@${l.layer}`) ?? 0) + 1);
}
void states;
const total = [...stateTicks.values()].reduce((a, b) => a + b, 0);
return {
  worstParkedSec: Math.max(...worst.values()) / 60,
  healingPct: (100 * (stateTicks.get('healing') ?? 0)) / total,
  workingPct: (100 * ((stateTicks.get('hauling') ?? 0) + (stateTicks.get('going_to_food') ?? 0) + (stateTicks.get('searching') ?? 0))) / total,
};
}

// Empty pantry: nothing to heal with, so ants MUST forage instead of queueing
// at a door that cannot help them.
const famine = run(0);
check('hambruna: nadie acampa', famine.worstParkedSec < 20, `peor estadia ${famine.worstParkedSec.toFixed(1)}s de 180s`);
check('hambruna: salen a trabajar', famine.workingPct > 50, `trabajando ${famine.workingPct.toFixed(0)}% del tiempo`);
check('hambruna: no insisten en curarse', famine.healingPct < 10, `curandose ${famine.healingPct.toFixed(0)}%`);

// Stocked pantry: healing must still happen — the fix must not disable it.
const fed = run(50);
check('con despensa: se curan igual', fed.healingPct > 5, `curandose ${fed.healingPct.toFixed(0)}%`);
check('con despensa: tampoco acampan', fed.worstParkedSec < 20, `peor estadia ${fed.worstParkedSec.toFixed(1)}s`);

let failed = 0;
for (const [n, ok, d] of results) {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${n.padEnd(32)} ${d}`);
  if (!ok) failed++;
}
console.log(failed === 0 ? '\nTodo OK.' : `\n${failed} fallas.`);
process.exit(failed === 0 ? 0 : 1);
