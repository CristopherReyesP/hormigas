import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import type { Camera } from '../../engine/camera/Camera';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { UndergroundTerrainType } from '../../simulation/world/types';
import type { ExcavationSystem } from '../systems/ExcavationSystem';
import { TILE_SIZE, UNDERGROUND_HEIGHT, UNDERGROUND_WIDTH } from '../../shared/constants';
import { DigTileClass, digLimitMessage } from '../dig/digStatus';
import { fakeCanvas, finishIntro, CRYSTAL_RIVAL_SETUP } from '../../test/gameManagerMocks';

// Real manager and map; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

afterEach(() => vi.restoreAllMocks());

function setup() {
  const game = new GameManager(fakeCanvas(), CRYSTAL_RIVAL_SETUP);
  finishIntro(game);
  game.enterUnderground();
  game.setDigMode(true);
  const world = game['world'] as World;
  const ug = game['undergroundGrid'] as UndergroundGrid;
  const excavation = game['excavationSystem'] as ExcavationSystem;
  const cam = game['undergroundCamera'] as Camera;
  return { game, world, ug, excavation, cam };
}

/** A straight run of `n` plain earth tiles below the entrance row */
function earthRow(ug: UndergroundGrid, n: number): { x: number; y: number } {
  for (let y = 3; y < UNDERGROUND_HEIGHT - 2; y++) {
    for (let x = 2; x + n < UNDERGROUND_WIDTH - 2; x++) {
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        const t = ug.getTile(x + i, y)!;
        if (t.terrain !== UndergroundTerrainType.Earth || t.designated) ok = false;
      }
      if (ok) return { x, y };
    }
  }
  throw new Error('no earth row');
}

const limitShown = (world: World, cap = 20) =>
  world.notifications.filter((n) => n.message.includes(digLimitMessage(cap))).length;

describe('dig limit with the real GameManager', () => {
  it('marking 25 tiles accepts 20 and tells the player why the rest were refused', () => {
    const { game, world, ug, excavation } = setup();
    const row = earthRow(ug, 25);
    let accepted = 0;
    for (let i = 0; i < 25; i++) if (game.designateDig(row.x + i, row.y)) accepted++;

    expect(accepted).toBe(20);
    expect(excavation.getPendingJobCount()).toBe(20);
    expect(limitShown(world)).toBe(1); // once, not once per refused tile
    const dig = game.getStats().dig!;
    expect(dig).toMatchObject({ pending: 20, cap: 20, level: 'full' });
    game.stop();
  });

  it('a finger stroke past the limit previews the extra tiles as over the limit', () => {
    const { game, world, ug, cam } = setup();
    const row = earthRow(ug, 25);
    const screenOfTile = (x: number, y: number) => cam.worldToScreen((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
    const a = screenOfTile(row.x, row.y);
    const b = screenOfTile(row.x + 24, row.y);
    game['paintAt'](a.x, a.y, 'start');
    game['paintAt'](b.x, b.y, 'move');

    const overlay = game.getDigOverlay()!;
    const preview = overlay.preview;
    expect(preview.filter((p) => p.state === 'ok')).toHaveLength(20);
    expect(preview.filter((p) => p.state === 'over')).toHaveLength(5);
    expect(preview.find((p) => p.state === 'over')).toMatchObject({ x: row.x + 20, y: row.y });
    expect(limitShown(world)).toBe(1);
    game['paintAt'](b.x, b.y, 'end');
    game.stop();
  });

  it("each level of the 'dig' upgrade makes room for 5 more marks", () => {
    const { game, ug, excavation } = setup();
    game['upgradeLevels'].dig = 1;
    expect(game.getDigCap()).toBe(25);
    const row = earthRow(ug, 30);
    let accepted = 0;
    for (let i = 0; i < 30; i++) if (game.designateDig(row.x + i, row.y)) accepted++;
    expect(accepted).toBe(25);
    expect(excavation.getPendingJobCount()).toBe(25);
    game.stop();
  });

  it('the overlay exists only while the dig tool is on below, and its class map is cached', () => {
    const { game, ug } = setup();
    const first = game.getDigOverlay()!;
    expect(first.classes[Math.floor(UNDERGROUND_HEIGHT / 2) * UNDERGROUND_WIDTH]).toBe(DigTileClass.Border);
    // Same grid → same map, not a fresh scan per frame
    expect(game.getDigOverlay()!.classes).toBe(first.classes);

    const row = earthRow(ug, 1);
    game.designateDig(row.x, row.y);
    const overlay = game.getDigOverlay()!;
    expect(overlay.jobs).toEqual([{ x: row.x, y: row.y, order: 1, progress: null }]);

    // Opening a tile changes the layout: the map is rebuilt
    ug.excavate(row.x, row.y);
    const rebuilt = game.getDigOverlay()!;
    expect(rebuilt.classes).not.toBe(first.classes);
    expect(rebuilt.classes[row.y * UNDERGROUND_WIDTH + row.x]).toBe(DigTileClass.Open);

    game.setDigMode(false);
    expect(game.getDigOverlay()).toBeNull();
    game.setDigMode(true);
    game.exitUnderground();
    expect(game.getDigOverlay()).toBeNull();
    game.stop();
  });

  it('the stats report the crew and an estimate once workers take the jobs', () => {
    const { game, ug } = setup();
    const row = earthRow(ug, 4);
    for (let i = 0; i < 4; i++) game.designateDig(row.x + i, row.y);
    const dig = game.getStats().dig!;
    expect(dig.pending).toBe(4);
    expect(dig.cap).toBe(20);
    expect(dig.secondsPerTile).toBeGreaterThan(0);
    expect(dig.diggers).toBeGreaterThanOrEqual(0);
    if (dig.diggers === 0) expect(dig.etaSeconds).toBeNull();
    else expect(dig.etaSeconds).toBeGreaterThan(0);
    game.stop();
  });
});
