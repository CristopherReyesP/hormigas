import type { AntRole } from '../game/components/components';

/**
 * The game's audio event bus. Systems describe WHAT happened (a hit, a death,
 * a wave) with one `emitAudio` line; the audio engine decides what that sounds
 * like, whether the player can hear it and how loud. With no sink attached
 * (tests, headless scripts, audio still locked) an event costs one call.
 *
 * This module is deliberately tiny and free of WebAudio, so any system can
 * import it without pulling the engine into its import graph.
 */

export type AudioLayer = 'surface' | 'underground';

/** Where a sound happens: entity coords (tiles) on one layer. */
export interface WorldPoint {
  x: number;
  y: number;
  layer: AudioLayer;
}

export type UiSound = 'hover' | 'click' | 'command' | 'error' | 'start';

/** Beats of the opening cinematic, fired from the intro clock (see introCues.ts). */
export type IntroCue = 'whoosh' | 'impact' | 'crystal' | 'pulse' | 'hum' | 'title' | 'end';

export type AudioEvent =
  | { type: 'ui'; sound: UiSound }
  | { type: 'select'; caste: AntRole }
  | { type: 'order'; kind: 'move' | 'attack' }
  | { type: 'hit'; by: 'ant' | 'wildlife'; at: WorldPoint }
  | { type: 'death'; kind: 'ant' | 'beetle' | 'cricket'; at: WorldPoint }
  | { type: 'wave' }
  /** Invaders broke into the nest, or are biting the queen or the eggs */
  | { type: 'nestAlarm' }
  /** Night-wave extras: a boss arrives or falls, an elite blows up, a spine fires, a clean defense */
  | { type: 'waveFx'; kind: 'boss' | 'bossDown' | 'explode' | 'spine' | 'perfect'; at?: WorldPoint }
  | { type: 'phase'; phase: 'day' | 'night' }
  | { type: 'eggQueued' }
  | { type: 'eggLaid'; at: WorldPoint }
  | { type: 'hatch'; caste: AntRole }
  | { type: 'dawnOffer' }
  | { type: 'mutationChosen' }
  /** A Mejoras level bought (1 = first level of its line) */
  | { type: 'upgrade'; level: number }
  /** `index` orders repeated cues (one per spire); `duration` is real seconds for cues that span a stretch */
  | { type: 'intro'; cue: IntroCue; index?: number; duration?: number }
  | { type: 'introSkip' };

export type AudioSink = (event: AudioEvent) => void;

let sink: AudioSink | null = null;

/** Attach (or detach with null) the one consumer of audio events. */
export function setAudioSink(next: AudioSink | null): void {
  sink = next;
}

/** Report something audible. Null is accepted so hooks can return "nothing to hear". */
export function emitAudio(event: AudioEvent | null): void {
  if (event && sink) sink(event);
}
