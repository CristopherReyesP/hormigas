// Headless repro for "cuando le doy excavar tardan mucho en ponerse a excavar":
// workers take a long time to start digging the tiles the player marks with the
// Excavar command. Wires EVERY simulation system the way GameManager does
// (minus render/input/selection), lets a normal colony run for a while, then
// marks dig tiles exactly like GameManager.designateDig (ExcavationSystem.
// designateTile) and measures, per tile:
//
//   wait    = workable → first ant assigned (going_to_dig_site)
//             ("workable" = marked AND touching the colony's tunnels; a tile
//              behind another marked tile only becomes workable once that one
//              is dug)
//   travel  = assigned → ant arrives and starts excavating (dig progress > 0)
//   dig     = excavating → tile open
//   total   = workable → tile open
//
// plus a histogram of what every worker was doing (state@layer) while the
// order was pending, and how often a digger left for the surface between tiles.
//
//   npx tsx scripts/repro-dig-latency.ts [seeds=1,2,3] [workers=30]
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
  COMPONENT, AntRole, AntState, FoodType, Layer,
  type AntComponent, type LayerComponent, type PositionComponent,
} from '../src/game/components/components';
import {
  WORLD_WIDTH, WORLD_HEIGHT, UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT, DAY_DURATION, QUEEN_CHAMBER_SIZE,
  INITIAL_FOOD_CLUSTERS, INITIAL_BEETLE_DENS, BEETLE_DEN_MIN_NEST_DISTANCE,
  FOOD_PER_CLUSTER_MIN, FOOD_PER_CLUSTER_MAX, FOOD_AMOUNT_MIN, FOOD_AMOUNT_MAX,
} from '../src/shared/constants';

const seeds = (process.argv[2] ?? '1,2,3').split(',').map(Number);
const workers = Number(process.argv[3] ?? 30);
const DT = 1 / 60;
const TIMEOUT = 240; // seconds after marking before a tile counts as never dug
// Mark during the day (mid-forage) and right after nightfall
const SCENARIOS: Array<{ name: string; markAt: number }> = [
  { name: 'day', markAt: 90 },
  { name: 'night', markAt: DAY_DURATION + 10 },
];

// Notifications use wall-clock cooldowns; silence them
console.info = () => {};

interface TileTrace {
  x: number;
  y: number;
  workableAt: number | null;
  assignedAt: number | null;
  arrivedAt: number | null;
  doneAt: number | null;
  /** Straight-line distance (tiles) from the assigned ant to the tile when it was assigned */
  assigneeDist: number | null;
}

interface RunResult {
  traces: TileTrace[];
  states: Map<string, number>;
  diggerExits: number;
  sampleSeconds: number;
}

