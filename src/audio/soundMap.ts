import type { AudioEvent, IntroCue, UiSound, WorldPoint } from './events';
import type { SoundId, SoundParams } from './sounds';

/** One sound an event asks for. `at` makes it a world sound: layer-filtered, panned and attenuated. */
export interface SoundRequest {
  sound: SoundId;
  params: SoundParams;
  at?: WorldPoint;
}

const UI_SOUNDS: Record<UiSound, SoundId> = {
  hover: 'uiHover',
  click: 'uiClick',
  command: 'uiCommand',
  error: 'uiError',
  start: 'uiStart',
};

const DEATH_SOUNDS = { ant: 'deathAnt', beetle: 'deathBeetle', cricket: 'deathCricket' } as const satisfies Record<string, SoundId>;

/** The wave extras reuse the existing synth: no new recipes */
const WAVE_FX_SOUNDS = {
  boss: 'introImpact',
  bossDown: 'mutationChosen',
  explode: 'deathBeetle',
  spine: 'acidHit',
  perfect: 'dawnSwell',
} as const satisfies Record<string, SoundId>;

/** 'end' is a control beat (the music bed comes in), not a sound. */
const INTRO_SOUNDS: Record<Exclude<IntroCue, 'end'>, SoundId> = {
  whoosh: 'introWhoosh',
  impact: 'introImpact',
  crystal: 'introCrystal',
  pulse: 'introPulse',
  hum: 'introHum',
  title: 'introTitle',
};

/**
 * The event → sound table. Control events that only steer the music bed or
 * the intro (day/night, the intro's end and its skip) map to null.
 * - Ants spit acid; wildlife bites, so its hits crunch chitin.
 * - Combat and laying happen somewhere: they carry a world point.
 * - Selection, orders and alerts are the player's own feedback: heard anywhere.
 */
export function soundForEvent(event: AudioEvent): SoundRequest | null {
  switch (event.type) {
    case 'ui':
      return { sound: UI_SOUNDS[event.sound], params: {} };
    case 'select':
      return { sound: 'chitter', params: { caste: event.caste } };
    case 'order':
      return { sound: event.kind === 'attack' ? 'orderAttack' : 'orderMove', params: {} };
    case 'hit':
      return { sound: event.by === 'ant' ? 'acidHit' : 'chitinCrunch', params: {}, at: event.at };
    case 'death':
      return { sound: DEATH_SOUNDS[event.kind], params: {}, at: event.at };
    case 'wave':
      return { sound: 'waveAlarm', params: {} };
    case 'waveFx':
      return { sound: WAVE_FX_SOUNDS[event.kind], params: {}, at: event.at };
    case 'eggQueued':
      return { sound: 'eggQueued', params: {} };
    case 'eggLaid':
      return { sound: 'eggLaid', params: {}, at: event.at };
    case 'hatch':
      return { sound: 'hatchChime', params: { caste: event.caste } };
    case 'dawnOffer':
      return { sound: 'dawnSwell', params: {} };
    case 'mutationChosen':
      return { sound: 'mutationChosen', params: {} };
    case 'intro':
      if (event.cue === 'end') return null;
      return { sound: INTRO_SOUNDS[event.cue], params: { index: event.index, duration: event.duration } };
    case 'phase':
    case 'introSkip':
      return null;
  }
}
