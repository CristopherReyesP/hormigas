// Headless repro for the entrance jam: "ants pile up at the nest entrance and
// stop working". Wires EVERY simulation system the way GameManager does (minus
// render/input), spawns a mid-game colony, runs several in-game days, and once
// per second records which ants are parked near an entrance.
//
// An ant is STUCK when it has stayed within 0.5 tiles of the same spot for at
// least STILL_SECONDS while within NEAR tiles of an entrance (surface: the nest
// tile; underground: any shaft tile). Output: per-day stuck counts, peak, and
// a histogram of state@layer and role over every stuck sample.
//
//   npx tsx scripts/repro-entrance-jam.ts [days=5] [seed=1] [workers=30] [soldiers=6] [scouts=2]
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../src/simulation/world/VisibilityGrid';
import { TerrainType } from '../src/simulation/world/types';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { EventSystem } from '../src/game/events/EventSystem';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { PheromoneSystem } from '../src/game/systems/PheromoneSystem';
import { AntAISystem } from '../src/game/systems/AntAISystem';
import { BeetleAISystem } from '../src/game/systems/BeetleAISystem';
import { CricketAISystem } from '../src/game/systems/CricketAISystem';
import { CombatSystem } from '../src/game/systems/CombatSystem';
import { BeetleSpawnSystem } from '../src/game/systems/BeetleSpawnSystem';
import { CricketSpawnSystem } from '../src/game/systems/CricketSpawnSystem';
import { HungerSystem } from '../src/game/systems/HungerSystem';
import { RegenerationSystem } from '../src/game/systems/RegenerationSystem';
import { BreedingSystem } from '../src/game/systems/BreedingSystem';
import { FoodRespawnSystem } from '../src/game/systems/FoodRespawnSystem';
import { FogOfWarSystem } from '../src/game/systems/FogOfWarSystem';
import { EggIncubationSystem } from '../src/game/systems/EggIncubationSystem';
import { NurseAISystem } from '../src/game/systems/NurseAISystem';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { ExcavationSystem } from '../src/game/systems/ExcavationSystem';
import { PorterSystem } from '../src/game/systems/PorterSystem';
import { ObjectiveSystem } from '../src/game/systems/ObjectiveSystem';
import { UndergroundInvasionSystem } from '../src/game/systems/UndergroundInvasionSystem';
import { SpoilageSystem } from '../src/game/systems/SpoilageSystem';
import { FungusFarmSystem } from '../src/game/systems/FungusFarmSystem';
import { UndergroundHealingSystem } from '../src/game/systems/UndergroundHealingSystem';
import { DayNightSystem } from '../src/game/systems/DayNightSystem';
import { DefenderAISystem } from '../src/game/systems/DefenderAISystem';
import { createAnt, createFood, createNest, createBeetleDen, createQueen } from '../src/game/entities/factories';
import {
  COMPONENT, AntRole, FoodType, Layer,
  type AntComponent, type CarryingComponent, type HealthComponent, type HungerComponent, type LayerComponent, type PositionComponent,
} from '../src/game/components/components';
import {
  WORLD_WIDTH, WORLD_HEIGHT, UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT, DAY_DURATION, NIGHT_DURATION,
  INITIAL_FOOD_CLUSTERS, INITIAL_BEETLE_DENS, BEETLE_DEN_MIN_NEST_DISTANCE,
  FOOD_PER_CLUSTER_MIN, FOOD_PER_CLUSTER_MAX, FOOD_AMOUNT_MIN, FOOD_AMOUNT_MAX,
} from '../src/shared/constants';

const [days = 5, seedArg = 1, workers = 30, soldiers = 6, scouts = 2] = process.argv.slice(2).map(Number);
const STILL_SECONDS = 10;
const NEAR = 3;

let seed = (0x9e3779b9 ^ seedArg) | 0;
Math.random = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// Notifications use wall-clock cooldowns; silence them
console.info = () => {};

const world = new World();
const grid = new TileGrid();
const ug = new UndergroundGrid();
const visibility = new VisibilityGrid(WORLD_WIDTH, WORLD_HEIGHT);
const modifiers = createDefaultModifiers();

