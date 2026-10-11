// Headless balance runs: the real GameManager (with the browser adapters
// mocked by the calling test) driven by a scripted player, night after night,
// until the run's core falls or the night cap is reached. Each run records
// the night of death and its cause, the colony over time, the stock and the
// waves it faced. The balance tests and the balance report use it.
//
// A test that imports this must mock InputManager and RenderSystem first
// (see src/test/gameManagerMocks.ts) and stub `window`.

import { GameManager, type GameOverStats } from '../game/GameManager';
import type { World } from '../engine/ecs/World';
import type { EntityId } from '../shared/types';
import {
  AntRole,
  COMPONENT,
  Layer,
  type AntComponent,
  type CrystalSpireComponent,
  type HealthComponent,
  type LayerComponent,
  type LayerValue,
  type NestComponent,
  type PositionComponent,
  type QueenEntityComponent,
} from '../game/components/components';
import { FactionId, isHostileTo, ownerOf } from '../game/factions/factions';
import { fakeCanvas, finishIntro } from '../test/gameManagerMocks';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../shared/constants';
import type { RaceId, RivalId } from '../game/run/RunSetup';
import { deathCauseText, type DeathCause } from '../game/run/deathCause';
import { ChamberType } from '../simulation/world/types';
import type { UndergroundGrid } from '../simulation/world/UndergroundGrid';
import type { SelectionSystem } from '../game/systems/SelectionSystem';
import type { DefenseKind } from '../game/run/defenses';
import { STRUCTURE_COMPONENT, type StructureComponent } from '../game/run/defenses';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent } from '../game/rival/humanComponents';
import type { HumanBuildingKind } from '../game/rival/humanBase';
import { CRYSTAL_FLOOR, CRYSTAL_STRUCTURES, type CrystalBuildKind } from '../game/races/crystal/crystalPlayerRules';
import { CRYSTAL_MAX_FLOORS } from '../game/rival/crystalRival';
import { WAVE_MARCH_COMPONENT } from '../game/run/waveMarch';

export type BotKind = 'idle' | 'reasonable';

export interface SimConfig {
  player: RaceId;
  rival: RivalId;
  bot: BotKind;
  seed: number;
  /** Stop once this many nights were survived */
  maxNights: number;
  /** Simulation step, seconds (default 1/30) */
  dt?: number;
  /** Called with each night's record at the dawn after it (progress output) */
  onNight?: (record: NightRecord) => void;
  /** Called after every step (diagnostics, such as the AI audit) */
  onTick?: (game: GameManager, world: World, time: number) => void;
}

/** One line per night, taken at nightfall (the wave's numbers at the next dawn) */
export interface NightRecord {
  night: number;
  /** Ants (Swarm) or own units (Humans, Crystal) at nightfall */
  colony: number;
  /** Fighters among them (soldiers and defenders; Human troops; Crystal units) */
  fighters: number;
  /** Food in the pantry (Swarm) or rations (Humans) */
  food: number;
  minerals: number;
  /** Built defenses (Swarm), bunkers (Humans) or spires (Crystal) */
  defenses: number;
  /** Enemies the night's wave sent */
  waveSize: number;
  /** The core's health share at nightfall and at the next dawn */
  coreHealth: number;
  coreHealthAtDawn: number | null;
  /** Colony units alive at the next dawn */
  colonyAtDawn: number | null;
  /** The queen's hunger share at nightfall (Swarm) */
  queenHunger: number | null;
  /** Race details: supply and buildings (Humans, Crystal), castes (Swarm) */
  note: string;
}

export interface SimResult {
  config: SimConfig;
  /** Nights survived when the core fell; null if it was still standing at the cap */
  deathNight: number | null;
  /** The day the core fell on, and in which phase */
  diedOn: { day: number; phase: 'day' | 'night' } | null;
  cause: DeathCause | null;
  causeLine: string | null;
  nights: NightRecord[];
  /** Times the queen's hunger hit 0 while the pantry held food (the nurses failed to feed her) */
  starvedWithFood: number;
  wallMs: number;
}

