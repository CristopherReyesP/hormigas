import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';

// Real manager and cameras; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', () => ({ InputManager: class {
  setCamera() {} onKeyAction() {} onCanvasClick() {} destroy() {}
} }));
vi.mock('../systems/RenderSystem', () => ({ RenderSystem: class {
  setCamera() {} setUndergroundContext() {} setDayPhaseProvider() {} setCreep() {}
  setFarmStatusProvider() {} setFarmFocusProvider() {} queueFarmHarvest() {} setWaveOverlayProvider() {} setDigOverlayProvider() {} invalidateTerrain() {} renderInterpolated() {}
  startMeteorIntro() {} skipIntro() { return true; }
} }));
vi.stubGlobal('window', new EventTarget());

const games: GameManager[] = [];
function setup() {
  const canvas = Object.assign(new EventTarget(), { width: 0, height: 0, getContext: () => ({}) });
  const game = new GameManager(canvas as unknown as HTMLCanvasElement);
  games.push(game);
  return { game, canvas };
}

/** The window as GameCanvas reports it: buffer size, then the band between the HUD bars. */
function layout(game: GameManager, cssW: number, cssH: number, ratio: number, defaultZoom: number) {
  game.resizeCanvas(cssW * ratio, cssH * ratio, ratio);
  game.setViewport({ x: 0, y: 30 * ratio, w: cssW * ratio, h: (cssH - 170) * ratio }, defaultZoom);
}

afterEach(() => {
  for (const game of games.splice(0)) game.stop();
});

describe('real window-size canvas', () => {
  it('resizes the canvas buffer and both cameras to the window', () => {
    const { game, canvas } = setup();
    game.resizeCanvas(3200, 1800, 2);
    expect([canvas.width, canvas.height]).toEqual([3200, 1800]);
    expect(game['camera'].getCanvasSize()).toEqual({ width: 3200, height: 1800 });
    expect(game['undergroundCamera'].getCanvasSize()).toEqual({ width: 3200, height: 1800 });
  });

  it('shows the same minimap box for the same window at DPR 1 and DPR 2', () => {
    const one = setup().game;
    layout(one, 1600, 900, 1, 1);
    const two = setup().game;
    layout(two, 1600, 900, 2, 2);
    expect(two.getSurfaceView()).toEqual(one.getSurfaceView());
    expect(one.getSurfaceView().w).toBeCloseTo(50);
  });

  it('applies the default zoom on the first layout only, but keeps Home/R in step with the window', () => {
    const { game } = setup();
    layout(game, 1600, 900, 1, 1);
    expect(game['camera'].getZoom()).toBe(1);
    game['camera'].zoomAt(800, 450, -100);
    expect(game['camera'].getZoom()).toBe(1.5);
    layout(game, 2560, 1440, 1, 1.5);
    layout(game, 1600, 900, 1, 1);
    layout(game, 2560, 1440, 1, 1.5);
    expect(game['camera'].getZoom()).toBe(1.5);
    game['camera'].zoomAt(800, 450, -100);
    game['camera'].reset();
    expect(game['camera'].getZoom()).toBe(1.5);
  });
});
