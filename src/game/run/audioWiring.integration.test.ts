import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAudioSink, type AudioEvent } from '../../audio/events';
import { INTRO_CUES, introCuesFor } from '../../audio/introCues';
import type { ScreenBox } from '../../engine/input/InputManager';
import { GameManager } from '../GameManager';
import { AntRole } from '../components/components';
import { INTRO_TIMELINE as T } from '../render/introTimeline';
import type { DayNightSystem } from '../systems/DayNightSystem';
import { CRYSTAL_RIVAL_SETUP, finishIntro } from '../../test/gameManagerMocks';
import type { RunSetup } from './RunSetup';

// Real manager and simulation; browser-only adapters are replaced. The input
// mock keeps the pointer handlers so the tests can drag a box and right-click.
const pointer: { onSelectBox?: (box: ScreenBox, mods: { shift: boolean; ctrl: boolean }) => void; onCommand?: (x: number, y: number) => void } = {};
vi.mock('../../engine/input/InputManager', () => ({ InputManager: class {
  constructor(_canvas: unknown, handlers: typeof pointer) { Object.assign(pointer, handlers); }
  setCamera() {} onKeyAction() {} onCanvasClick() {} destroy() {} getDragBox() { return null; }
} }));
vi.mock('../systems/RenderSystem', () => ({ RenderSystem: class {
  setCamera() {} setUndergroundContext() {} setDayPhaseProvider() {} setCreep() {}
  setFarmStatusProvider() {} setFarmFocusProvider() {} queueFarmHarvest() {} setWaveOverlayProvider() {} setDigOverlayProvider() {} invalidateTerrain() {} startMeteorIntro() {} skipIntro() {} renderInterpolated() {}
} }));
// The intro-skip listeners hang off window and the canvas; node has neither.
vi.stubGlobal('window', new EventTarget());

const FRAME = 1 / 60;
const heard: AudioEvent[] = [];
const games: GameManager[] = [];

function setup(runSetup?: RunSetup) {
  const game = new GameManager(Object.assign(new EventTarget(), { getContext: () => ({}) }) as unknown as HTMLCanvasElement, runSetup);
  games.push(game);
  const frame = () => game['render'](0, FRAME);
  const runTo = (t: number) => {
    for (let i = 0; i < 60 * 30 && game['introClock'].elapsed < t; i++) frame();
  };
  return { game, frame, runTo };
}

const intro = (events: AudioEvent[]) => events.filter((e) => e.type === 'intro' || e.type === 'introSkip');
const cue = (e: AudioEvent) => (e.type === 'intro' ? e.cue : e.type);

beforeEach(() => {
  heard.length = 0;
  setAudioSink((e) => heard.push(e));
});
afterEach(() => {
  setAudioSink(null);
  for (const game of games.splice(0)) game.stop();
});

describe('audio wiring', () => {
  it('plays the intro cues from the single intro clock, in timeline order', () => {
    const { runTo, frame } = setup(CRYSTAL_RIVAL_SETUP);
    runTo(T.end);
    frame();
    expect(intro(heard).map(cue)).toEqual(INTRO_CUES.map((c) => c.cue));
  });

  it('leaves the Crystal Hive\'s chimes, pulse and hum out of the other rivals\' openings', () => {
    const { runTo, frame } = setup();
    runTo(T.end);
    frame();
    expect(intro(heard).map(cue)).toEqual(introCuesFor('wildlife').map((c) => c.cue));
    expect(intro(heard).map(cue)).not.toContain('crystal');
  });

  it('cuts the intro cues short when the player skips after the impact', () => {
    const { game, runTo, frame } = setup();
    runTo(T.impact + 0.2);
    game['skipIntro']();
    frame();
    frame();
    expect(intro(heard).map(cue)).toEqual(['whoosh', 'impact', 'introSkip']);
  });

  it('starts each run with a fresh intro schedule', () => {
    setup().runTo(T.meteorStart + 0.1);
    heard.length = 0;
    setup().runTo(T.meteorStart + 0.1);
    expect(intro(heard).map(cue)).toEqual(['whoosh']);
  });

  it('chitters when ants are boxed and acknowledges a move order', () => {
    setup();
    pointer.onSelectBox!({ x0: 0, y0: 0, x1: 800, y1: 600 }, { shift: false, ctrl: false });
    const select = heard.find((e) => e.type === 'select');
    expect(select).toBeDefined();
    expect(Object.values(AntRole)).toContain((select as { caste: string }).caste);
    pointer.onCommand!(420, 300);
    expect(heard.filter((e) => e.type === 'order')).toEqual([{ type: 'order', kind: 'move' }]);
  });

  it('plops when an egg is ordered, and only then', () => {
    const { game } = setup();
    vi.spyOn(game as unknown as { deductFromStorage: () => boolean }, 'deductFromStorage').mockReturnValue(true);
    expect(game.queueBreed(AntRole.Worker)).toBe(true);
    expect(heard.filter((e) => e.type === 'eggQueued')).toHaveLength(1);
  });

  it('sounds the wave alarm when the wave launches at nightfall, and turns the music to night', () => {
    const { game } = setup();
    finishIntro(game);
    const dayNight = game['dayNightSystem'] as DayNightSystem;
    dayNight.update(dayNight.getPhaseRemaining());
    game['update'](FRAME);
    expect(heard).toContainEqual({ type: 'phase', phase: 'night' });
    expect(heard).toContainEqual({ type: 'wave' });
  });

  it('swells when the evolution chamber opens at the kill mark, and chimes on the pick', () => {
    const { game } = setup();
    finishIntro(game);
    game['world'].runTally.enemiesDefeated = 4;
    game['update'](FRAME);
    expect(heard).toContainEqual({ type: 'dawnOffer' });
    const option = game.getStats().mutationOffer!.options[0];
    expect(game.chooseMutation(option.id)).toBe(true);
    expect(heard.filter((e) => e.type === 'mutationChosen')).toHaveLength(1);
  });
});