// ── Systems: same set and wiring as GameManager's constructor ──
const antAI = new AntAISystem(world, grid, visibility, modifiers);
const dayNight = new DayNightSystem(world, modifiers);
world.addSystem(new EventSystem(world, grid, modifiers));
world.addSystem(dayNight);
world.addSystem(antAI);
world.addSystem(new BeetleAISystem(world, grid, modifiers));
world.addSystem(new CricketAISystem(world, grid, ug, modifiers));
world.addSystem(new CombatSystem(world, grid));
world.addSystem(new BeetleSpawnSystem(world, grid, modifiers));
world.addSystem(new CricketSpawnSystem(world, grid, ug, modifiers));
world.addSystem(new MovementSystem(world, grid, modifiers, ug));
world.addSystem(new PheromoneSystem(grid, modifiers));
world.addSystem(new HungerSystem(world, modifiers));
world.addSystem(new RegenerationSystem(world));
world.addSystem(new BreedingSystem(world));
const transit = new TransitSystem(world, ug);
world.addSystem(transit);
antAI.setUndergroundAccess(ug, transit);
world.addSystem(new UndergroundHealingSystem(world, ug, transit));
world.addSystem(new DefenderAISystem(world, ug));
world.addSystem(new EggIncubationSystem(world, transit, ug));
world.addSystem(new NurseAISystem(world, ug));
const excavation = new ExcavationSystem(world, ug, transit);
world.addSystem(excavation);
world.addSystem(new FoodRespawnSystem(world, grid, modifiers));
world.addSystem(new FogOfWarSystem(world, visibility));
const porter = new PorterSystem(world, ug, grid, transit);
porter.setDigJobsProvider(() => excavation.getPendingJobCount());
world.addSystem(porter);
world.addSystem(new ObjectiveSystem(world, ug));
const invasion = new UndergroundInvasionSystem(world, ug, transit, dayNight);
world.addSystem(invasion);
dayNight.setWaveArmedProvider(() => invasion.getInfo().armed);
world.addSystem(new SpoilageSystem(world));
world.addSystem(new FungusFarmSystem(world, ug));

// ── Spawn: GameManager.spawnInitialEntities, with a bigger mid-game colony ──
const nestX = Math.floor(WORLD_WIDTH / 2);
const nestY = Math.floor(WORLD_HEIGHT / 2);
for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
  if (dx * dx + dy * dy > 64) continue;
  const t = grid.getTile(nestX + dx, nestY + dy);
  if (t && !t.walkable) grid.setTile(nestX + dx, nestY + dy, { terrain: TerrainType.Dirt, walkable: true });
}
for (const [dirX, dirY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
  for (let x = nestX, y = nestY; x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT; x += dirX, y += dirY) {
    for (let w = -1; w <= 1; w++) {
      const wx = dirY !== 0 ? x + w : x;
      const wy = dirX !== 0 ? y + w : y;
      const t = grid.getTile(wx, wy);
      if (t && !t.walkable) grid.setTile(wx, wy, { terrain: TerrainType.Dirt, walkable: true });
    }
  }
}
const nestId = createNest(world, nestX, nestY);
const ugCX = Math.floor(UNDERGROUND_WIDTH / 2) + 0.5;
const ugCY = Math.floor(UNDERGROUND_HEIGHT / 2) + 0.5;
createQueen(world, ugCX, ugCY);
for (let i = 0; i < 3; i++) {
  const n = createAnt(world, ugCX + (i - 1) * 1.5, ugCY + 1, AntRole.Nurse);
  world.getComponent<LayerComponent>(n, COMPONENT.LAYER)!.layer = Layer.Underground;
}
const spawn = (count: number, role: AntRole) => {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, d = 1 + Math.random() * 2;
    createAnt(world, nestX + Math.cos(a) * d, nestY + Math.sin(a) * d, role);
  }
};
spawn(workers, AntRole.Worker);
spawn(soldiers, AntRole.Soldier);
spawn(scouts, AntRole.Scout);
for (let i = 0; i < INITIAL_FOOD_CLUSTERS; i++) {
  let cx: number, cy: number;
  do {
    cx = 5 + Math.floor(Math.random() * (WORLD_WIDTH - 10));
    cy = 5 + Math.floor(Math.random() * (WORLD_HEIGHT - 10));
  } while (Math.abs(cx - nestX) < 10 && Math.abs(cy - nestY) < 10);
  const count = FOOD_PER_CLUSTER_MIN + Math.floor(Math.random() * (FOOD_PER_CLUSTER_MAX - FOOD_PER_CLUSTER_MIN));
  for (let j = 0; j < count; j++) {
    const fx = cx + Math.floor(Math.random() * 4 - 2), fy = cy + Math.floor(Math.random() * 4 - 2);
    if (grid.isWalkable(fx, fy)) {
      createFood(world, fx, fy, FOOD_AMOUNT_MIN + Math.floor(Math.random() * (FOOD_AMOUNT_MAX - FOOD_AMOUNT_MIN)), i < 2 ? FoodType.Mushroom : FoodType.Leaf);
    }
  }
}
for (let i = 0; i < INITIAL_BEETLE_DENS; i++) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = Math.floor(Math.random() * grid.width), y = Math.floor(Math.random() * grid.height);
    if (!grid.isWalkable(x, y) || Math.hypot(x - nestX, y - nestY) < BEETLE_DEN_MIN_NEST_DISTANCE) continue;
    createBeetleDen(world, x, y);
    break;
  }
}
visibility.revealArea(nestX, nestY, 10);

