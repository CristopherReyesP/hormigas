import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameManager, GameStats, SelectedEntityInfo } from '../../game/GameManager';
import { AntRole, ColonyPriority } from '../../game/components/components';
import { InfoPanel } from './InfoPanel';
import { infoSummary } from './infoSummary';
import { TopStrip } from './TopStrip';
import { buildCommands, commandTargetHint, type CommandContext } from './commands';
import type { ColonyDetails } from './useColonyDetails';

const DETAILS = {
  food: { total: 0, leaves: 0, mushrooms: 0, meat: 0 },
  queen: null,
  brood: {
    pantry: { stored: 0, capacity: 450, tiles: 9 }, surfaceStock: 0, hasQueen: true, queenCanLay: true, queue: [],
    maxQueuedPerRole: 5, eggs: [], incubation: { tiles: 6, freeSlots: 24 }, nurses: 3,
    costs: { [AntRole.Worker]: 20, [AntRole.Soldier]: 35, [AntRole.Scout]: 25, [AntRole.Nurse]: 15, [AntRole.Defender]: 30 },
  },
  farm: { tiles: 0, rate: 0, status: 'sin-tiles', stored: 0, capacity: 0 },
  eatFirst: 'leaf',
  garrison: { target: 2, current: 1 },
  upgrades: [],
  storageTiles: 9,
} as unknown as ColonyDetails;

const STATS = {
  antCount: 13, workerCount: 10, soldierCount: 0, scoutCount: 0, nurseCount: 3, defenderCount: 0,
  foodStored: 34, mushroomStored: 0, meatStored: 0, pantryStored: 0, pantryCapacity: 450, mineralsStored: 120,
  beetleCount: 0, beetleDenCount: 0, cricketCount: 0, cricketDenCount: 0,
  activeLayer: 'surface', paused: false, speed: 1, colonyPriority: ColonyPriority.Gather, availableSoldiers: 0,
  dayPhase: 'day', dayNumber: 1, phaseRemaining: 90, activeEvents: [],
  miners: { count: 3, target: 2, auto: true, ordered: 1 },
  selectedEntity: null,
  invasion: { waveNumber: 0, nextWaveIn: 120, active: false, invadersAlive: 0, armed: false },
} as unknown as GameStats;

const NODE: SelectedEntityInfo = { entityId: 7, type: 'mineral', position: { x: 70, y: 40 }, mineralAmount: 180, mineralMax: 250, workers: 3 };
const LEAF: SelectedEntityInfo = { entityId: 8, type: 'food', position: { x: 50, y: 40 }, foodType: 'leaf', foodAmount: 80, foodMax: 100, workers: 2 };

function info(sel: SelectedEntityInfo): string {
  const stats = { ...STATS, selectedEntity: sel } as GameStats;
  return renderToStaticMarkup(<InfoPanel stats={stats} details={DETAILS} gameManager={null} attackCount={10} onAttackCountChange={() => {}} />);
}

function context(stats: Partial<GameStats>, overrides: Partial<CommandContext> = {}) {
  const gm = { setMinerTarget: vi.fn(), armGatherTarget: vi.fn(), armMineTarget: vi.fn(), cancelCommandTarget: vi.fn(), clearSelection: vi.fn(), togglePause: vi.fn(), setSpeed: vi.fn() };
  const ctx: CommandContext = {
    gm: gm as unknown as GameManager,
    stats: { ...STATS, ...stats } as GameStats,
    details: DETAILS,
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

describe('resource cards', () => {
  it('a mineral node card: ore left of its total and the workers mining it', () => {
    const html = info(NODE);
    expect(html).toContain('Cristal mineral · 180/250');
    expect(html).toContain('3 obreras minando');
    expect(infoSummary({ ...STATS, selectedEntity: NODE } as GameStats, DETAILS)).toBe('CRISTAL MINERAL · 180/250');
  });

  it('a food card: type, what is left and the ants gathering it', () => {
    const html = info(LEAF);
    expect(html).toContain('Hoja · 80/100');
    expect(html).toContain('2 obreras recolectando');
    expect(info({ ...LEAF, workers: 0 })).toContain('Nadie la recolecta');
    expect(info({ ...LEAF, workers: 1 })).toContain('1 obrera recolectando');
  });
});

describe('resource commands', () => {
  it('the unit card has Recolectar and Minar, two-step orders like Atacar', () => {
    const sel = { ...STATS, selectedEntity: { entityId: 1, type: 'ant', position: { x: 0, y: 0 }, role: AntRole.Worker } } as Partial<GameStats>;
    const { gm, ctx } = context(sel);
    const card = buildCommands(ctx);
    const gather = card.find((c) => c?.id === 'gather-order')!;
    const mine = card.find((c) => c?.id === 'mine-order')!;
    expect(gather.label).toBe('Recolectar');
    expect(mine.label).toBe('Minar');
    gather.run();
    expect(gm.armGatherTarget).toHaveBeenCalled();
    mine.run();
    expect(gm.armMineTarget).toHaveBeenCalled();
    const armed = buildCommands(context({ ...sel, commandTarget: 'mine' }).ctx);
    expect(armed.find((c) => c?.id === 'mine-order')!.active).toBe(true);
    expect(commandTargetHint('gather', true)).toContain('toca una fuente de comida');
    expect(commandTargetHint('mine')).toContain('yacimiento');
  });

  it('a selected node shows the miner target with big +/− buttons', () => {
    const { gm, ctx } = context({ selectedEntity: NODE });
    const card = buildCommands(ctx);
    const down = card.find((c) => c?.id === 'miners-down')!;
    const up = card.find((c) => c?.id === 'miners-up')!;
    expect(up.label).toBe('Más mineras');
    expect(up.badge).toBe('2');
    expect(up.description).toContain('Mineras: 2');
    up.run();
    expect(gm.setMinerTarget).toHaveBeenCalledWith(3);
    down.run();
    expect(gm.setMinerTarget).toHaveBeenCalledWith(1);
    const zero = buildCommands(context({ selectedEntity: NODE, miners: { count: 0, target: 0, auto: false, ordered: 0 } } as Partial<GameStats>).ctx);
    expect(zero.find((c) => c?.id === 'miners-down')!.disabled).toBe(true);
  });

  it('the colony page also has the miner target', () => {
    const { gm, ctx } = context({ activeLayer: 'underground' }, { page: 'colony' });
    const card = buildCommands(ctx);
    card.find((c) => c?.id === 'miners-up')!.run();
    expect(gm.setMinerTarget).toHaveBeenCalledWith(3);
  });
});

describe('minerals in the top strip', () => {
  it('names the miners next to the stock', () => {
    const html = renderToStaticMarkup(<TopStrip stats={STATS} />);
    expect(html).toContain('Minerales 120 · 3 mineras');
    expect(html).toMatch(/strip-minerals[\s\S]*3<\/span>/);
  });
});
