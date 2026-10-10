import { describe, expect, it, vi } from 'vitest';
import type { GameManager, GameStats, SelectedGroupInfo } from '../../game/GameManager';
import { AntRole, ColonyPriority } from '../../game/components/components';
import { buildCommands, commandTargetHint, type CommandContext } from './commands';
import type { ColonyDetails } from './useColonyDetails';
import { cardHotkeys } from './commandCardLayout';

const details = {
  food: { total: 0, leaves: 0, mushrooms: 0, meat: 0 },
  queen: null,
  brood: {
    pantry: { stored: 0, capacity: 0, tiles: 0 },
    surfaceStock: 0,
    hasQueen: true,
    queenCanLay: true,
    queue: [],
    maxQueuedPerRole: 5,
    eggs: [],
    incubation: { tiles: 0, freeSlots: 0 },
    nurses: 0,
    costs: { worker: 20, soldier: 35, scout: 20, nurse: 20, defender: 20 },
  },
  farm: { tiles: 0, rate: 0, status: 'sin-tiles', stored: 0, capacity: 0 },
  eatFirst: 'leaf',
  garrison: { target: 0, current: 0 },
  upgrades: [],
  storageTiles: 0,
} as unknown as ColonyDetails;

const GROUP: SelectedGroupInfo = {
  count: 3,
  byRole: { [AntRole.Soldier]: 2, [AntRole.Worker]: 1 },
  ordered: 0,
  units: [],
};

function context(stats: Partial<GameStats>) {
  const gm = {
    armMoveTarget: vi.fn(),
    armAttackTarget: vi.fn(),
    holdSelectedAnts: vi.fn(() => 2),
    stopSelectedAnts: vi.fn(() => 2),
    clearSelection: vi.fn(),
    togglePause: vi.fn(),
    setSpeed: vi.fn(),
    cancelCommandTarget: vi.fn(),
    setAreaSelect: vi.fn(),
    bindControlGroup: vi.fn(() => true),
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
      ...stats,
    } as GameStats,
    details,
    page: 'root',
    buildMode: null,
    attackCount: 10,
    setPage: vi.fn(),
    toggleBuildMode: vi.fn(),
    switchLayer: vi.fn(),
    refresh: vi.fn(),
    notify: vi.fn(),
  };
  return { gm, ctx };
}

const ids = (ctx: CommandContext) => buildCommands(ctx).map((c) => c?.id ?? null);

describe('unit command card', () => {
  it('a selected group gets Mover, Atacar, Detener, Mantener posición and the time controls', () => {
    const { ctx } = context({ selectedGroup: GROUP });
    const slots = ids(ctx);
    expect(slots).toEqual([
      'move', null, null, null, null,
      'attack', 'stop', 'hold', null, null,
      'pause', 'speed', null, null, 'deselect',
    ]);
    const keyOf = (id: string) => cardHotkeys()[slots.indexOf(id)];
    expect([keyOf('move'), keyOf('attack'), keyOf('stop'), keyOf('hold')]).toEqual(['Q', 'A', 'S', 'D']);
  });

  it('Atacar arms an attack target; Mantener posición holds the group', () => {
    const { gm, ctx } = context({ selectedGroup: GROUP });
    const commands = buildCommands(ctx);
    const attack = commands[5]!;
    expect(attack).toMatchObject({ label: 'Atacar', tone: 'danger' });
    expect(attack.description).toMatch(/enemigo/);
    attack.run();
    expect(gm.armAttackTarget).toHaveBeenCalled();

    const hold = commands[7]!;
    expect(hold.label).toBe('Mantener posición');
    expect(hold.description).toMatch(/a su alcance/);
    hold.run();
    expect(gm.holdSelectedAnts).toHaveBeenCalled();
    expect(ctx.notify).toHaveBeenCalledWith('2 hormigas mantienen su posición');
  });

  it('marks Atacar active while it waits for its click, and hints both clicks', () => {
    const { ctx } = context({ selectedGroup: GROUP, commandTarget: 'attack' });
    const commands = buildCommands(ctx);
    expect(commands[5]!.active).toBe(true);
    expect(commands[0]!.active).toBe(false);
    expect(commandTargetHint('attack')).toMatch(/^ATACAR: .*en un enemigo.*en el suelo.*Esc cancela$/);
  });

  it('Mover explains the right click and arms a target; Detener stops the group', () => {
    const { gm, ctx } = context({ selectedGroup: GROUP });
    const [move] = buildCommands(ctx);
    expect(move!.label).toBe('Mover');
    expect(move!.description).toMatch(/clic derecho/i);
    move!.run();
    expect(gm.armMoveTarget).toHaveBeenCalled();

    const stop = buildCommands(ctx)[6]!;
    expect(stop.label).toBe('Detener');
    stop.run();
    expect(gm.stopSelectedAnts).toHaveBeenCalled();
    expect(ctx.notify).toHaveBeenCalledWith('2 hormigas se detienen');

    buildCommands(ctx)[14]!.run();
    expect(gm.clearSelection).toHaveBeenCalled();
  });

  it('marks Mover active while it waits for its target, and hints how to finish', () => {
    const { ctx } = context({ selectedGroup: GROUP, commandTarget: 'move' });
    expect(buildCommands(ctx)[0]!.active).toBe(true);
    expect(commandTargetHint('move')).toMatch(/MOVER/);
    expect(commandTargetHint(null)).toBeNull();
  });

  it('one selected ant gets the unit card too', () => {
    const { ctx } = context({
      selectedEntity: { entityId: 4, type: 'ant', position: { x: 1, y: 1 }, role: AntRole.Worker },
    });
    expect(ids(ctx)[0]).toBe('move');
  });

  it('nothing selected, or one food pile, keeps the colony card', () => {
    expect(ids(context({}).ctx)[0]).toBe('gather');
    const food = context({ selectedEntity: { entityId: 9, type: 'food', position: { x: 2, y: 2 }, foodType: 'leaf', foodAmount: 30 } });
    expect(ids(food.ctx)[0]).toBe('gather');
  });

  it('ants selected below keep the nest card: orders run on the surface only', () => {
    const { ctx } = context({ selectedGroup: GROUP, activeLayer: 'underground' });
    expect(ids(ctx)[0]).toBe('dig');
  });
});

