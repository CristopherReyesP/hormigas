// Behavioural checks for the ant/predator AI pass.
//
// Each case pins down one contradiction that used to exist:
//   T1 surface ants "saw" underground invaders (layers share coordinates)
//   T2 beetles fought to the death and fed the colony free meat
//   T3 beetles charged the middle of a swarm instead of the lone forager
//   T4 soldiers only reacted to what THEY could see — no colony alarm
//   T5 scouts (0 attack damage) stood still "fighting" until they died
//   T6 foragers harvested piles a beetle was sitting on
//   T7 crickets drained a surface stockpile nothing fills any more
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { VisibilityGrid } from '../src/simulation/world/VisibilityGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { AntAISystem } from '../src/game/systems/AntAISystem';
import { BeetleAISystem } from '../src/game/systems/BeetleAISystem';
import { CricketAISystem } from '../src/game/systems/CricketAISystem';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { createNest, createAnt, createFood, createBeetle, createCricket } from '../src/game/entities/factories';
import {
  COMPONENT, AntRole, AntState, Layer, FoodType, BeetleState, CricketState,
  type NestComponent, type HealthComponent, type PositionComponent, type LayerComponent,
  type AntComponent, type BeetleComponent, type CricketComponent, type CombatComponent, type PathComponent,
  type FoodSourceComponent,
} from '../src/game/components/components';
import { TerrainType as TT } from '../src/simulation/world/types';
import { WORLD_WIDTH, WORLD_HEIGHT, BEETLE_STATS, NEST_THREAT_RADIUS } from '../src/shared/constants';

let seed = 0x9e3779b9;
Math.random = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const results: Array<[string, boolean, string]> = [];
const check = (n: string, ok: boolean, d: string) => results.push([n, ok, d]);

const NX = Math.floor(WORLD_WIDTH / 2);
const NY = Math.floor(WORLD_HEIGHT / 2);

interface Fixture {
  world: World;
  ug: UndergroundGrid;
  nest: NestComponent;
  antAI: AntAISystem;
  beetleAI: BeetleAISystem;
  cricketAI: CricketAISystem;
  step: (seconds: number) => void;
}

function fixture(): Fixture {
  const world = new World();
  const ug = new UndergroundGrid();
  const surface = new TileGrid();
  const visibility = new VisibilityGrid();
  const modifiers = createDefaultModifiers();

  // Clear a generous walkable arena around the nest
  for (let dy = -25; dy <= 25; dy++) {
    for (let dx = -25; dx <= 25; dx++) {
      const t = surface.getTile(NX + dx, NY + dy);
      if (t && !t.walkable) surface.setTile(NX + dx, NY + dy, { terrain: TT.Dirt, walkable: true });
    }
  }

  const nestId = createNest(world, NX, NY);
  const nest = world.getComponent<NestComponent>(nestId, COMPONENT.NEST)!;
  nest.foodStored = 0;
  nest.mushroomStored = 0;
  nest.meatStored = 0;

  const transit = new TransitSystem(world, ug);
  const antAI = new AntAISystem(world, surface, visibility, modifiers);
  antAI.setUndergroundAccess(ug, transit);
  const beetleAI = new BeetleAISystem(world, surface, modifiers);
  const cricketAI = new CricketAISystem(world, surface, ug, modifiers);
  const movement = new MovementSystem(world, surface, modifiers, ug);

  const step = (seconds: number) => {
    const dt = 1 / 60;
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      antAI.update(dt);
      beetleAI.update(dt);
      cricketAI.update(dt);
      transit.update(dt);
      movement.update(dt);
    }
  };

  return { world, ug, nest, antAI, beetleAI, cricketAI, step };
}

const antOf = (w: World, id: number) => w.getComponent<AntComponent>(id, COMPONENT.ANT)!;
const posOf = (w: World, id: number) => w.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;

// ── T1: a surface soldier must be blind to an underground invader ────────────
{
  const f = fixture();
  const soldier = createAnt(f.world, NX + 2, NY, AntRole.Soldier);
  // Invader sits at the soldier's feet — but one layer down
  const invader = createBeetle(f.world, NX + 3, NY, null);
  f.world.getComponent<LayerComponent>(invader, COMPONENT.LAYER)!.layer = Layer.Underground;

  f.step(4);

  const ant = antOf(f.world, soldier);
  const combat = f.world.getComponent<CombatComponent>(soldier, COMPONENT.COMBAT);
  const targeted = combat !== undefined && combat.targetEntityId === invader;
  const chasing = ant.state === AntState.ChasingEnemy || ant.state === AntState.AttackingEnemy;
  check('T1 surface soldier ignores underground invader', !targeted && !chasing,
    `state=${ant.state} target=${combat?.targetEntityId ?? 'none'} (invader=${invader})`);
}

// ── T2: a wounded beetle breaks off and heals instead of dying in place ──────
{
  const f = fixture();
  createAnt(f.world, NX + 4, NY, AntRole.Soldier);
  const beetle = createBeetle(f.world, NX + 6, NY, null);
  const bh = f.world.getComponent<HealthComponent>(beetle, COMPONENT.HEALTH)!;
  bh.current = bh.max * 0.2;

  f.step(1);
  const stateAfterHit = f.world.getComponent<BeetleComponent>(beetle, COMPONENT.BEETLE)!.state;
  const hpBefore = bh.current;
  f.step(5);
  const hpAfter = bh.current;

  check('T2 wounded beetle retreats and regenerates',
    stateAfterHit === BeetleState.Retreating && hpAfter > hpBefore,
    `state=${stateAfterHit} hp ${hpBefore.toFixed(0)} -> ${hpAfter.toFixed(0)}`);
}