/** A seeded Math.random (mulberry32) while `body` runs */
function withSeed<T>(seed: number, body: () => T): T {
  const original = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return body();
  } finally {
    Math.random = original;
  }
}

interface Ctx {
  game: GameManager;
  world: World;
  selection: SelectionSystem;
  night: number;
  time: number;
}

type Bot = (ctx: Ctx) => void;

const pos = (world: World, id: EntityId) => world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
const layerOf = (world: World, id: EntityId) => world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function nearestTo<T extends { x: number; y: number }>(items: T[], at: { x: number; y: number }): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const item of items) {
    const d = dist(item, at);
    if (d < bestD) {
      best = item;
      bestD = d;
    }
  }
  return best;
}

/** Hostile units with combat on a layer (wave units, raiders, wildlife) */
function hostiles(world: World, layer: LayerValue): Array<{ id: EntityId; x: number; y: number }> {
  const out: Array<{ id: EntityId; x: number; y: number }> = [];
  for (const id of world.query(COMPONENT.COMBAT, COMPONENT.POSITION, COMPONENT.HEALTH)) {
    if (layerOf(world, id) !== layer || !isHostileTo(world, FactionId.PLAYER, id)) continue;
    if (world.getComponent(id, STRUCTURE_COMPONENT) || world.getComponent(id, HUMAN_COMPONENT.BUILDING)) continue;
    const p = pos(world, id);
    out.push({ id, x: p.x, y: p.y });
  }
  return out;
}

// ── The Swarm ─────────────────────────────────────────────────

function antsBy(world: World): Map<AntRole, EntityId[]> {
  const by = new Map<AntRole, EntityId[]>();
  for (const id of world.query(COMPONENT.ANT)) {
    const role = world.getComponent<AntComponent>(id, COMPONENT.ANT)!.role;
    if (!by.has(role)) by.set(role, []);
    by.get(role)!.push(id);
  }
  return by;
}

/** Walkable General tiles next to tiles of `type`, closest to `near` first */
function growChamber(grid: UndergroundGrid, type: ChamberType, near: { x: number; y: number }): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const seen = new Set<number>();
  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.getTile(x, y)?.chamberType !== type) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const t = grid.getTile(nx, ny);
        if (!t || !t.walkable || ny <= 1 || seen.has(ny * grid.width + nx)) continue;
        if (t.chamberType !== null && t.chamberType !== ChamberType.General) continue;
        seen.add(ny * grid.width + nx);
        out.push({ x: nx, y: ny });
      }
    }
  }
  return out.sort((a, b) => dist(a, near) - dist(b, near));
}

function countChamber(grid: UndergroundGrid, type: ChamberType): number {
  let n = 0;
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) if (grid.getTile(x, y)?.chamberType === type) n++;
  return n;
}

const SWARM_BREED_RESERVE = 40;
/** The scripted Swarm player stops breeding here (it also keeps the headless runs quick) */
const SWARM_BOT_MAX_ANTS = 120;
const NEST_CENTER = { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) };

