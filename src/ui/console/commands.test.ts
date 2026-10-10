import { describe, expect, it, vi } from 'vitest';
import type { GameManager, GameStats } from '../../game/GameManager';
import { AntRole, ColonyPriority } from '../../game/components/components';
import { broodKeys, buildCommands, type CommandContext } from './commands';
import type { ColonyDetails } from './useColonyDetails';
import { CARD_SLOTS, cardHotkeys } from './commandCardLayout';

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
  upgrades: [],
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
    openUpgrades: vi.fn(),
    ...overrides,
  };
  return { gm, ctx };
}

describe('surface command card', () => {
  it('fills the card with priorities, retreat, nest, breeding, pause and one speed button', () => {
    const { ctx } = context();
    const ids = buildCommands(ctx).map((c) => c?.id ?? null);
    expect(ids).toHaveLength(CARD_SLOTS);
    expect(ids).toEqual([
      'gather', 'explore', 'defend', 'retreat', 'descend',
      'breed-worker', 'breed-soldier', 'breed-scout', 'breed-nurse', 'breed-defender',
      'pause', 'speed', null, 'defenses-page', 'upgrades',
    ]);
  });

  it('puts Mejoras on the last slot, glowing with the count of upgrades the colony can buy', () => {
    const { ctx } = context();
    const idle = buildCommands(ctx)[14]!;
    expect(idle).toMatchObject({ id: 'upgrades', label: 'Mejoras', glow: false, badge: undefined });
    ctx.stats = { ...ctx.stats, upgradesAffordable: 3 } as GameStats;
    const ready = buildCommands(ctx)[14]!;
    expect(ready).toMatchObject({ glow: true, badge: '3' });
    ready.run();
    expect(ctx.openUpgrades).toHaveBeenCalled();
  });

  it('opens the Defensas page: Espina, Trampa and Muro priced in minerals, each arming its build tool', () => {
    const { ctx } = context();
    buildCommands(ctx)[13]!.run();
    expect(ctx.setPage).toHaveBeenCalledWith('defenses');
    const page = context({ page: 'defenses' });
    page.ctx.stats = { ...page.ctx.stats, mineralsStored: 50 } as GameStats;
    const commands = buildCommands(page.ctx);
    expect(commands.map((c) => c?.id ?? null).slice(0, 3)).toEqual(['build-spine', 'build-trap', 'build-wall']);
    expect(commands[0]).toMatchObject({ label: 'Espina', cost: { amount: 75, resource: 'minerales', short: true } });
    expect(commands[1]).toMatchObject({ label: 'Trampa de resina', cost: { amount: 40, resource: 'minerales', short: false } });
    expect(commands[2]).toMatchObject({ label: 'Muro de quitina', cost: { amount: 30, resource: 'minerales' } });
    expect(commands[14]).toMatchObject({ id: 'back' });
    commands[0]!.run();
    expect(page.ctx.toggleBuildMode).toHaveBeenCalledWith('spine');
    const armed = buildCommands({ ...page.ctx, buildMode: 'wall' });
    expect(armed[2]!.active).toBe(true);
  });

  it('explains the defense tools by touch: a tap previews, a second tap builds', () => {
    const { ctx } = context({ page: 'defenses', touch: true });
    expect(buildCommands(ctx)[0]!.description).toContain('tócala otra vez');
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
    commands[11]!.run();
    expect(gm.setSpeed).toHaveBeenCalledWith(2);
    commands[5]!.run();
    expect(gm.queueBreed).toHaveBeenCalledWith(AntRole.Worker);
  });

  it('marks the current priority active and prices breeding from the pantry', () => {
    const { ctx } = context();
    const commands = buildCommands(ctx);
    expect(commands[0]!.active).toBe(true);
    expect(commands[5]).toMatchObject({ cost: { amount: 20, resource: 'comida', short: false }, disabled: false, badge: '1' });
    expect(commands[6]).toMatchObject({
      cost: { amount: 35, resource: 'comida', short: true },
      disabled: true,
      disabledReason: 'Falta comida en la despensa: hay 30 de 35. Recolecta comida en la superficie.',
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
    expect(ctx.notify).toHaveBeenCalledWith('Falta comida en la despensa: hay 30 de 35. Recolecta comida en la superficie.', 'danger');
  });

  it('marks a full queue on the badge', () => {
    const queue = Array.from({ length: 5 }, () => ({ role: AntRole.Worker, progress: 0 }));
    const { ctx } = context({ details: { ...details, brood: { ...details.brood, queue } } });
    expect(buildCommands(ctx)[5]).toMatchObject({ badge: '5/5', badgeTone: 'warn', disabled: true });
  });
});

describe('den card', () => {
  const selectedEntity = { entityId: 7, type: 'beetle_den', position: { x: 1, y: 1 } };
  const denContext = (availableSoldiers: number) => {
    const { gm, ctx } = context();
    ctx.stats = { ...ctx.stats, selectedEntity, availableSoldiers } as GameStats;
    return { gm, ctx };
  };

  it('puts Atacar guarida on A and Quitar selección on B, the same keys as the unit card', () => {
    const { ctx } = denContext(4);
    const ids = buildCommands(ctx).map((c) => c?.id ?? null);
    expect(ids).toEqual([
      null, null, null, null, null,
      'attack-den', null, null, null, null,
      'pause', 'speed', null, null, 'deselect',
    ]);
    const keys = cardHotkeys();
    expect(keys[ids.indexOf('attack-den')]).toBe('A');
    expect(keys[ids.indexOf('deselect')]).toBe('B');
  });

  it('sends the free soldiers at the den', () => {
    const { gm, ctx } = denContext(4);
    const attack = buildCommands(ctx)[5]!;
    expect(attack.disabled).toBe(false);
    attack.run();
    expect(gm.dispatchAttackWave).toHaveBeenCalledWith(7, 4);
  });

  it('explains how to attack without free soldiers', () => {
    const attack = buildCommands(denContext(0).ctx)[5]!;
    expect(attack.disabled).toBe(true);
    expect(attack.disabledReason).toContain('clic derecho en la guarida');
  });

  it('works for the cricket den too, and never shows on the colony card', () => {
    const { ctx } = context();
    ctx.stats = { ...ctx.stats, selectedEntity: { ...selectedEntity, type: 'cricket_den' }, availableSoldiers: 2 } as GameStats;
    expect(buildCommands(ctx)[5]?.id).toBe('attack-den');
    expect(buildCommands(context().ctx).some((c) => c?.id === 'attack-den')).toBe(false);
  });

  it('the Crystal Hive gets the same card: its attack command sends the free soldiers at it', () => {
    const { gm, ctx } = context();
    ctx.stats = { ...ctx.stats, selectedEntity: { entityId: 12, type: 'crystal_hive', position: { x: 5, y: 5 } }, availableSoldiers: 3 } as GameStats;
    const attack = buildCommands(ctx)[5]!;
    expect(attack.id).toBe('attack-den');
    expect(attack.label).toBe('Atacar colmena');
    expect(attack.disabled).toBe(false);
    attack.run();
    expect(gm.dispatchAttackWave).toHaveBeenCalledWith(12, 3);
  });
});

describe('speed button', () => {
  it('cycles ×1 → ×2 → ×3 → ×1 and shows the current speed on its face', () => {
    for (const [speed, next] of [[1, 2], [2, 3], [3, 1]]) {
      const { gm, ctx } = context();
      ctx.stats = { ...ctx.stats, speed } as GameStats;
      const button = buildCommands(ctx)[11]!;
      expect(button).toMatchObject({ id: 'speed', glyph: `×${speed}`, label: `Velocidad ×${speed}` });
      expect(button.altKeys).toMatch(/^\+ y -/);
      expect(button.description).toContain('La tecla + acelera y la tecla - frena.');
      button.run();
      expect(gm.setSpeed).toHaveBeenCalledWith(next);
    }
  });

  it('lights up only while the game runs faster than normal', () => {
    const { ctx } = context();
    expect(buildCommands(ctx)[11]!.active).toBe(false);
    ctx.stats = { ...ctx.stats, speed: 2 } as GameStats;
    expect(buildCommands(ctx)[11]!.active).toBe(true);
  });
});

describe('nest command card', () => {
  it('the Defensas page is there below too, for the breach tiles', () => {
    const made = context({ page: 'defenses' });
    made.ctx.stats = { ...made.ctx.stats, activeLayer: 'underground' } as GameStats;
    const commands = buildCommands(made.ctx);
    expect(commands[0]).toMatchObject({ id: 'build-spine' });
    expect(commands[0]!.description).toContain('cerca de una entrada');
  });

  function nest(page: 'root' | 'colony' = 'root') {
    const made = context({ page });
    made.ctx.stats = { ...made.ctx.stats, activeLayer: 'underground' } as GameStats;
    return made;
  }

  it('keeps build tools on top, breeding in the middle and puts defense and throne beside the time controls', () => {
    const ids = buildCommands(nest().ctx).map((c) => c?.id ?? null);
    expect(ids).toEqual([
      'dig', 'incubation', 'farm', 'storage', 'ascend',
      'breed-worker', 'breed-soldier', 'breed-scout', 'breed-nurse', 'breed-defender',
      'pause', 'speed', 'defense', 'throne', 'colony-page',
    ]);
  });

  it('arms the defense area and throne tools straight from the root card, on keys C and V', () => {
    const { ctx } = nest();
    const commands = buildCommands(ctx);
    expect(commands[12]).toMatchObject({ id: 'defense', label: 'Área de defensa', icon: 'shield' });
    expect(commands[13]).toMatchObject({ id: 'throne', label: 'Trono', icon: 'crown' });
    expect([cardHotkeys()[12], cardHotkeys()[13]]).toEqual(['C', 'V']);
    commands[12]!.run();
    expect(ctx.toggleBuildMode).toHaveBeenCalledWith('defense');
    commands[13]!.run();
    expect(ctx.toggleBuildMode).toHaveBeenCalledWith('throne');
    commands[0]!.run();
    expect(ctx.toggleBuildMode).toHaveBeenCalledWith('dig');
  });

  it('shows the defense tool as active while it is armed', () => {
    const { ctx } = nest();
    ctx.buildMode = 'defense';
    expect(buildCommands(ctx)[12]!.active).toBe(true);
  });

  it('opens the colony page from the last slot', () => {
    const { ctx } = nest();
    buildCommands(ctx)[14]!.run();
    expect(ctx.setPage).toHaveBeenCalledWith('colony');
  });

  it('keeps garrison, diet and the Mejoras button on the colony page, without the tools now on the root card', () => {
    const { gm, ctx } = nest('colony');
    const commands = buildCommands(ctx);
    expect(commands).toHaveLength(CARD_SLOTS);
    expect(commands.map((c) => c?.id ?? null)).toEqual([
      'garrison-down', 'garrison-up', 'diet-leaf', 'diet-mushroom', 'diet-meat',
      'upgrades', null, null, null, null,
      null, 'defenses-page', null, null, 'back',
    ]);
    commands[1]!.run();
    expect(gm.setGarrisonSize).toHaveBeenCalledWith(3);
    commands[5]!.run();
    expect(ctx.openUpgrades).toHaveBeenCalled();
    commands[3]!.run();
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
