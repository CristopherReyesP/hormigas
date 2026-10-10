import { AudioEngine } from './engine';
import { emitAudio, setAudioSink, type UiSound } from './events';
import { IntroCueTracker } from './introCues';
import { audioSettings, busLevels } from './settings';
import type { Listener } from './spatial';
import type { IntroVariant } from '../game/render/introTimeline';

export { emitAudio } from './events';
export type { AudioEvent, AudioLayer, WorldPoint } from './events';
export type { Listener, ViewRect } from './spatial';

/**
 * The game's audio entry points. Nothing here touches WebAudio until the
 * first user gesture (`unlockAudio`): browsers refuse to start sound before
 * one, and node tests never make one, so importing this is always safe.
 */

let engine: AudioEngine | null = null;
let listener: (() => Listener) | null = null;
const introCues = new IntroCueTracker();

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  const g = globalThis as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** The running engine, or null while audio is still locked (or unsupported). */
export function getAudioEngine(): AudioEngine | null {
  return engine;
}

/**
 * Create (once) and resume the AudioContext. Call it from a user gesture:
 * the first pointer or key press anywhere does (see installAudioUi), and so
 * does COMENZAR on the race picker.
 */
export function unlockAudio(): AudioEngine | null {
  if (!engine) {
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    try {
      const ctx = new Ctor({ latencyHint: 'interactive' });
      engine = new AudioEngine(ctx);
    } catch (e) {
      console.warn('[audio] WebAudio unavailable', e);
      return null;
    }
    const live = engine;
    live.setListener(() => listener?.() ?? null);
    live.applyLevels(busLevels(audioSettings.get()));
    audioSettings.subscribe(() => live.applyLevels(busLevels(audioSettings.get())));
    setAudioSink((event) => live.handle(event));
    // Unlocked mid-run, after the intro: the bed would otherwise wait for a cue that already passed
    if (listener && introCues.finished) live.startMusic();
    // iOS Safari only unlocks after a sound starts inside the gesture: one silent sample
    const ctx = live.ctx;
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    blip.connect(ctx.destination);
    blip.start();
  }
  const ctx = engine.ctx as AudioContext;
  if (ctx.state === 'suspended' && typeof ctx.resume === 'function') void ctx.resume().catch(() => {});
  return engine;
}

/** A run began: world sounds are heard from this view (the viewed layer and its camera); its opening plays `introVariant`'s cues. */
export function audioRunStarted(view: () => Listener, introVariant: IntroVariant = 'crystal'): void {
  listener = view;
  introCues.reset(introVariant);
  engine?.startRun();
}

/** The run is over (restart, unmount): world sounds stop being heard. */
export function audioRunEnded(): void {
  listener = null;
  engine?.endRun();
}

/**
 * Once per rendered frame with the run's single intro clock: fires the
 * intro's sound cues as the clock passes them (see introCues.ts).
 */
export function audioIntroFrame(introTime: number, dt: number): void {
  for (const event of introCues.frame(introTime, dt)) emitAudio(event);
}

/** A chrome sound (hover, click, a command press, a refused command). */
export function uiSound(sound: UiSound): void {
  emitAudio({ type: 'ui', sound });
}

// ── Chrome sounds by delegation ──

const INTERACTIVE = 'button, [role="button"]';
let uiInstalled = false;

function sfxOf(el: Element): string | null {
  return el.getAttribute('data-sfx');
}

/**
 * One set of document listeners for every button in the HUD and menus:
 * - the first pointer or key press unlocks audio;
 * - entering a button ticks, clicking it taps;
 * - `aria-disabled="true"` buttons buzz instead;
 * - `data-sfx` overrides the click (`start`, `command`) or opts out (`none`).
 * Installed once per page; later calls are no-ops.
 */
export function installAudioUi(doc: Document = document): void {
  if (uiInstalled) return;
  uiInstalled = true;
  const unlock = () => unlockAudio();
  doc.addEventListener('pointerdown', unlock, { capture: true });
  doc.addEventListener('keydown', unlock, { capture: true });

  let hovered: Element | null = null;
  doc.addEventListener('pointerover', (e) => {
    const el = (e.target as Element | null)?.closest?.(INTERACTIVE) ?? null;
    if (el === hovered) return;
    hovered = el;
    if (!el || sfxOf(el) === 'none' || (el as HTMLButtonElement).disabled) return;
    uiSound('hover');
  });

  doc.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.(INTERACTIVE);
    if (!el) return;
    const sfx = sfxOf(el);
    if (sfx === 'none') return;
    if (el.getAttribute('aria-disabled') === 'true') uiSound('error');
    else if (sfx === 'start' || sfx === 'command') uiSound(sfx);
    else uiSound('click');
  });
}