const swarmBot: Bot = ({ game, world, selection, night }) => {
  const grid = game['undergroundGrid'] as UndergroundGrid;
  const by = antsBy(world);
  const n = (role: AntRole) => by.get(role)?.length ?? 0;
  const total = world.query(COMPONENT.ANT).length;
  const queenId = world.query(COMPONENT.QUEEN_ENTITY)[0];
  const queenAt = queenId !== undefined ? pos(world, queenId) : { x: grid.width / 2, y: grid.height / 2 };

  // Breed: enough nurses, then a mix of fighters and workers
  const pantry = grid.getPantryStored().total;
  // A sensible colony, not an endless one: the bot stops breeding at SWARM_BOT_MAX_ANTS
  for (let i = 0; i < 2 && total < SWARM_BOT_MAX_ANTS; i++) {
    const nurses = n(AntRole.Nurse);
    const fighters = n(AntRole.Soldier) + n(AntRole.Defender);
    let role: AntRole;
    if (nurses < 3 + Math.floor(total / 12)) role = AntRole.Nurse;
    else if (fighters < n(AntRole.Worker) * 0.8) role = n(AntRole.Defender) < n(AntRole.Soldier) / 2 ? AntRole.Defender : AntRole.Soldier;
    else role = AntRole.Worker;
    if (pantry - game.getBreedCost(role) < SWARM_BREED_RESERVE) break;
    if (!game.queueBreed(role)) break;
  }

  // Storage: grow the pantry before it fills
  const cap = grid.getPantryCapacity();
  if (cap > 0 && pantry > cap * 0.75) {
    for (const t of growChamber(grid, ChamberType.FoodStorage, queenAt).slice(0, 3)) game.designateStorage(t.x, t.y);
  }
  // Incubation: room for the brood
  if (countChamber(grid, ChamberType.Incubation) < 9 + Math.floor(total / 6)) {
    for (const t of growChamber(grid, ChamberType.Incubation, queenAt).slice(0, 2)) game.designateIncubation(t.x, t.y);
  }

  // Defenses at the scouted breach: spines and a trap, a few defense tiles for the defenders
  const intel = game['waves']().getInfo().next;
  const breach = intel?.entrance ?? grid.getEntrances()[0] ?? null;
  if (breach) {
    const defense = game['defenseSystem'] as { check(kind: DefenseKind, layer: 'underground', x: number, y: number): { ok: boolean } };
    const built = world.query(STRUCTURE_COMPONENT).map((id) => world.getComponent<StructureComponent>(id, STRUCTURE_COMPONENT)!);
    const near = (kind: DefenseKind) => built.filter((s) => s.kind === kind && s.layer === 'underground' && dist(s, breach) <= 7).length;
    const want: DefenseKind | null = near('spine') < Math.min(6, 2 + Math.floor(night / 2))
      ? 'spine'
      : near('trap') < Math.min(3, 1 + Math.floor(night / 4)) ? 'trap' : null;
    if (want) {
      const candidates: Array<{ x: number; y: number }> = [];
      for (let dy = 0; dy <= 6; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const x = breach.x + dx;
          const y = breach.y + dy;
          if (Math.hypot(dx, dy) < 1.5 || Math.hypot(dx, dy) > 6) continue;
          candidates.push({ x, y });
        }
      }
      candidates.sort((a, b) => dist(a, breach) - dist(b, breach));
      const spot = candidates.find((c) => defense.check(want, 'underground', c.x, c.y).ok);
      if (spot) game.placeDefense(want, 'underground', spot.x, spot.y);
    }
    if (countChamber(grid, ChamberType.Defense) < 4) {
      for (let dy = 1; dy <= 4 && countChamber(grid, ChamberType.Defense) < 4; dy++) {
        const t = grid.getTile(breach.x, breach.y + dy);
        if (t?.walkable && (t.chamberType === null || t.chamberType === ChamberType.General)) game.designateDefense(breach.x, breach.y + dy);
      }
    }
  }

  // Attack orders: soldiers on the threats of their layer
  for (const layer of [Layer.Surface, Layer.Underground] as const) {
    const foes = hostiles(world, layer).filter((f) =>
      layer === Layer.Underground ? dist(f, queenAt) < 30 : world.getComponent(f.id, WAVE_MARCH_COMPONENT) !== undefined || dist(f, NEST_CENTER) < 14);
    if (foes.length === 0) continue;
    const roles = layer === Layer.Underground ? [AntRole.Soldier, AntRole.Defender] : [AntRole.Soldier];
    const fighters = roles.flatMap((r) => by.get(r) ?? []).filter((id) => layerOf(world, id) === layer);
    if (fighters.length === 0) continue;
    const anchor = layer === Layer.Underground ? queenAt : pos(world, fighters[0]);
    const target = nearestTo(foes, anchor)!;
    selection.selectAnts(fighters, layer);
    game.orderSelectedAttack(target.id);
    game.clearSelection();
  }
};

