import { describe, expect, it, vi } from 'vitest';
import type { GameManager, GameStats } from '../../game/GameManager';
import { AntRole, ColonyPriority } from '../../game/components/components';
import { broodKeys, buildCommands, type CommandContext } from './commands';
import type { ColonyDetails } from './useColonyDetails';
import { CARD_SLOTS } from './commandCardLayout';

function fakeGame() {
  return {
    setColonyPriority: vi.fn(),
    soundRetreat: vi.fn(),
    togglePause: vi.fn(),
    setSpeed: vi.fn(),
    queueBreed: vi.fn(() => true),
    dispatchAttackWave: vi.fn(() => 3),
    setGarrisonSize: vi.fn(),
    purchaseUpgrade: vi.fn(() => true),
    setConsumptionPriority: vi.fn(),
  };
}

const details: ColonyDetails = {
  food: { total: 30, leaves: 30, mushrooms: 50, meat: 0 },
  queen: null,
  brood: {
    pantry: { stored: 30, capacity: 450, tiles: 9 },
    surfaceStock: 0,
    hasQueen: true,
    queenCanLay: true,
    queue: [{ role: AntRole.Worker, progress: 0 }],
    maxQueuedPerRole: 5,
    eggs: [],
    incubation: { tiles: 6, freeSlots: 24 },
    nurses: 3,
    costs: {
      [AntRole.Worker]: 20,
      [AntRole.Soldier]: 35,
      [AntRole.Scout]: 20,
      [AntRole.Nurse]: 20,
      [AntRole.Defender]: 20,
    },
  },
  farm: { tiles: 2, rate: 0, status: 'sin-hojas', stored: 0, capacity: 0 },
  eatFirst: 'leaf',
  garrison: { target: 2, current: 1 },
  upgrades: [
    { id: 'carry', name: '💪 Obreras fuertes', description: '+25%', level: 0, maxLevel: 3, nextCost: 40 },
    { id: 'damage', name: 'Soldados feroces', description: '+25%', level: 3, maxLevel: 3, nextCost: null },
  ],
  storageTiles: 4,
};

function context(overrides: Partial<CommandContext> = {}) {
  const gm = fakeGame();
  const stats = {
    paused: false,
    speed: 1,
    colonyPriority: ColonyPriority.Gather,
    activeLayer: 'surface',
    availableSoldiers: 0,
    selectedEntity: null,
  } as unknown as GameStats;
  const ctx: CommandContext = {
    gm: gm as unknown as GameManager,
    stats,
    details,
    page: 'root',
    buildMode: null,
    attackCount: 10,
    setPage: vi.fn(),
    toggleBuildMode: vi.fn(),
    switchLayer: vi.fn(),
    refresh: vi.fn(),
    notify: vi.fn(),
    ...overrides,
  };
  return { gm, ctx };
}

