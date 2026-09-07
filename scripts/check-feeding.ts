// Headless check for the entrance pile-up.
//
// Symptom: ants parked at the nest entrance instead of working. Cause: the old
// `feedAtNest` auto-feed topped up hunger for ANY ant within HEAL_NEST_RANGE of
// the nest, every tick, regardless of state — while health could only recover
// underground. An ant parked in Healing at the entrance therefore had zero
// pressure to move on.
//
// Contract now: no food on the surface for ants. Hunger and HP are restored
// only by eating from a pantry pile, which deducts from storage.
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
import { createNest, createAnt } from '../src/game/entities/factories';
import {
  COMPONENT, AntRole, Layer,
  type NestComponent, type HungerComponent, type PositionComponent, type LayerComponent,
} from '../src/game/components/components';
import { TerrainType as TT } from '../src/simulation/world/types';
import { WORLD_WIDTH, WORLD_HEIGHT, HEAL_NEST_RANGE } from '../src/shared/constants';

// The ant AI calls Math.random for exploration, so an unseeded run makes this
// a dice roll. Seed it: a regression check must fail for a reason, not by luck.
let seed = 0x9e3779b9;
Math.random = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const results: Array<[string, boolean, string]> = [];
const check = (n: string, ok: boolean, d: string) => results.push([n, ok, d]);

const world = new World();
const ug = new UndergroundGrid();
const surface = new TileGrid();
const visibility = new VisibilityGrid();
const modifiers = createDefaultModifiers();

const nx = Math.floor(WORLD_WIDTH / 2);
const ny = Math.floor(WORLD_HEIGHT / 2);
for (let dy = -10; dy <= 10; dy++) {
  for (let dx = -10; dx <= 10; dx++) {
    const t = surface.getTile(nx + dx, ny + dy);
    if (t && !t.walkable) surface.setTile(nx + dx, ny + dy, { terrain: TT.Dirt, walkable: true });
  }
}

// Surface stockpile is FULL — under the old behaviour this alone fed everyone
// at the entrance forever. It must now be irrelevant to a hungry ant.
const nestId = createNest(world, nx, ny);
const nest = world.getComponent<NestComponent>(nestId, COMPONENT.NEST)!;
nest.foodStored = 5000; nest.mushroomStored = 0; nest.meatStored = 0;

// Stock the pantry — this is the ONLY food ants may now eat
for (const t of ug.getPantryTiles()) ug.depositFood(t.x, t.y, 'leaf', 50);
const pantryStart = ug.getPantryStored().total;

// 10 starving workers next to the nest
const antIds: number[] = [];
for (let i = 0; i < 10; i++) {
  const id = createAnt(world, nx + 1 + (i % 3), ny + 1 + Math.floor(i / 3), AntRole.Worker);
  const h = world.getComponent<HungerComponent>(id, COMPONENT.HUNGER)!;
  h.current = h.max * 0.15; // well under HUNGER_EAT_THRESHOLD
  antIds.push(id);
}
const hungerStart = antIds.reduce((s, id) => s + world.getComponent<HungerComponent>(id, COMPONENT.HUNGER)!.current, 0);

const antAI = new AntAISystem(world, surface, visibility, modifiers);
const transit = new TransitSystem(world, ug);
antAI.setUndergroundAccess(ug, transit);
world.addSystem(antAI);
world.addSystem(new MovementSystem(world, surface, modifiers, ug));
world.addSystem(new HungerSystem(world, modifiers));
world.addSystem(new UndergroundHealingSystem(world, ug, transit));
world.addSystem(transit);

const nestPos = world.getComponent<PositionComponent>(nestId, COMPONENT.POSITION)!;
const parkedTicks = new Map<number, number>();
const maxParked = new Map<number, number>();
for (const id of antIds) { parkedTicks.set(id, 0); maxParked.set(id, 0); }

for (let f = 0; f < 60 * 120; f++) {
  world.update(1 / 60);
  for (const id of antIds) {
    const l = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
    const p = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const near = l.layer === Layer.Surface && Math.hypot(p.x - nestPos.x, p.y - nestPos.y) < HEAL_NEST_RANGE + 0.5;
    const run = near ? parkedTicks.get(id)! + 1 : 0;
    parkedTicks.set(id, run);
    if (run > maxParked.get(id)!) maxParked.set(id, run);
  }
}
const worstParkedSec = Math.max(...maxParked.values()) / 60;

const hungerEnd = antIds.reduce((s, id) => s + world.getComponent<HungerComponent>(id, COMPONENT.HUNGER)!.current, 0);
const pantryEnd = ug.getPantryStored().total;

check('el hambre se recupero', hungerEnd > hungerStart * 1.5, `${hungerStart.toFixed(0)} -> ${hungerEnd.toFixed(0)}`);
check('salio del almacen (no del nido)', pantryEnd < pantryStart, `despensa ${pantryStart.toFixed(0)} -> ${pantryEnd.toFixed(0)}`);
check('el stock de superficie NO se toco', nest.foodStored === 5000, `foodStored=${nest.foodStored}`);
// Under the bug an ant sat at the entrance essentially forever (the auto-feed
// removed all hunger pressure). Passing through takes seconds.
check('nadie acampa en la entrada', worstParkedSec < 20, `peor estadia continua: ${worstParkedSec.toFixed(1)}s de 120s`);

let failed = 0;
for (const [n, ok, d] of results) {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${n.padEnd(32)} ${d}`);
  if (!ok) failed++;
}
console.log(failed === 0 ? '\nTodo OK.' : `\n${failed} fallas.`);
process.exit(failed === 0 ? 0 : 1);