function seedRandom(seedArg: number): void {
  let seed = (0x9e3779b9 ^ seedArg) | 0;
  Math.random = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function run(seedArg: number, markAt: number): RunResult {
  seedRandom(seedArg);
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

  // ── Spawn: GameManager.spawnInitialEntities ──
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
  createNest(world, nestX, nestY);
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
  spawn(6, AntRole.Soldier);
  spawn(2, AntRole.Scout);
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

  // ── Warm up: a normal colony doing its normal thing ──
  let t = 0;
  const step = () => { world.update(DT); t += DT; };
  while (t < markAt) step();

  // ── Mark, like a player dragging the Excavar tool: a 4-tile frontier row
  // under the queen chamber, plus a 4-tile shaft continuing below it ──
  const cx = Math.floor(UNDERGROUND_WIDTH / 2);
  const cy = Math.floor(UNDERGROUND_HEIGHT / 2);
  const rowY = cy + Math.floor(QUEEN_CHAMBER_SIZE / 2) + 1;
  const marks: Array<[number, number]> = [];
  for (let x = cx - 1; x <= cx + 2; x++) marks.push([x, rowY]);
  for (let y = rowY + 1; y <= rowY + 4; y++) marks.push([cx, y]);
  const traces: TileTrace[] = [];
  for (const [x, y] of marks) {
    if (excavation.designateTile(x, y)) traces.push({ x, y, workableAt: null, assignedAt: null, arrivedAt: null, doneAt: null, assigneeDist: null });
  }

  // Read the job registry the way the minimap would if it could: who holds what
  const jobs = excavation['jobs'] as Array<{ x: number; y: number; assignedTo: number | null }>;
  const touchesTunnel = (x: number, y: number) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ug.isWalkable(x + dx, y + dy));

  const states = new Map<string, number>();
  const wasDigger = new Set<number>();
  let diggerExits = 0;
  let sampleSeconds = 0;
  let frame = 0;
  const markedAt = t;
  while (t - markedAt < TIMEOUT && traces.some((tr) => tr.doneAt === null)) {
    step();
    frame++;
    const now = t - markedAt;
    for (const tr of traces) {
      if (tr.doneAt !== null) continue;
      if (ug.isWalkable(tr.x, tr.y)) { tr.doneAt = now; continue; }
      if (tr.workableAt === null && touchesTunnel(tr.x, tr.y)) tr.workableAt = now;
      const job = jobs.find((j) => j.x === tr.x && j.y === tr.y);
      if (!job || job.assignedTo === null) continue;
      if (tr.assignedAt === null) {
        tr.assignedAt = now;
        const p = world.getComponent<PositionComponent>(job.assignedTo, COMPONENT.POSITION)!;
        tr.assigneeDist = Math.hypot(p.x - (tr.x + 0.5), p.y - (tr.y + 0.5));
      }
      const ant = world.getComponent<AntComponent>(job.assignedTo, COMPONENT.ANT);
      if (tr.arrivedAt === null && ant?.state === AntState.Excavating) tr.arrivedAt = now;
    }
    for (const id of world.query(COMPONENT.ANT, COMPONENT.LAYER)) {
      const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role !== AntRole.Worker) continue;
      if (ant.state === AntState.Excavating) wasDigger.add(id);
      // A digger heading up while marked tiles are still pending = a lost hand
      if (wasDigger.has(id) && transit.isInTransit(id) && jobs.length > 0) {
        diggerExits++;
        wasDigger.delete(id);
      }
      if (frame % 60 !== 0) continue;
      const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer;
      const key = `${ant.state}@${layer === Layer.Underground ? 'ug' : 'surf'}${transit.isInTransit(id) ? '+transit' : ''}`;
      states.set(key, (states.get(key) ?? 0) + 1);
    }
    if (frame % 60 === 0) sampleSeconds++;
  }
  return { traces, states, diggerExits, sampleSeconds };
}

const fmt = (v: number | null) => (v === null ? '  -  ' : v.toFixed(1).padStart(5));
const median = (xs: number[]) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const span = (a: number | null, b: number | null) => (a !== null && b !== null ? b - a : null);

const summary: Record<string, { wait: number[]; travel: number[]; total: number[]; undug: number }> = {};
for (const scenario of SCENARIOS) {
  for (const seedArg of seeds) {
    const { traces, states, diggerExits, sampleSeconds } = run(seedArg, scenario.markAt);
    const s = (summary[scenario.name] ??= { wait: [], travel: [], total: [], undug: 0 });
    console.log(`\n=== ${scenario.name} seed=${seedArg} workers=${workers} (marked at t=${scenario.markAt}s) ===`);
    console.log(' tile     workable  wait  travel   dig  total  assignee-dist');
    for (const tr of traces) {
      const wait = span(tr.workableAt, tr.assignedAt);
      const travel = span(tr.assignedAt, tr.arrivedAt);
      const dig = span(tr.arrivedAt, tr.doneAt);
      const total = span(tr.workableAt, tr.doneAt);
      if (wait !== null) s.wait.push(wait);
      if (travel !== null) s.travel.push(travel);
      if (total !== null) s.total.push(total); else s.undug++;
      console.log(` (${tr.x},${tr.y})`.padEnd(10) + `${fmt(tr.workableAt)}   ${fmt(wait)} ${fmt(travel)} ${fmt(dig)} ${fmt(total)}  ${fmt(tr.assigneeDist)}`);
    }
    const hist = [...states.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([k, v]) => `${k}=${(v / Math.max(1, sampleSeconds)).toFixed(1)}`).join(', ');
    console.log(` avg workers per state while pending (${sampleSeconds}s): ${hist}`);
    console.log(` digger exits to the surface with tiles still pending: ${diggerExits}`);
  }
}

console.log('\n=== summary (seconds; median / max) ===');
for (const [name, s] of Object.entries(summary)) {
  const mm = (xs: number[]) => `${median(xs).toFixed(1)} / ${(xs.length ? Math.max(...xs) : NaN).toFixed(1)}`;
  console.log(`${name.padEnd(6)} wait ${mm(s.wait)}   travel ${mm(s.travel)}   total ${mm(s.total)}   undug=${s.undug}`);
}
