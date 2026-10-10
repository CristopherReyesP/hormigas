import { describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import { AntRole, COMPONENT, type EggComponent, type EggQueueComponent, type HealthComponent } from '../components/components';
import { createAnt, createEgg } from '../entities/factories';
import { ChamberType } from '../../simulation/world/types';
import { MAX_EGGS_PER_INCUBATION_TILE, QUEEN_EGG_LAY_TIME, QUEEN_MAX_HEALTH } from '../../shared/constants';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';

// Real manager and simulation; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

function manager() {
  const game = new GameManager(fakeCanvas());
  finishIntro(game);
  return game;
}

/** Fill the pantry and the mineral bank so price is never the question */
function fund(game: GameManager, food = 2000, minerals = 500) {
  const grid = game.getUndergroundGrid();
  for (const t of grid.getPantryTiles()) grid.depositFood(t.x, t.y, 'leaf', food);
  game['world'].minerals.deposit(minerals);
}

function incubationTile(game: GameManager): { x: number; y: number } {
  const grid = game.getUndergroundGrid();
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const tile = grid.getTile(x, y);
      if (tile?.walkable && tile.chamberType === ChamberType.Incubation) return { x, y };
    }
  }
  throw new Error('no incubation tile');
}

describe('Mejoras with the real GameManager', () => {
  it('pays with pantry food and minerals, and refuses when short', () => {
    const game = manager();
    const world = game['world'];
    const before = game.getColonyFood().total;
    expect(before).toBeGreaterThanOrEqual(40); // a new colony can afford a first level
    expect(game.purchaseUpgrade('queenLay')).toBe(true); // 40 food, no minerals
    expect(game.getColonyFood().total).toBe(before - 40);
    expect(game.getUpgradeLevels().queenLay).toBe(1);

    // Level 2 needs 15 minerals: the bank is empty
    expect(world.minerals.stored).toBe(0);
    const food = game.getColonyFood().total;
    expect(game.purchaseUpgrade('queenLay')).toBe(false);
    expect(game.getColonyFood().total).toBe(food);
    expect(game.getUpgradeLevels().queenLay).toBe(1);

    world.minerals.deposit(20);
    fund(game, 200, 0);
    expect(game.purchaseUpgrade('queenLay')).toBe(true);
    expect(world.minerals.stored).toBe(5);
  });

  it('makes the queen lay faster, even the eggs already ordered', () => {
    const game = manager();
    fund(game);
    expect(game.queueBreed(AntRole.Worker)).toBe(true);
    const queenId = game['world'].query(COMPONENT.EGG_QUEUE)[0];
    const queue = game['world'].getComponent<EggQueueComponent>(queenId, COMPONENT.EGG_QUEUE)!;
    expect(queue.queue[0].layTimerTotal).toBe(QUEEN_EGG_LAY_TIME);

    expect(game.purchaseUpgrade('queenLay')).toBe(true);
    expect(queue.queue[0].layTimerTotal).toBe(2.6);
    expect(game.queueBreed(AntRole.Worker)).toBe(true);
    expect(queue.queue[1].layTimerTotal).toBe(2.6);
    expect(game.getColonyStatsReport().queen?.layTime).toBe(2.6);
  });

  it('upgrades the queen: queue, health and the crown tier', () => {
    const game = manager();
    fund(game);
    expect(game.getBroodSnapshot().maxQueuedPerRole).toBe(5);
    expect(game.purchaseUpgrade('queenQueue')).toBe(true);
    expect(game.purchaseUpgrade('queenHp')).toBe(true);
    game['update'](1 / 30);
    expect(game.getBroodSnapshot().maxQueuedPerRole).toBe(7);
    expect(game.getQueenStats()?.maxHealth).toBe(QUEEN_MAX_HEALTH + 150);
    expect(game.getQueenTier()).toBe(1);
  });

  it('speeds up incubation and fits more eggs per tile', () => {
    const game = manager();
    fund(game);
    const world = game['world'];
    const tile = incubationTile(game);
    const tiles = game.getBroodSnapshot().incubation.tiles;
    const freeBefore = game.getBroodSnapshot().incubation.freeSlots;
    expect(freeBefore).toBe(tiles * MAX_EGGS_PER_INCUBATION_TILE);

    const slow = createEgg(world, tile.x + 0.5, tile.y + 0.5, AntRole.Worker, 20);
    game['update'](1);
    const slowLeft = world.getComponent<EggComponent>(slow, COMPONENT.EGG)!.hatchTimer;

    expect(game.purchaseUpgrade('incubation')).toBe(true);
    expect(game.getBroodSnapshot().incubation.freeSlots).toBe(tiles * (MAX_EGGS_PER_INCUBATION_TILE + 1) - 1);
    game['update'](1);
    const fastLeft = world.getComponent<EggComponent>(slow, COMPONENT.EGG)!.hatchTimer;
    expect(slowLeft - fastLeft).toBeCloseTo(1.25, 1); // grows 25% faster, the egg already laid too
    expect(game.getColonyStatsReport().brood).toMatchObject({ hatchTimeWorker: 16, eggsPerTile: 5 });
  });

  it('applies caste upgrades to living ants and newborns, and shows the bonus on the ant card', () => {
    const game = manager();
    fund(game);
    const world = game['world'];
    const soldier = createAnt(world, 30, 30, AntRole.Soldier);
    expect(game.purchaseUpgrade('damage')).toBe(true);
    expect(world.getComponent<HealthComponent>(soldier, COMPONENT.HEALTH)!.damage).toBe(10);
    const newborn = createAnt(world, 30, 30, AntRole.Soldier);
    expect(world.getComponent<HealthComponent>(newborn, COMPONENT.HEALTH)!.damage).toBe(10);

    game.selectOnly(soldier);
    const card = game.getSelectedEntity();
    expect(card?.antStats?.find((l) => l.label === 'Daño')).toEqual({ label: 'Daño', value: 10, bonus: 2 });
  });

  it('cheapens eggs with Nutrición de larvas', () => {
    const game = manager();
    fund(game);
    expect(game.getBreedCost(AntRole.Worker)).toBe(20);
    expect(game.purchaseUpgrade('nutrition')).toBe(true);
    expect(game.getBreedCost(AntRole.Worker)).toBe(18);
    expect(game.getBroodSnapshot().costs[AntRole.Worker]).toBe(18);
  });

  it('publishes the affordable count for the Mejoras badge', () => {
    const game = manager();
    const grid = game.getUndergroundGrid();
    grid.drainFood(grid.getPantryStored().total);
    expect(game.getStats().upgradesAffordable).toBe(0);
    fund(game);
    expect(game.getStats().upgradesAffordable).toBeGreaterThan(10);
  });

  it('keeps the levels as plain data a save can round-trip', () => {
    const game = manager();
    fund(game);
    game.purchaseUpgrade('incubation');
    game.purchaseUpgrade('legs');
    const saved = JSON.parse(JSON.stringify(game.getUpgradeLevels()));

    const loaded = manager();
    const soldier = createAnt(loaded['world'], 30, 30, AntRole.Soldier);
    loaded.setUpgradeLevels(saved);
    expect(loaded.getUpgradeLevels()).toEqual(saved);
    expect(loaded.getColonyStatsReport().brood.eggsPerTile).toBe(5);
    expect(loaded.getSelectedEntity()).toBeNull();
    loaded.selectOnly(soldier);
    expect(loaded.getSelectedEntity()?.antStats?.find((l) => l.label === 'Velocidad')?.bonus).toBeGreaterThan(0);
  });

  it('reports colony and run stats for the Estadísticas tab', () => {
    const game = manager();
    game['update'](1);
    const report = game.getColonyStatsReport();
    expect(report.population).toBe(game.getStats().antCount);
    expect(report.castes.find((r) => r.role === AntRole.Worker)?.count).toBe(game.getStats().workerCount);
    expect(report.queen?.eggsPerMinute).toBe(20);
    expect(report.run).toMatchObject({ day: 1, nightsSurvived: 0, enemiesDefeated: 0 });
  });
});