// ── Sampling ──
const nestPos = world.getComponent<PositionComponent>(nestId, COMPONENT.POSITION)!;
const anchor = new Map<number, { x: number; y: number; layer: string; since: number }>();
const histogram = new Map<string, number>();
const lastHunger = new Map<number, number>();
let starved = 0, killed = 0;
let stuckSamples = 0, healingStuck = 0, headingToHealStuck = 0, peak = 0, peakAt = 0;
const perDay: number[] = [];
let dayMax = 0;

function nearEntrance(layer: string, x: number, y: number): boolean {
  if (layer === Layer.Surface) return Math.hypot(x - nestPos.x, y - nestPos.y) <= NEAR;
  return ug.getEntrances().some((e) => Math.hypot(x - (e.x + 0.5), y - (e.y + 0.5)) <= NEAR);
}

const DT = 1 / 60;
const totalSeconds = days * (DAY_DURATION + NIGHT_DURATION);
for (let s = 1; s <= totalSeconds; s++) {
  for (let f = 0; f < 60; f++) world.update(DT);
  let stuckNow = 0;
  for (const id of world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.LAYER)) {
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    if (ant.role === AntRole.Nurse || ant.role === AntRole.Defender) continue;
    const p = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer;
    const hunger = world.getComponent<HungerComponent>(id, COMPONENT.HUNGER);
    if (hunger) lastHunger.set(id, hunger.current / hunger.max);
    const a = anchor.get(id);
    if (!a || a.layer !== layer || Math.hypot(p.x - a.x, p.y - a.y) > 0.5) {
      anchor.set(id, { x: p.x, y: p.y, layer, since: s });
      continue;
    }
    if (s - a.since < STILL_SECONDS || !nearEntrance(layer, p.x, p.y)) continue;
    stuckNow++;
    stuckSamples++;
    const carrying = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
    const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
    const key = `${ant.role}:${ant.state}@${layer}${carrying && carrying.amount > 0 ? '+food' : ''}${transit.isInTransit(id) ? '+transit' : ''}`;
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
    if (ant.state === 'healing') healingStuck++;
    else if (ant.state === 'returning_home' && (!carrying || carrying.amount === 0) && health.current < health.max) headingToHealStuck++;
  }
  for (const [id, ratio] of lastHunger) {
    if (world.hasEntity(id)) continue;
    if (ratio < 0.02) starved++; else killed++;
    lastHunger.delete(id);
  }
  if (stuckNow > peak) { peak = stuckNow; peakAt = s; }
  dayMax = Math.max(dayMax, stuckNow);
  if (s % (DAY_DURATION + NIGHT_DURATION) === 0) { perDay.push(dayMax); dayMax = 0; }
}

const colony = world.query(COMPONENT.ANT).filter((id) => {
  const r = world.getComponent<AntComponent>(id, COMPONENT.ANT)!.role;
  return r !== AntRole.Nurse && r !== AntRole.Defender;
}).length;
const pct = (n: number) => (stuckSamples ? ((100 * n) / stuckSamples).toFixed(1) : '0.0');
const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v} (${pct(v)}%)`).join(', ');
console.log(`seed=${seedArg} days=${days} start colony=${workers}w/${soldiers}s/${scouts}sc  alive at end=${colony}  pantry=${Math.round(ug.getPantryStored().total)}`);
console.log(`stuck-near-entrance peak=${peak} at t=${peakAt}s  per-day max=[${perDay.join(', ')}]  ant-seconds stuck=${stuckSamples}`);
console.log(`healing share=${pct(healingStuck)}%  heading-to-heal share=${pct(headingToHealStuck)}%`);
console.log(`states: ${sorted(histogram) || '-'}`);
console.log(`deaths: starved=${starved} killed=${killed}`);
