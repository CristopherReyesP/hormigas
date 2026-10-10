import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager, type GameStats } from '../GameManager';
import { INTRO_TIMELINE as T, type IntroClock } from './introTimeline';
import { fakeCanvas } from '../../test/gameManagerMocks';

// Real manager, camera and intro director; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
/** What the GameManager handed the (fake) render system's MeteorIntro */
const art: { clock: IntroClock | null; skips: number } = { clock: null, skips: 0 };
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem({
  startMeteorIntro(_impact: unknown, _nest: unknown, clock: IntroClock) { art.clock = clock; },
  skipIntro() { art.skips++; return true; },
}));
// The intro-skip listeners hang off window and the canvas; node has neither.
vi.stubGlobal('window', new EventTarget());

const FRAME = 1 / 60;
/** Thirty seconds of 60 fps frames: a frame loop that runs past this is broken, not slow. */
const MAX_FRAMES = 60 * 30;
const games: GameManager[] = [];

function setup() {
  art.skips = 0;
  const game = new GameManager(fakeCanvas());
  games.push(game);
  const published: GameStats[] = [];
  game.onStats((stats) => published.push(stats));
  const clock = art.clock!;
  /** One rendered frame at 60 fps (the simulation does not tick, so no throttled stats push) */
  const frame = () => game['render'](0, FRAME);
  const runTo = (t: number) => {
    for (let i = 0; i < MAX_FRAMES && clock.elapsed < t; i++) frame();
  };
  return { game, published, clock, frame, runTo };
}

afterEach(() => {
  for (const game of games.splice(0)) game.stop();
});

describe('the HUD around the opening cinematic', () => {
  it('stays hidden over the whole timeline and shows on the frame the intro ends', () => {
    const { game, published, clock, runTo } = setup();
    expect(game.getStats().introPlaying).toBe(true);
    for (const t of [T.letterboxIn, T.impact, T.pulseStart, T.titleStart, T.letterboxOutStart]) {
      runTo(t);
      expect(game.getStats().introPlaying).toBe(true);
    }
    expect(published).toHaveLength(0);

    runTo(T.end);
    expect(clock.isPlaying()).toBe(false);
    // Pushed at once, so the HUD fades in now instead of at the next stats tick
    expect(published).toHaveLength(1);
    expect(published[0].introPlaying).toBe(false);
    expect(game.getStats().introPlaying).toBe(false);
  });

  it('ignores a skip during the flight, and shows the HUD at once on a skip after the impact', () => {
    const { game, published, frame, runTo } = setup();
    runTo(T.meteorStart + 0.5);
    window.dispatchEvent(new Event('keydown'));
    expect(game.getStats().introPlaying).toBe(true);
    expect(art.skips).toBe(0);
    expect(published).toHaveLength(0);

    runTo(T.impact);
    window.dispatchEvent(new Event('keydown'));
    expect(art.skips).toBe(1);
    expect(game.getStats().introPlaying).toBe(false);
    expect(published.map((s) => s.introPlaying)).toEqual([false]);
    expect(game['camera'].isDirected()).toBe(false);
    // The skip already pushed the change; later frames and keys do not push it again
    frame();
    window.dispatchEvent(new Event('keydown'));
    expect(published).toHaveLength(1);
    expect(art.skips).toBe(1);
  });

  it('hands the art the same clock the camera reads', () => {
    const { game, clock, runTo } = setup();
    runTo(1.5);
    expect(clock.elapsed).toBeGreaterThan(0);
    expect(game['introDirector'].elapsed()).toBe(clock.elapsed);
  });
});