// ── The Humans ────────────────────────────────────────────────

const humanUnits = (world: World, type?: string) => world.query(HUMAN_COMPONENT.UNIT).filter((id) => ownerOf(world, id) === FactionId.PLAYER
  && (type === undefined || world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type === type));
const humanBuildings = (world: World, kind?: HumanBuildingKind) => world.query(HUMAN_COMPONENT.BUILDING).filter((id) => ownerOf(world, id) === FactionId.PLAYER
  && (kind === undefined || world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind === kind));

function humanPlace(ctx: Ctx, kind: Exclude<HumanBuildingKind, 'command_center'>, core: { x: number; y: number }): boolean {
  const { game, world, selection } = ctx;
  const human = game.getHumanPlayer()!;
  const builders = humanUnits(world, 'builder');
  if (builders.length === 0) return false;
  selection.selectAnts([builders[0]], Layer.Surface);
  if (human.beginPlacement(kind) !== null) {
    game.clearSelection();
    return false;
  }
  const minR = kind === 'bunker' ? 4 : 6;
  for (let r = minR; r <= minR + 8 && human.isPlacing(); r += 2) {
    for (let k = 0; k < 12 && human.isPlacing(); k++) {
      const a = (k / 12) * Math.PI * 2 + r;
      human.clickAt({ x: Math.round(core.x + Math.cos(a) * r), y: Math.round(core.y + Math.sin(a) * r) }, false);
    }
  }
  const placed = !human.isPlacing();
  human.cancelPlacement();
  game.clearSelection();
  return placed;
}

const humanBot: Bot = (ctx) => {
  const { game, world, selection, night } = ctx;
  const human = game.getHumanPlayer()!;
  const core = human.corePosition();
  if (!core) return;
  const stats = human.stats();

  // Idle builders mine the nearest node
  const nodes = world.query(COMPONENT.MINERAL, COMPONENT.POSITION).map((id) => ({ id, ...pos(world, id) }));
  if (human.selectIdleBuilders() > 0) {
    const node = nearestTo(nodes, core);
    if (node) human.commandAt({ x: node.x, y: node.y });
    game.clearSelection();
  }

  // Build: depots when supply runs short, bunkers around the command center, more Cuarteles and a Fábrica
  const bunkers = humanBuildings(world, 'bunker').length;
  const factories = humanBuildings(world, 'factory').length;
  if (stats.supply >= stats.supplyCap - 4 && humanBuildings(world, 'supply_depot').length < 12 && stats.minerals >= 100) humanPlace(ctx, 'supply_depot', core);
  else if (bunkers < Math.min(6, 1 + night) && stats.minerals >= 100) humanPlace(ctx, 'bunker', core);
  else if (humanBuildings(world, 'barracks').length < 3 && stats.minerals >= 300) humanPlace(ctx, 'barracks', core);
  else if (factories < 1 && night >= 3 && stats.minerals >= 350) humanPlace(ctx, 'factory', core);

  // Train: a few builders, then soldiers (a marksman every third), and tanks from the Fábrica
  selection.selectOnly(human.coreId!);
  if (humanUnits(world, 'builder').length < 4 && stats.rations >= 50) human.train('builder');
  const troops = humanUnits(world).length - humanUnits(world, 'builder').length;
  for (let i = 0; i < 2; i++) human.train(troops % 3 === 2 && stats.minerals >= 25 ? 'marksman' : 'soldier');
  if (factories > 0 && stats.rations >= 200 && stats.minerals >= 150) human.train('tank');
  game.clearSelection();

  // Defend: troops attack-move on the nearest threat to the command center
  const foes = hostiles(world, Layer.Surface).filter((f) => dist(f, core) < 16);
  if (foes.length > 0) {
    const target = nearestTo(foes, core)!;
    const army = humanUnits(world).filter((id) => world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type !== 'builder');
    if (army.length > 0) {
      selection.selectAnts(army, Layer.Surface);
      game.orderSelectedMove(Math.round(target.x), Math.round(target.y), true);
      game.clearSelection();
    }
  }
};

