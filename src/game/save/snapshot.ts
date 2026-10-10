// Capture a running GameManager into a SaveFile, and build a GameManager back
// from one.
//
// Loading builds a brand-new manager for the same run setup (so every System,
// callback and renderer is wired exactly as in a new run), then writes the
// saved state over it with the generic codec, and finally rebuilds what is
// derived rather than saved: grid caches, terrain render caches, the intro.

import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import type { System } from '../../engine/ecs/types';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import type { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import type { GameLoop } from '../../engine/loop/GameLoop';
import { sanitizeRunSetup } from '../run/RunSetup';
import { COMPONENT, type SelectableComponent } from '../components/components';
import { Decoder, Encoder, SaveShapeError, type CodecPolicy } from './codec';
import { SAVE_FORMAT, SAVE_VERSION, type SaveFile, type SaveMeta, type SaveState } from './format';
import type { StatefulRng } from './rng';

/**
 * Fields that are not run state, by class: wiring the constructor rebuilds,
 * transient UI (build tools, selection, pings), wall-clock timers, and caches
 * that are derived and rebuilt on load. Everything else is saved, including
 * fields other branches add later.
 */
const DENY_FIELDS: Record<string, readonly string[]> = {
  GameManager: [
    'canvas', 'introClock', 'introDirector', 'renderer', 'input', 'camera', 'undergroundCamera',
    'renderSystem', 'gameLoop', 'statsCallback', 'statsTicks', 'tickListeners', 'runSetup',
    'activeLayer', 'farmMode', 'throneMode', 'defenseMode', 'digMode', 'incubationMode', 'storageMode',
    'viewportConfigured', 'areaSelect', 'paintStroke', 'armedCommand', 'orderPings',
  ],
  World: ['systems', 'systemsSorted', 'deathEffects', 'hitEffects', 'notifications', 'notificationCooldowns'],
  UndergroundGrid: ['entranceCache', 'entranceCacheVersion', 'chamberRegions', 'chamberCoords', 'layoutVersion'],
  SelectionSystem: ['selected', 'selectionLayer'],
  ControlGroups: ['lastTap'],
  PorterSystem: ['lastPantryFullNotify'],
  RunModifiers: ['marks'],
};

/** Never saved wherever they are found: VFX pools, renderers, cameras, input */
const DENY_CLASSES = new Set([
  'CombatVfx', 'HumanShots', 'IntroClock', 'IntroDirector', 'MeteorIntro', 'Camera', 'CanvasRenderer',
  'InputManager', 'GameLoop', 'RenderSystem', 'HumanRenderer', 'OffscreenCanvas', 'HTMLCanvasElement',
  'CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'ImageBitmap', 'ImageData',
]);

/** The private parts of a GameManager a save reads and writes */
interface ManagerInternals {
  world: World;
  grid: TileGrid;
  undergroundGrid: UndergroundGrid;
  visibilityGrid: VisibilityGrid;
  gameLoop: GameLoop;
  offerRng: StatefulRng;
  craterSite: { x: number; y: number };
  mutationOffer: unknown;
  gameOver: unknown;
  introClock: { advance(dt: number): void };
  introDirector: { finish(): void };
  renderSystem: {
    startMeteorIntro(impact: { x: number; y: number }, nest: { x: number; y: number }, clock: unknown): void;
    skipIntro(): boolean;
    invalidateTerrain(): void;
  };
  detachIntroSkip(): void;
  publishStats(): void;
}

function internals(gm: GameManager): ManagerInternals {
  return gm as unknown as ManagerInternals;
}

function systemsOf(world: World): System[] {
  return (world as unknown as { systems: System[] }).systems;
}

function componentStoresOf(world: World): Map<string, Map<number, unknown>> {
  return (world as unknown as { componentStores: Map<string, Map<number, unknown>> }).componentStores;
}

/**
 * Systems keyed by name (a second one with the same name gets `#2`), in name
 * order: the World sorts its list by priority on the first tick, so list
 * order differs between a run that ticked and one that did not.
 */
function systemsByName(world: World): Map<string, System> {
  const named = new Map<string, System>();
  for (const system of systemsOf(world)) {
    let key = system.name;
    for (let n = 2; named.has(key); n++) key = `${system.name}#${n}`;
    named.set(key, system);
  }
  return new Map([...named].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function policyFor(gm: GameManager): CodecPolicy {
  const m = internals(gm);
  const skip = new Set<object>([gm, m.world, m.grid, m.undergroundGrid, m.visibilityGrid, ...systemsOf(m.world)]);
  for (const key of DENY_FIELDS.GameManager) {
    const value = (gm as unknown as Record<string, unknown>)[key];
    if (typeof value === 'object' && value !== null) skip.add(value);
  }
  return { skip, denyFields: DENY_FIELDS, denyClasses: DENY_CLASSES };
}

/** The World's fields as saved: empty component stores dropped, nothing selected */
function worldFields(encoder: Encoder, world: World): Record<string, unknown> {
  const fields = encoder.fieldsOf(world);
  const stores = new Map<string, Map<number, unknown>>();
  for (const [name, store] of componentStoresOf(world)) {
    if (store.size === 0) continue;
    if (name === COMPONENT.SELECTABLE) {
      const copy = new Map<number, unknown>();
      for (const [id, comp] of store) copy.set(id, { ...(comp as SelectableComponent), selected: false });
      stores.set(name, copy);
    } else {
      stores.set(name, store);
    }
  }
  fields.componentStores = stores;
  return fields;
}

/** The run's state as JSON-safe data (no metadata): what a round trip must preserve */
export function captureState(gm: GameManager): SaveState {
  const m = internals(gm);
  const encoder = new Encoder(policyFor(gm));
  const world = worldFields(encoder, m.world);
  const systems = systemsByName(m.world);
  // One identity space for the whole save: count everything, then write
  encoder.count(m.world, world);
  encoder.count(m.grid);
  encoder.count(m.undergroundGrid);
  encoder.count(m.visibilityGrid);
  for (const system of systems.values()) encoder.count(system);
  encoder.count(gm);
  const state: SaveState = {
    setup: { ...gm.getRunSetup() },
    world: encoder.encodeRoot(m.world, world),
    grid: encoder.encodeRoot(m.grid),
    underground: encoder.encodeRoot(m.undergroundGrid),
    visibility: encoder.encodeRoot(m.visibilityGrid),
    systems: {},
    manager: {},
    loop: { tickCount: m.gameLoop.getTickCount(), speed: m.gameLoop.getSpeed() },
    offerRng: m.offerRng.getState(),
  };
  for (const [name, system] of systems) state.systems[name] = encoder.encodeRoot(system);
  state.manager = encoder.encodeRoot(gm);
  return state;
}

/** The serialized run state, for comparing two runs */
export function serializeState(gm: GameManager): string {
  return JSON.stringify(captureState(gm));
}

export function describeRun(gm: GameManager, savedAt = Date.now()): SaveMeta {
  const stats = gm.getStats();
  const setup = gm.getRunSetup();
  return {
    playerRace: setup.playerRace,
    rivalRace: setup.rivalRace,
    day: stats.dayNumber,
    phase: stats.dayPhase,
    ants: stats.antCount,
    wave: stats.invasion.waveNumber,
    minerals: stats.mineralsStored,
    ticks: internals(gm).gameLoop.getTickCount(),
    savedAt,
  };
}

export function captureSave(gm: GameManager, savedAt = Date.now()): SaveFile {
  return { format: SAVE_FORMAT, version: SAVE_VERSION, meta: describeRun(gm, savedAt), state: captureState(gm) };
}

function applyState(gm: GameManager, state: SaveState): void {
  const m = internals(gm);
  if (typeof state !== 'object' || state === null) throw new SaveShapeError('sin estado');
  const decoder = new Decoder();
  // Stores a System may hold on to keep their identity even if the save has none of that component
  const storesBefore = new Map(componentStoresOf(m.world));
  // Same order as captureState, so shared objects are met first where they were written
  decoder.decodeRoot(m.world, state.world);
  const stores = componentStoresOf(m.world);
  for (const [name, store] of storesBefore) {
    if (stores.has(name)) continue;
    store.clear();
    stores.set(name, store);
  }
  decoder.decodeRoot(m.grid, state.grid);
  decoder.decodeRoot(m.undergroundGrid, state.underground);
  decoder.decodeRoot(m.visibilityGrid, state.visibility);
  const systems = systemsByName(m.world);
  if (typeof state.systems !== 'object' || state.systems === null) throw new SaveShapeError('sin sistemas');
  for (const name of Object.keys(state.systems)) {
    const system = systems.get(name);
    // A system this build no longer has: its state has nowhere to go
    if (system) decoder.decodeRoot(system, state.systems[name]);
  }
  decoder.decodeRoot(gm, state.manager);

  const loop = m.gameLoop as unknown as { tickCount: number };
  loop.tickCount = Number(state.loop?.tickCount) || 0;
  m.gameLoop.setSpeed(Number(state.loop?.speed) || 1);
  m.offerRng.setState(Number(state.offerRng) >>> 0);
}

/** Rebuild what is derived from the state instead of saved */
function rebuildDerived(gm: GameManager): void {
  const m = internals(gm);
  const ug = m.undergroundGrid as unknown as Record<string, unknown>;
  ug.entranceCache = null;
  ug.entranceCacheVersion = -1;
  ug.chamberRegions = null;
  ug.chamberCoords = null;
  m.undergroundGrid.markLayoutChanged();
  (m.world.runModifiers as unknown as { marks: unknown }).marks = null;
  // The opening already played in the saved run: the crater stands where the meteor struck
  m.introClock.advance(Number.POSITIVE_INFINITY);
  m.introDirector.finish();
  m.detachIntroSkip();
  const nest = { x: Math.floor(m.grid.width / 2), y: Math.floor(m.grid.height / 2) };
  m.renderSystem.startMeteorIntro(m.craterSite, nest, m.introClock);
  m.renderSystem.skipIntro();
  m.renderSystem.invalidateTerrain();
  // A pending dawn pick or a finished run stays paused, as it was
  if (m.mutationOffer || m.gameOver) m.gameLoop.setPaused(true);
}

/**
 * A GameManager running the saved run. Throws a SaveShapeError (with a
 * player-facing message) if the save does not fit this build; the half-built
 * manager is stopped first.
 */
export function restoreSave(canvas: HTMLCanvasElement, save: SaveFile): GameManager {
  const gm = new GameManager(canvas, sanitizeRunSetup(save?.state?.setup));
  try {
    applyState(gm, save.state);
    rebuildDerived(gm);
  } catch (e) {
    gm.stop();
    const detail = e instanceof Error ? e.message : String(e);
    throw new SaveShapeError(`La partida guardada no se pudo cargar (${detail})`);
  }
  return gm;
}