// ── T3: a beetle prefers the isolated ant over the escorted cluster ──────────
{
  const f = fixture();
  const beetle = createBeetle(f.world, NX, NY, null);
  // Cluster of five, slightly CLOSER than the loner
  for (let i = 0; i < 5; i++) createAnt(f.world, NX + 3, NY + i * 0.4, AntRole.Worker);
  const loner = createAnt(f.world, NX - 4.5, NY, AntRole.Worker);

  f.step(0.5);

  const b = f.world.getComponent<BeetleComponent>(beetle, COMPONENT.BEETLE)!;
  check('T3 beetle hunts the isolated ant, not the swarm', b.targetEntityId === loner,
    `target=${b.targetEntityId} loner=${loner} state=${b.state}`);
}

// ── T4: a predator at the nest raises a colony alarm beyond personal vision ──
{
  const f = fixture();
  // Soldier vision is 8; park it further than that but still on home turf
  const soldier = createAnt(f.world, NX + 11, NY, AntRole.Soldier);
  const raider = createBeetle(f.world, NX + 1, NY + 1, null);

  f.step(2);

  const ant = antOf(f.world, soldier);
  const combat = f.world.getComponent<CombatComponent>(soldier, COMPONENT.COMBAT);
  const responded =
    ant.state === AntState.ChasingEnemy ||
    ant.state === AntState.AttackingEnemy ||
    (combat !== undefined && combat.targetEntityId === raider);
  check('T4 soldier answers the nest alarm outside its own vision', responded,
    `state=${ant.state} vision=${BEETLE_STATS.visionRange} alarmRadius=${NEST_THREAT_RADIUS}`);
}

// ── T5: scouts deal zero damage, so they must never stand and fight ──────────
{
  const f = fixture();
  const scout = createAnt(f.world, NX + 8, NY + 8, AntRole.Scout);
  createBeetle(f.world, NX + 8.6, NY + 8, null);

  f.step(1);

  const ant = antOf(f.world, scout);
  check('T5 scout flees instead of melee', ant.state !== AntState.AttackingEnemy,
    `state=${ant.state}`);
}

// ── T6: a fed forager refuses the pile a beetle is guarding ──────────────────
{
  const f = fixture();
  const worker = createAnt(f.world, NX, NY + 6, AntRole.Worker);
  const guarded = createFood(f.world, NX + 3, NY + 6, 200, FoodType.Leaf);
  createBeetle(f.world, NX + 3, NY + 5, null); // sitting on the guarded pile
  const safe = createFood(f.world, NX - 6, NY + 6, 200, FoodType.Leaf);

  f.step(0.5);

  const w = antOf(f.world, worker);
  const path = f.world.getComponent<PathComponent>(worker, COMPONENT.PATH)!;
  const dest = path.waypoints.length > 0 ? path.waypoints[path.waypoints.length - 1] : posOf(f.world, worker);
  const gp = posOf(f.world, guarded);
  const sp = posOf(f.world, safe);
  const toGuarded = Math.hypot(gp.x - dest.x, gp.y - dest.y);
  const toSafe = Math.hypot(sp.x - dest.x, sp.y - dest.y);
  // The guarded pile is the CLOSER one — walking toward the far one is the tell
  check('T6 forager avoids the guarded pile', toGuarded > toSafe,
    `state=${w.state} dest=(${dest.x.toFixed(1)},${dest.y.toFixed(1)}) toGuarded=${toGuarded.toFixed(1)} toSafe=${toSafe.toFixed(1)}`);
}

// ── T7: crickets steal the food that actually exists (the pantry) ────────────
{
  const f = fixture();
  for (const t of f.ug.getPantryTiles()) f.ug.depositFood(t.x, t.y, 'leaf', 40);
  const before = f.ug.getPantryStored().total;

  const cricket = createCricket(f.world, NX, NY, null);
  const c = f.world.getComponent<CricketComponent>(cricket, COMPONENT.CRICKET)!;
  c.state = CricketState.StealingFood;

  f.step(3);

  const after = f.ug.getPantryStored().total;
  check('T7 cricket drains the underground pantry', before > 0 && after < before,
    `pantry ${before.toFixed(0)} -> ${after.toFixed(0)}, stolen=${c.stolenFood.toFixed(0)}`);
}

// ── T8: predator-avoidance must not starve the colony ───────────────────────
// The T6 rule ("skip guarded piles") is only sane if foraging still flows with
// predators on the map. Ten workers, six piles, three roaming beetles.
{
  const f = fixture();
  for (let i = 0; i < 10; i++) createAnt(f.world, NX + (i % 5) - 2, NY + Math.floor(i / 5), AntRole.Worker);
  const piles: number[] = [];
  const spots = [[10, 0], [-10, 2], [4, 9], [-6, -8], [12, 6], [0, -11]];
  for (const [dx, dy] of spots) piles.push(createFood(f.world, NX + dx, NY + dy, 150, FoodType.Leaf));
  for (const [dx, dy] of [[9, 1], [-9, 3], [3, 10]]) createBeetle(f.world, NX + dx, NY + dy, null);

  const remaining = () => piles.reduce((sum, id) => {
    const src = f.world.getComponent<FoodSourceComponent>(id, COMPONENT.FOOD_SOURCE);
    return sum + (src ? src.amount : 0);
  }, 0);

  const before = remaining();
  f.step(90);
  const after = remaining();

  check('T8 colony still forages with predators around', after < before * 0.75,
    `food on the map ${before.toFixed(0)} -> ${after.toFixed(0)} (${(100 * (1 - after / before)).toFixed(0)}% harvested)`);
}

let failed = 0;
for (const [name, ok, detail] of results) {
  if (!ok) failed++;
  console.log(`${ok ? '✅' : '❌'} ${name} — ${detail}`);
}
console.log(failed === 0 ? '\nAll AI tactic checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