// ── The Crystal Hive ──────────────────────────────────────────

const crystalBot: Bot = ({ game, world, selection }) => {
  const crystal = game.getCrystal()!;
  const hiveId = crystal.system.hive();
  if (hiveId === null) return;
  const hive = pos(world, hiveId);
  const structures = crystal.system.structures().map((id) => ({ id, kind: world.getComponent<CrystalSpireComponent>(id, COMPONENT.CRYSTAL_SPIRE)!.kind }));
  const count = (kind: CrystalBuildKind) => structures.filter((s) => s.kind === kind).length;
  const minerals = world.minerals.stored;

  // Build order: extractor, forge, prism, a second extractor; then floors when supply runs short and
  // more spires with spare minerals. A step that cannot be placed (no free node in reach) is skipped.
  const supply = crystal.system.supply();
  const spires = structures.filter((s) => s.kind !== 'extractor' && crystal.system.isComplete(s.id));
  const nextSpire: CrystalBuildKind = count('prism') <= count('forge') ? 'prism' : 'forge';
  const wants: CrystalBuildKind[] = [];
  if (count('extractor') < 1) wants.push('extractor');
  if (count('forge') < 1) wants.push('forge');
  if (count('prism') < 1) wants.push('prism');
  if (count('extractor') < 2) wants.push('extractor');
  if (supply.used >= supply.cap - 3 && minerals >= CRYSTAL_FLOOR.cost) {
    const low = spires.find((s) => world.getComponent<CrystalSpireComponent>(s.id, COMPONENT.CRYSTAL_SPIRE)!.floors < CRYSTAL_MAX_FLOORS);
    if (low && crystal.addFloor(low.id).ok) wants.length = 0;
    else if (count('forge') + count('prism') < 8) wants.push(nextSpire);
  } else if (minerals >= 350 && count('forge') + count('prism') < 8) wants.push(nextSpire);
  for (const want of wants) {
    if (world.minerals.stored < CRYSTAL_STRUCTURES[want].cost) break;
    const nodes = world.query(COMPONENT.MINERAL, COMPONENT.POSITION).map((id) => pos(world, id))
      .filter((p) => !structures.some((s) => s.kind === 'extractor' && dist(pos(world, s.id), p) < 6))
      .sort((a, b) => dist(a, hive) - dist(b, hive));
    const anchors = want === 'extractor' ? nodes.slice(0, 3) : [hive, ...spires.map((s) => pos(world, s.id))];
    crystal.setBuildMode(want);
    let placed = false;
    for (const around of anchors) {
      for (let r = want === 'extractor' ? 1 : 3; r <= 10 && !placed; r += 1) {
        for (let k = 0; k < 16 && !placed; k++) {
          const a = (k / 16) * Math.PI * 2 + r;
          placed = crystal.tryPlace({ x: Math.round(around.x + Math.cos(a) * r), y: Math.round(around.y + Math.sin(a) * r) }).ok;
        }
      }
      if (placed) break;
    }
    crystal.setBuildMode(null);
    if (placed) break;
  }

  // Produce from every finished spire
  for (const s of structures) {
    if (s.kind === 'extractor' || !crystal.system.isComplete(s.id)) continue;
    const producer = crystal.system.producerOf(s.id);
    if (producer && producer.queue.length < 2) crystal.queueUnit(s.id, s.kind === 'forge' ? 'drone' : 'sentinel');
  }

  // Defend the Hive
  const foes = hostiles(world, Layer.Surface).filter((f) => dist(f, hive) < 16);
  if (foes.length > 0) {
    const target = nearestTo(foes, hive)!;
    const army = crystal.system.units();
    if (army.length > 0) {
      selection.selectAnts(army, Layer.Surface);
      game.orderSelectedMove(Math.round(target.x), Math.round(target.y), true);
      game.clearSelection();
    }
  }
};