describe('the card on a touch screen', () => {
  const touch = (stats: Partial<GameStats>, extra: Partial<CommandContext> = {}) => {
    const made = context(stats);
    Object.assign(made.ctx, { touch: true, ...extra });
    return made;
  };

  it('adds Seleccionar área and Asignar grupo to the unit card, and Seleccionar área to the colony card', () => {
    expect(ids(touch({ selectedGroup: GROUP }).ctx)).toEqual([
      'move', null, null, null, 'groups-page',
      'attack', 'stop', 'hold', null, null,
      'pause', 'speed', 'area-select', null, 'deselect',
    ]);
    expect(ids(touch({}).ctx)[12]).toBe('area-select');
    // The desktop card is unchanged
    expect(ids(context({}).ctx)[12]).toBeNull();
  });

  it('Seleccionar área toggles the box drag', () => {
    const { gm, ctx } = touch({ selectedGroup: GROUP });
    buildCommands(ctx)[12]!.run();
    expect(gm.setAreaSelect).toHaveBeenCalledWith(true);
    const on = touch({ selectedGroup: GROUP, areaSelect: true });
    expect(buildCommands(on.ctx)[12]!.active).toBe(true);
    buildCommands(on.ctx)[12]!.run();
    expect(on.gm.setAreaSelect).toHaveBeenCalledWith(false);
  });

  it('pressing the armed Atacar again cancels it (there is no Esc), and the hints talk of tapping', () => {
    const { gm, ctx } = touch({ selectedGroup: GROUP, commandTarget: 'attack' });
    buildCommands(ctx)[5]!.run();
    expect(gm.cancelCommandTarget).toHaveBeenCalled();
    expect(gm.armAttackTarget).not.toHaveBeenCalled();
    expect(commandTargetHint('attack', true)).toMatch(/^ATACAR: toca/);
    expect(commandTargetHint('attack', true)).not.toMatch(/clic|Esc/);
    // With a mouse, Atacar re-arms as before
    const desk = context({ selectedGroup: GROUP, commandTarget: 'attack' });
    buildCommands(desk.ctx)[5]!.run();
    expect(desk.gm.armAttackTarget).toHaveBeenCalled();
  });

  it('the groups page binds the selection to a digit, or adds to it with Añadir on (Ctrl/Shift+digit)', () => {
    const { gm, ctx } = touch({ selectedGroup: GROUP, controlGroups: [{ slot: 2, count: 5, role: AntRole.Soldier, selected: false }] }, { page: 'groups' });
    const slots = buildCommands(ctx);
    expect(slots[1]).toMatchObject({ id: 'bind-group-2', badge: '5', altKeys: 'Ctrl+2' });
    slots[2]!.run();
    expect(gm.bindControlGroup).toHaveBeenCalledWith(3, false);
    expect(ctx.setPage).toHaveBeenCalledWith('root');

    const adding = touch({ selectedGroup: GROUP }, { page: 'groups', groupAdd: true });
    buildCommands(adding.ctx)[0]!.run();
    expect(adding.gm.bindControlGroup).toHaveBeenCalledWith(1, true);
  });
});