describe('surface command card', () => {
  it('fills all 15 slots with priorities, retreat, nest, breeding and time control', () => {
    const { ctx } = context();
    const ids = buildCommands(ctx).map((c) => c?.id ?? null);
    expect(ids).toHaveLength(CARD_SLOTS);
    expect(ids).toEqual([
      'gather', 'explore', 'defend', 'retreat', 'descend',
      'breed-worker', 'breed-soldier', 'breed-scout', 'breed-nurse', 'breed-defender',
      'pause', 'speed-1', 'speed-2', 'speed-3', 'attack-den',
    ]);
  });

  it('maps each button to the existing game action', () => {
    const { gm, ctx } = context();
    const commands = buildCommands(ctx);
    commands[1]!.run();
    expect(gm.setColonyPriority).toHaveBeenCalledWith(ColonyPriority.Explore);
    commands[3]!.run();
    expect(gm.soundRetreat).toHaveBeenCalled();
    commands[4]!.run();
    expect(ctx.switchLayer).toHaveBeenCalledWith('underground');
    commands[10]!.run();
    expect(gm.togglePause).toHaveBeenCalled();
    commands[12]!.run();
    expect(gm.setSpeed).toHaveBeenCalledWith(2);
    commands[5]!.run();
    expect(gm.queueBreed).toHaveBeenCalledWith(AntRole.Worker);
  });

  it('marks the current priority and speed active and prices breeding from the pantry', () => {
    const { ctx } = context();
    const commands = buildCommands(ctx);
    expect(commands[0]!.active).toBe(true);
    expect(commands[11]!.active).toBe(true);
    expect(commands[5]).toMatchObject({ cost: { amount: 20, resource: 'comida', short: false }, disabled: false, badge: '1' });
    expect(commands[6]).toMatchObject({
      cost: { amount: 35, resource: 'comida', short: true },
      disabled: true,
      disabledReason: 'Falta comida en la despensa: hay 30 de 35.',
    });
  });

  it('confirms an ordered egg with its caste and price', () => {
    const { gm, ctx } = context();
    buildCommands(ctx)[5]!.run();
    expect(gm.queueBreed).toHaveBeenCalledWith(AntRole.Worker);
    expect(ctx.notify).toHaveBeenCalledWith('Huevo de obrera encargado (-20 comida)');
  });

  it('says why when the game refuses the egg', () => {
    const { gm, ctx } = context();
    gm.queueBreed.mockReturnValue(false);
    buildCommands(ctx)[6]!.run();
    expect(ctx.notify).toHaveBeenCalledWith('Falta comida en la despensa: hay 30 de 35.', 'danger');
  });

  it('marks a full queue on the badge', () => {
    const queue = Array.from({ length: 5 }, () => ({ role: AntRole.Worker, progress: 0 }));
    const { ctx } = context({ details: { ...details, brood: { ...details.brood, queue } } });
    expect(buildCommands(ctx)[5]).toMatchObject({ badge: '5/5', badgeTone: 'warn', disabled: true });
  });

  it('only enables the den attack with a den selected and soldiers free', () => {
    expect(buildCommands(context().ctx)[14]!.disabled).toBe(true);
    const selectedEntity = { entityId: 7, type: 'beetle_den', position: { x: 1, y: 1 } };
    const { gm, ctx } = context();
    ctx.stats = { ...ctx.stats, selectedEntity, availableSoldiers: 4 } as GameStats;
    const attack = buildCommands(ctx)[14]!;
    expect(attack.disabled).toBe(false);
    attack.run();
    expect(gm.dispatchAttackWave).toHaveBeenCalledWith(7, 4);
  });
});

describe('nest command card', () => {
  it('swaps the first row for build tools and the last slot for the colony page', () => {
    const { ctx } = context();
    ctx.stats = { ...ctx.stats, activeLayer: 'underground' } as GameStats;
    const commands = buildCommands(ctx);
    expect(commands.slice(0, 5).map((c) => c?.id)).toEqual(['dig', 'incubation', 'farm', 'storage', 'ascend']);
    expect(commands[14]!.id).toBe('colony-page');
    commands[0]!.run();
    expect(ctx.toggleBuildMode).toHaveBeenCalledWith('dig');
    commands[14]!.run();
    expect(ctx.setPage).toHaveBeenCalledWith('colony');
  });

  it('puts throne, defense, garrison, upgrades and diet on the colony page', () => {
    const { gm, ctx } = context({ page: 'colony' });
    ctx.stats = { ...ctx.stats, activeLayer: 'underground' } as GameStats;
    const commands = buildCommands(ctx);
    expect(commands).toHaveLength(CARD_SLOTS);
    expect(commands[0]!.id).toBe('throne');
    expect(commands[1]!.id).toBe('defense');
    commands[3]!.run();
    expect(gm.setGarrisonSize).toHaveBeenCalledWith(3);
    expect(commands[5]).toMatchObject({ id: 'upgrade-carry', label: 'Obreras fuertes', disabled: false });
    expect(commands[6]).toMatchObject({ id: 'upgrade-damage', disabled: true });
    expect(commands.slice(11, 14).map((c) => c?.id)).toEqual(['diet-leaf', 'diet-mushroom', 'diet-meat']);
    commands[12]!.run();
    expect(gm.setConsumptionPriority).toHaveBeenCalledWith('mushroom');
    commands[14]!.run();
    expect(ctx.setPage).toHaveBeenCalledWith('root');
  });
});

describe('brood hint keys', () => {
  it('quotes the real hotkeys of the breed row and the nest tools', () => {
    expect(broodKeys()).toEqual({ breed: ['A', 'S', 'D', 'F', 'G'], incubation: 'W', storage: 'U' });
  });
});