const BOTS: Record<RaceId, Bot> = { swarm: swarmBot, human: humanBot, crystal: crystalBot };

/** Seconds of game time between two looks of the scripted player */
const BOT_PERIOD = 2;

// ── The run ───────────────────────────────────────────────────

function colonyCount(game: GameManager, world: World, race: RaceId): { colony: number; fighters: number } {
  if (race === 'human') {
    const units = humanUnits(world);
    return { colony: units.length, fighters: units.length - humanUnits(world, 'builder').length };
  }
  if (race === 'crystal') {
    const units = game.getCrystal()!.system.units();
    return { colony: units.length, fighters: units.length };
  }
  const by = antsBy(world);
  return { colony: world.query(COMPONENT.ANT).length, fighters: (by.get(AntRole.Soldier)?.length ?? 0) + (by.get(AntRole.Defender)?.length ?? 0) };
}

function coreOf(game: GameManager, world: World, race: RaceId): EntityId | null {
  if (race === 'human') return game.getHumanPlayer()!.coreId;
  if (race === 'crystal') return game.getCrystal()!.system.hive();
  return world.query(COMPONENT.QUEEN_ENTITY)[0] ?? null;
}

function healthShare(world: World, id: EntityId | null): number {
  if (id === null || !world.hasEntity(id)) return 0;
  const h = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
  return h ? Math.max(0, h.current) / h.max : 0;
}

function defenseCount(game: GameManager, world: World, race: RaceId): number {
  if (race === 'human') return humanBuildings(world, 'bunker').length;
  if (race === 'crystal') return game.getCrystal()!.system.structures().length;
  return world.query(STRUCTURE_COMPONENT).length;
}

