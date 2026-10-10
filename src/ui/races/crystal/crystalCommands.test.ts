import { describe, expect, it, vi } from 'vitest';
import type { GameManager, GameStats, SelectedEntityInfo } from '../../../game/GameManager';
import { ColonyPriority } from '../../../game/components/components';
import type { CrystalPlayerSnapshot } from '../../../game/races/crystal/CrystalPlayerController';
import { CRYSTAL_FLOOR, CRYSTAL_PLAYER_UNITS, CRYSTAL_STRUCTURES } from '../../../game/races/crystal/crystalPlayerRules';
import { buildCommands, type CommandContext } from '../../console/commands';
import type { ColonyDetails } from '../../console/useColonyDetails';

function snapshot(over: Partial<CrystalPlayerSnapshot> = {}): CrystalPlayerSnapshot {
  return {
    minerals: 500,
    income: 1,
    supply: { used: 4, cap: 10 },
    buildMode: null,
    units: { drones: 2, sentinels: 0 },
    structures: { extractors: 0, forges: 0, prisms: 0, growing: 0 },
    hiveHealth: { current: 1500, max: 1500 },
    hiveShield: { current: 500, max: 500 },
    selection: null,
    selectedKinds: { drones: 0, sentinels: 0 },
    ...over,
  };
}

function context(stats: Partial<GameStats>, touch = false) {
  const crystal = {
    setBuildMode: vi.fn(),
    getBuildMode: vi.fn(() => null),
    queueUnit: vi.fn(() => ({ ok: true })),
    addFloor: vi.fn(() => ({ ok: true })),
    cancelLast: vi.fn(() => true),
  };
  const gm = {
    getCrystal: () => crystal,
    armMoveTarget: vi.fn(),
    armAttackTarget: vi.fn(),
    holdSelectedAnts: vi.fn(() => 2),
    stopSelectedAnts: vi.fn(() => 2),
    clearSelection: vi.fn(),
    togglePause: vi.fn(),
    setSpeed: vi.fn(),
    cancelCommandTarget: vi.fn(),
    setAreaSelect: vi.fn(),
  };
  const ctx: CommandContext = {
    gm: gm as unknown as GameManager,
    stats: {
      paused: false,
      speed: 1,
      colonyPriority: ColonyPriority.Gather,
      activeLayer: 'surface',
      availableSoldiers: 0,
      selectedEntity: null,
      crystal: snapshot(),
      ...stats,
    } as GameStats,
    details: {} as ColonyDetails,
    page: 'root',
    buildMode: null,
    attackCount: 10,
    setPage: vi.fn(),
    toggleBuildMode: vi.fn(),
    switchLayer: vi.fn(),
    refresh: vi.fn(),
    notify: vi.fn(),
    touch,
  };
  return { gm, crystal, ctx };
}

const SPIRE: SelectedEntityInfo = { entityId: 7, type: 'crystal_spire', position: { x: 1, y: 1 }, spireKind: 'forge', spireFloors: 1, owned: true };

describe('the Crystal Hive’s command card', () => {
  it('the root card builds: Extractor, Aguja de drones, Aguja de centinelas with their mineral costs', () => {
    const { ctx, crystal } = context({});
    const slots = buildCommands(ctx);
    expect(slots.slice(0, 3).map((c) => c?.id)).toEqual(['build-extractor', 'build-forge', 'build-prism']);
    expect(slots[1]?.cost).toEqual({ amount: CRYSTAL_STRUCTURES.forge.cost, resource: 'minerales', short: false });
    // No Swarm commands: no breeding, no nest, no colony priorities
    const ids = slots.map((c) => c?.id ?? '');
    for (const swarm of ['descend', 'gather', 'retreat', 'breed-worker']) expect(ids).not.toContain(swarm);
    slots[1]!.run();
    expect(crystal.setBuildMode).toHaveBeenCalledWith('forge');
  });

  it('a structure it cannot pay for shows its cost in red', () => {
    const { ctx } = context({ crystal: snapshot({ minerals: 50 }) });
    expect(buildCommands(ctx)[2]?.cost?.short).toBe(true);
  });

  it('an armed build button is active and pressing it again cancels', () => {
    const { ctx, crystal } = context({ crystal: snapshot({ buildMode: 'extractor' }) });
    const button = buildCommands(ctx)[0]!;
    expect(button.active).toBe(true);
    button.run();
    expect(crystal.setBuildMode).toHaveBeenCalledWith(null);
  });

  it('a selected spire queues its unit, adds a floor and cancels the last in line', () => {
    const selection = {
      entityId: 7, kind: 'spire' as const, spireKind: 'forge' as const, floors: 1, maxFloors: 3,
      producer: { queue: ['drone' as const], progress: 0.5, remaining: 10, blocked: null, rally: null },
    };
    const { ctx, crystal } = context({ selectedEntity: SPIRE, crystal: snapshot({ selection }) });
    const slots = buildCommands(ctx);
    const produce = slots.find((c) => c?.id === 'produce-drone')!;
    expect(produce.label).toBe('Producir Dron');
    expect(produce.cost).toMatchObject({ amount: CRYSTAL_PLAYER_UNITS.drone.cost, resource: 'minerales' });
    expect(produce.badge).toBe('1');
    produce.run();
    expect(crystal.queueUnit).toHaveBeenCalledWith(7, 'drone');
    const floor = slots.find((c) => c?.id === 'add-floor')!;
    expect(floor.label).toBe('Añadir piso');
    expect(floor.cost?.amount).toBe(CRYSTAL_FLOOR.cost);
    floor.run();
    expect(crystal.addFloor).toHaveBeenCalledWith(7);
    slots.find((c) => c?.id === 'cancel-unit')!.run();
    expect(crystal.cancelLast).toHaveBeenCalledWith(7);
    expect(slots.some((c) => c?.id === 'produce-sentinel')).toBe(false);
  });

  it('a Sentinel spire says Producir Centinela', () => {
    const selection = {
      entityId: 8, kind: 'spire' as const, spireKind: 'prism' as const, floors: 3, maxFloors: 3,
      producer: { queue: [], progress: 0, remaining: 0, blocked: null, rally: null },
    };
    const { ctx } = context({ selectedEntity: { ...SPIRE, entityId: 8, spireKind: 'prism' }, crystal: snapshot({ selection }) });
    const slots = buildCommands(ctx);
    expect(slots.find((c) => c?.id === 'produce-sentinel')?.label).toBe('Producir Centinela');
    expect(slots.find((c) => c?.id === 'add-floor')?.disabled).toBe(true); // three floors already
  });

  it('own units get the RTS orders', () => {
    const { ctx, gm } = context({
      selectedGroup: { count: 2, byRole: {}, ordered: 0, units: [] },
      crystal: snapshot({ selectedKinds: { drones: 2, sentinels: 0 } }),
    });
    const slots = buildCommands(ctx);
    expect(slots.map((c) => c?.id ?? null).filter(Boolean)).toEqual(expect.arrayContaining(['move', 'attack', 'stop', 'hold', 'deselect']));
    slots.find((c) => c?.id === 'attack')!.run();
    expect(gm.armAttackTarget).toHaveBeenCalled();
    // The build row stays at hand
    expect(slots.slice(1, 4).map((c) => c?.id)).toEqual(['build-extractor', 'build-forge', 'build-prism']);
  });
});
