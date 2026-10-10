import { describe, expect, it, vi } from 'vitest';
import type { GameManager, GameStats } from '../../../game/GameManager';
import type { HumanPlayerStats } from '../../../game/races/human/HumanPlayerRun';
import { buildCommands, type CommandContext, type CommandDef } from '../../console/commands';
import type { ColonyDetails } from '../../console/useColonyDetails';
import { HUMAN_RECRUIT_HINT, humanHint, humanIdleHint } from './humanCommands';

function humanStats(overrides: Partial<HumanPlayerStats> = {}): HumanPlayerStats {
  return {
    rations: 150,
    minerals: 150,
    supply: 4,
    supplyCap: 6,
    income: 2,
    units: { builder: 2, soldier: 2, marksman: 0, tank: 0 },
    idleBuilders: 0,
    selectedBuilders: 0,
    selectedUnits: 0,
    placing: null,
    selected: null,
    group: null,
    intro: null,
    ...overrides,
  };
}

function context(human: HumanPlayerStats, stats: Partial<GameStats> = {}, page: CommandContext['page'] = 'root') {
  const player = {
    beginPlacement: vi.fn(() => null),
    cancelPlacement: vi.fn(),
    train: vi.fn(() => null),
    cancelTraining: vi.fn(() => true),
    clearRally: vi.fn(() => true),
    selectIdleBuilders: vi.fn(() => 1),
    selectCore: vi.fn(() => true),
    startBarracksPlacement: vi.fn((): string | null => null),
  };
  const gm = {
    getHumanPlayer: () => player,
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
  const setPage = vi.fn();
  const notify = vi.fn();
  const ctx: CommandContext = {
    gm: gm as unknown as GameManager,
    stats: { paused: false, speed: 1, activeLayer: 'surface', selectedEntity: null, human, ...stats } as GameStats,
    details: {} as ColonyDetails,
    page,
    buildMode: null,
    attackCount: 10,
    setPage,
    toggleBuildMode: vi.fn(),
    switchLayer: vi.fn(),
    refresh: vi.fn(),
    notify,
  };
  return { ctx, player, gm, setPage, notify };
}

const byId = (slots: Array<CommandDef | null>, id: string) => slots.find((c) => c?.id === id) ?? null;
const ids = (slots: Array<CommandDef | null>) => slots.filter((c): c is CommandDef => c !== null).map((c) => c.id);

describe('the Human command card', () => {
  it('has no Swarm buttons: no breeding, no colony priorities, no going down into a nest', () => {
    const { ctx } = context(humanStats());
    const slots = buildCommands(ctx);
    expect(slots).toHaveLength(15);
    for (const swarm of ['gather', 'explore', 'defend', 'retreat', 'descend']) expect(byId(slots, swarm)).toBeNull();
    expect(ids(slots).some((id) => id.startsWith('breed-'))).toBe(false);
    expect(byId(slots, 'human-idle-builders')).not.toBeNull();
    expect(byId(slots, 'human-select-core')).not.toBeNull();
  });

  it('a selected builder gets the unit orders and Construir, which opens the building menu', () => {
    const { ctx, setPage } = context(humanStats({ selectedBuilders: 1, selectedUnits: 1 }), {
      selectedEntity: { entityId: 5, type: 'human_unit', position: { x: 0, y: 0 } },
    });
    const slots = buildCommands(ctx);
    for (const order of ['move', 'attack', 'stop', 'hold']) expect(byId(slots, order)).not.toBeNull();
    const build = byId(slots, 'human-build')!;
    expect(build.label).toBe('Construir');
    build.run();
    expect(setPage).toHaveBeenCalledWith('build');
  });

  it('the building menu lists the barracks, bunker, supply depot and factory with their mineral costs', () => {
    const { ctx, player, notify } = context(humanStats({ selectedBuilders: 1, selectedUnits: 1, minerals: 120 }), {
      selectedEntity: { entityId: 5, type: 'human_unit', position: { x: 0, y: 0 } },
    }, 'build');
    const slots = buildCommands(ctx);
    const names = ['Cuartel', 'Búnker', 'Depósito de suministros', 'Fábrica'];
    for (const [i, kind] of ['barracks', 'bunker', 'supply_depot', 'factory'].entries()) {
      const button = byId(slots, `human-build-${kind}`)!;
      expect(button.label).toBe(names[i]);
      expect(button.cost?.resource).toBe('minerales');
    }
    expect(byId(slots, 'human-build-barracks')!.cost).toMatchObject({ amount: 150, short: true });
    expect(byId(slots, 'human-build-bunker')!.cost).toMatchObject({ amount: 100, short: false });
    byId(slots, 'human-build-bunker')!.run();
    expect(player.beginPlacement).toHaveBeenCalledWith('bunker');
    // A placement that starts says nothing alarming
    expect(notify).not.toHaveBeenCalledWith(expect.anything(), 'danger');
    expect(byId(slots, 'back')).not.toBeNull();
  });

  it('while placing, the card offers Cancelar and the hint explains mouse and touch', () => {
    const placing = { kind: 'barracks' as const, name: 'Cuartel', cost: { rations: 0, minerals: 150 }, x: 10, y: 10, valid: false, reason: 'Hay otro edificio en ese lugar.' };
    const { ctx, player } = context(humanStats({ selectedBuilders: 1, placing }));
    const cancel = byId(buildCommands(ctx), 'human-cancel-placement')!;
    cancel.run();
    expect(player.cancelPlacement).toHaveBeenCalled();
    const stats = { human: humanStats({ placing }) } as GameStats;
    expect(humanHint(stats, false)).toMatch(/CUARTEL[^]*clic[^]*Hay otro edificio/);
    expect(humanHint(stats, true)).toMatch(/toca/i);
  });

  it('a selected barracks trains soldiers and marksmen, shows the queue and lets the last one be canceled', () => {
    const selected = {
      id: 9,
      kind: 'barracks' as const,
      name: 'Cuartel',
      construction: null,
      queue: ['soldier' as const],
      progress: 0.5,
      remaining: 10,
      rally: null,
      trains: [
        { type: 'soldier' as const, name: 'Soldado', cost: { rations: 70, minerals: 0 }, reason: null },
        { type: 'marksman' as const, name: 'Tirador', cost: { rations: 90, minerals: 25 }, reason: 'Faltan minerales: Tirador cuesta 25.' },
      ],
    };
    const { ctx, player, notify } = context(humanStats({ selected }), {
      selectedEntity: { entityId: 9, type: 'human_building', position: { x: 0, y: 0 } },
    });
    const slots = buildCommands(ctx);
    const soldier = byId(slots, 'human-train-soldier')!;
    expect(soldier.label).toBe('Entrenar Soldado');
    expect(soldier.cost).toMatchObject({ amount: 70, resource: 'raciones' });
    expect(soldier.badge).toBe('1');
    soldier.run();
    expect(player.train).toHaveBeenCalledWith('soldier');
    expect(notify).not.toHaveBeenCalledWith(expect.anything(), 'danger');
    const marksman = byId(slots, 'human-train-marksman')!;
    expect(marksman.label).toBe('Entrenar Tirador');
    expect(marksman.disabled).toBe(true);
    expect(marksman.disabledReason).toMatch(/minerales/);
    byId(slots, 'human-cancel-train')!.run();
    expect(player.cancelTraining).toHaveBeenCalled();
    // Not an enemy base: no attack-wave button
    expect(byId(slots, 'attack-den')).toBeNull();
  });

  it('the factory makes tanks and the command center trains builders', () => {
    const factory = { id: 3, kind: 'factory' as const, name: 'Fábrica', construction: null, queue: [], progress: 0, remaining: 0, rally: null,
      trains: [{ type: 'tank' as const, name: 'Tanque', cost: { rations: 200, minerals: 150 }, reason: null }] };
    const one = context(humanStats({ selected: factory }), { selectedEntity: { entityId: 3, type: 'human_building', position: { x: 0, y: 0 } } });
    expect(byId(buildCommands(one.ctx), 'human-train-tank')!.label).toBe('Fabricar Tanque');
    const core = { ...factory, id: 1, kind: 'command_center' as const, name: 'Centro de Mando',
      trains: [{ type: 'builder' as const, name: 'Constructor', cost: { rations: 50, minerals: 0 }, reason: null }] };
    const two = context(humanStats({ selected: core }), { selectedEntity: { entityId: 1, type: 'human_building', position: { x: 0, y: 0 } } });
    expect(byId(buildCommands(two.ctx), 'human-train-builder')!.label).toBe('Entrenar Constructor');
  });

  it('a rival Human building still gets the attack card', () => {
    const { ctx } = context(humanStats(), { selectedEntity: { entityId: 30, type: 'human_building', position: { x: 0, y: 0 } } });
    expect(byId(buildCommands(ctx), 'attack-den')).toBeNull();
    expect(byId(buildCommands(ctx), 'deselect')).not.toBeNull();
  });
});

const NO_BARRACKS = 'Necesitas un Cuartel: selecciona un constructor → Construir → Cuartel';
const NO_FACTORY = 'Necesitas una Fábrica: selecciona un constructor → Construir → Fábrica';

function commandCenter(reasons: { soldier?: string | null; marksman?: string | null; tank?: string | null } = {}) {
  return {
    id: 1,
    kind: 'command_center' as const,
    name: 'Centro de Mando',
    construction: null,
    queue: [],
    progress: 0,
    remaining: 0,
    rally: null,
    trains: [
      { type: 'builder' as const, name: 'Constructor', cost: { rations: 50, minerals: 0 }, reason: null },
      { type: 'soldier' as const, name: 'Soldado', cost: { rations: 70, minerals: 0 }, reason: reasons.soldier ?? null, at: 'barracks' as const },
      { type: 'marksman' as const, name: 'Tirador', cost: { rations: 90, minerals: 25 }, reason: reasons.marksman ?? null, at: 'barracks' as const },
      { type: 'tank' as const, name: 'Tanque', cost: { rations: 200, minerals: 150 }, reason: reasons.tank ?? null, at: 'factory' as const },
    ],
  };
}

describe('recruiting from the Human command center', () => {
  const CORE_SEL = { selectedEntity: { entityId: 1, type: 'human_building' as const, position: { x: 0, y: 0 } } };

  it('shows Entrenar Soldado, Entrenar Tirador and Fabricar Tanque next to Entrenar Constructor, plus Construir Cuartel', () => {
    const { ctx } = context(humanStats({ selected: commandCenter() }), CORE_SEL);
    const slots = buildCommands(ctx);
    expect(byId(slots, 'human-train-builder')!.label).toBe('Entrenar Constructor');
    expect(byId(slots, 'human-train-soldier')!.label).toBe('Entrenar Soldado');
    expect(byId(slots, 'human-train-marksman')!.label).toBe('Entrenar Tirador');
    expect(byId(slots, 'human-train-tank')!.label).toBe('Fabricar Tanque');
    expect(byId(slots, 'human-shortcut-barracks')!.label).toBe('Construir Cuartel');
    // The barracks-made units say where they queue
    expect(byId(slots, 'human-train-soldier')!.description).toMatch(/Cuartel/);
    expect(byId(slots, 'human-train-tank')!.description).toMatch(/Fábrica/);
  });

  it('disables them with the reason when there is no Cuartel or no Fábrica', () => {
    const { ctx } = context(humanStats({ selected: commandCenter({ soldier: NO_BARRACKS, marksman: NO_BARRACKS, tank: NO_FACTORY }) }), CORE_SEL);
    const slots = buildCommands(ctx);
    for (const type of ['soldier', 'marksman']) {
      const button = byId(slots, `human-train-${type}`)!;
      expect(button.disabled).toBe(true);
      expect(button.disabledReason).toBe(NO_BARRACKS);
    }
    const tank = byId(slots, 'human-train-tank')!;
    expect(tank.disabled).toBe(true);
    expect(tank.disabledReason).toMatch(/^Necesitas una Fábrica/);
    // Entrenar Constructor stays available
    expect(byId(slots, 'human-train-builder')!.disabled).toBe(false);
  });

  it('Entrenar Soldado on the command center card asks the run to train a soldier', () => {
    const { ctx, player, notify } = context(humanStats({ selected: commandCenter() }), CORE_SEL);
    byId(buildCommands(ctx), 'human-train-soldier')!.run();
    expect(player.train).toHaveBeenCalledWith('soldier');
    expect(notify).not.toHaveBeenCalledWith(expect.anything(), 'danger');
  });

  it('Construir Cuartel picks a builder and starts the placement ghost', () => {
    const { ctx, player, notify } = context(humanStats({ selected: commandCenter(), minerals: 200 }), CORE_SEL);
    const shortcut = byId(buildCommands(ctx), 'human-shortcut-barracks')!;
    expect(shortcut.disabled).toBeFalsy();
    expect(shortcut.cost).toMatchObject({ amount: 150, resource: 'minerales' });
    shortcut.run();
    expect(player.startBarracksPlacement).toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith(expect.anything(), 'danger');
  });

  it('Construir Cuartel explains itself when it cannot start', () => {
    const { ctx, player, notify } = context(humanStats({ selected: commandCenter(), minerals: 200 }), CORE_SEL);
    player.startBarracksPlacement.mockReturnValue('No hay constructores.');
    byId(buildCommands(ctx), 'human-shortcut-barracks')!.run();
    expect(notify).toHaveBeenCalledWith('No hay constructores.', 'danger');
    const poor = context(humanStats({ selected: commandCenter(), minerals: 40 }), CORE_SEL);
    const button = byId(buildCommands(poor.ctx), 'human-shortcut-barracks')!;
    expect(button.disabled).toBe(true);
    expect(button.disabledReason).toMatch(/minerales/);
  });

  it('a Cuartel card does not grow the command center\'s extras', () => {
    const barracks = { ...commandCenter(), id: 9, kind: 'barracks' as const, name: 'Cuartel',
      trains: [{ type: 'soldier' as const, name: 'Soldado', cost: { rations: 70, minerals: 0 }, reason: null }] };
    const { ctx } = context(humanStats({ selected: barracks }), { selectedEntity: { entityId: 9, type: 'human_building', position: { x: 0, y: 0 } } });
    expect(byId(buildCommands(ctx), 'human-shortcut-barracks')).toBeNull();
  });

  it('with nothing selected, the hint line says where soldiers come from (mouse and touch)', () => {
    expect(HUMAN_RECRUIT_HINT).toBe('Toca el Cuartel o el Centro de mando para entrenar soldados');
    const idle = { human: humanStats(), selectedEntity: null } as GameStats;
    expect(humanIdleHint(idle)).toBe(HUMAN_RECRUIT_HINT);
    // Not while something is selected or a building is being placed
    expect(humanIdleHint({ ...idle, selectedEntity: { entityId: 1, type: 'human_building', position: { x: 0, y: 0 } } } as GameStats)).toBeNull();
    expect(humanIdleHint({ human: humanStats({ selectedUnits: 2 }), selectedEntity: null } as GameStats)).toBeNull();
    expect(humanIdleHint({ selectedEntity: null } as GameStats)).toBeNull();
  });
});