function raceNote(game: GameManager, world: World, race: RaceId): string {
  if (race === 'human') {
    const st = game.getHumanPlayer()!.stats();
    const kinds = humanBuildings(world).map((id) => world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind[0]).join('');
    return `supply ${st.supply}/${st.supplyCap} buildings ${kinds}`;
  }
  if (race === 'crystal') {
    const sup = game.getCrystal()!.system.supply();
    return `supply ${sup.used}/${sup.cap}`;
  }
  const by = antsBy(world);
  const nest = world.query(COMPONENT.NEST)[0];
  const entrance = nest !== undefined ? Math.floor(world.getComponent<NestComponent>(nest, COMPONENT.NEST)!.foodStored) : 0;
  const states = new Map<string, number>();
  for (const id of by.get(AntRole.Worker) ?? []) {
    const a = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    const key = `${a.state}${layerOf(world, id) === Layer.Underground ? '/U' : ''}`;
    states.set(key, (states.get(key) ?? 0) + 1);
  }
  const top = [...states].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}:${v}`).join(',');
  return `${[...by].map(([role, ids]) => `${role[0]}${ids.length}`).join(' ')} entrance ${entrance} workers[${top}]`;
}

/** Play one run headless; returns what happened */
export function runBalanceSim(config: SimConfig): SimResult {
  const started = Date.now();
  return withSeed(config.seed, () => {
    const game = new GameManager(fakeCanvas(), { playerRace: config.player, rivalRace: config.rival });
    finishIntro(game);
    const world = game['world'] as World;
    const selection = game['selectionSystem'] as SelectionSystem;
    const dayNight = game['dayNightSystem'] as { getDayNumber(): number; getPhase(): 'day' | 'night' };
    const state = game as unknown as { gameOver: GameOverStats | null; mutationOffer: { options: Array<{ id: string }> } | null };
    const dt = config.dt ?? 1 / 30;
    const bot = config.bot === 'reasonable' ? BOTS[config.player] : null;
    const nights: NightRecord[] = [];
    let phase = dayNight.getPhase();
    let botTimer = 0;
    let time = 0;
    let starvedWithFood = 0;
    let wasStarving = false;
    let pendingWave: NightRecord | null = null;
    const grid = game['undergroundGrid'] as UndergroundGrid;

    const nightsSurvived = () => Math.max(0, dayNight.getDayNumber() - 1);
    while (!state.gameOver && nightsSurvived() < config.maxNights) {
      // The dawn pick: every bot (the idle one too) takes the first card, as a hurried player would
      if (state.mutationOffer) game.chooseMutation(state.mutationOffer.options[0].id);
      game['update'](dt);
      time += dt;
      config.onTick?.(game, world, time);

      const now = dayNight.getPhase();
      if (now !== phase) {
        const core = coreOf(game, world, config.player);
        const { colony, fighters } = colonyCount(game, world, config.player);
        if (now === 'night') {
          const queenId = config.player === 'swarm' ? world.query(COMPONENT.QUEEN_ENTITY)[0] : undefined;
          const queen = queenId !== undefined ? world.getComponent<QueenEntityComponent>(queenId, COMPONENT.QUEEN_ENTITY) : undefined;
          pendingWave = {
            night: dayNight.getDayNumber(),
            colony,
            fighters,
            food: config.player === 'human' ? game.getHumanPlayer()!.stats().rations : config.player === 'swarm' ? Math.floor(grid.getPantryStored().total) : 0,
            minerals: Math.floor(world.minerals.stored),
            defenses: defenseCount(game, world, config.player),
            waveSize: 0,
            coreHealth: Math.round(healthShare(world, core) * 100) / 100,
            coreHealthAtDawn: null,
            colonyAtDawn: null,
            queenHunger: queen ? Math.round((queen.hunger / queen.maxHunger) * 100) / 100 : null,
            note: raceNote(game, world, config.player),
          };
          nights.push(pendingWave);
        } else if (pendingWave) {
          pendingWave.coreHealthAtDawn = Math.round(healthShare(world, core) * 100) / 100;
          pendingWave.colonyAtDawn = colony;
          config.onNight?.(pendingWave);
          pendingWave = null;
        }
        phase = now;
      }
      // The wave's size, once it is on
      if (pendingWave && pendingWave.waveSize === 0) {
        const info = game['waves']().getInfo();
        if (info.active) pendingWave.waveSize = info.waveSize;
      }
      // Did the queen go hungry with food in the pantry?
      if (config.player === 'swarm') {
        const queenId = world.query(COMPONENT.QUEEN_ENTITY)[0];
        const queen = queenId !== undefined ? world.getComponent<QueenEntityComponent>(queenId, COMPONENT.QUEEN_ENTITY) : undefined;
        const starving = queen !== undefined && queen.hunger <= 0;
        if (starving && !wasStarving && grid.getPantryStored().total >= 10) starvedWithFood++;
        wasStarving = starving;
      }

      if (bot && (botTimer -= dt) <= 0) {
        botTimer = BOT_PERIOD;
        bot({ game, world, selection, night: dayNight.getDayNumber(), time });
      }
    }
    const over = state.gameOver;
    const defeat = over?.outcome === 'defeat' ? over : null;
    game.stop();
    return {
      config,
      deathNight: defeat ? defeat.nightsSurvived : null,
      diedOn: defeat?.diedOn ?? null,
      cause: defeat?.cause ?? null,
      causeLine: defeat?.cause ? deathCauseText(defeat.cause).line : null,
      nights,
      starvedWithFood,
      wallMs: Date.now() - started,
    };
  });
}

/** The median of the death nights; a run alive at the cap counts as the cap (shown as "cap+") */
export function medianDeathNight(results: readonly SimResult[]): number {
  const values = results.map((r) => r.deathNight ?? r.config.maxNights).sort((a, b) => a - b);
  if (values.length === 0) return NaN;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}
