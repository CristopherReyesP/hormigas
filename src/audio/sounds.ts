import type { AntRole } from '../game/components/components';

/** Mixer buses under the master. Music is the ambient bed; sfx is the world; ui is the chrome. */
export type BusName = 'music' | 'sfx' | 'ui';

export const SOUND_IDS = [
  // Chrome
  'uiHover',
  'uiClick',
  'uiCommand',
  'uiError',
  'uiStart',
  // The Swarm answering the player
  'chitter',
  'orderMove',
  'orderAttack',
  // Combat
  'acidHit',
  'chitinCrunch',
  'deathAnt',
  'deathBeetle',
  'deathCricket',
  // Alerts
  'waveAlarm',
  'eggQueued',
  'eggLaid',
  'hatchChime',
  'dawnSwell',
  'mutationChosen',
  'levelUp',
  // The opening cinematic
  'introWhoosh',
  'introImpact',
  'introCrystal',
  'introPulse',
  'introHum',
  'introTitle',
] as const;

export type SoundId = (typeof SOUND_IDS)[number];

/** Per-play knobs a recipe may read. */
export interface SoundParams {
  /** Selection chitter and hatch chime vary by caste */
  caste?: AntRole;
  /** Repeated cues (one crystal chime per spire) climb by index */
  index?: number;
  /** Real seconds, for sounds that must last a given stretch (the meteor whoosh, the drone hum) */
  duration?: number;
}

/**
 * How the mixer treats each sound.
 * - `cooldown`: seconds before the same sound may start again (60 ants
 *   fighting must not become one long buzz).
 * - `maxInstances`: copies of this sound playing at once.
 * - `priority`: who wins a voice when the pool is full (higher steals lower).
 * - `duration`: nominal seconds the voice holds a slot (`params.duration` overrides).
 * - `gain`: the sound's level on its bus, so recipes can be written at full scale.
 */
export interface SoundSpec {
  bus: BusName;
  cooldown: number;
  maxInstances: number;
  priority: number;
  duration: number;
  gain: number;
}

const PRIORITY = { chrome: 1, combat: 2, unit: 3, alert: 4, cinematic: 5 } as const;

export const SOUND_SPECS: Record<SoundId, SoundSpec> = {
  uiHover: { bus: 'ui', cooldown: 0.04, maxInstances: 2, priority: PRIORITY.chrome, duration: 0.05, gain: 0.35 },
  uiClick: { bus: 'ui', cooldown: 0.03, maxInstances: 3, priority: PRIORITY.chrome, duration: 0.08, gain: 0.6 },
  uiCommand: { bus: 'ui', cooldown: 0.04, maxInstances: 3, priority: PRIORITY.chrome, duration: 0.12, gain: 0.7 },
  uiError: { bus: 'ui', cooldown: 0.25, maxInstances: 1, priority: PRIORITY.chrome, duration: 0.26, gain: 0.55 },
  uiStart: { bus: 'ui', cooldown: 0.5, maxInstances: 1, priority: PRIORITY.alert, duration: 1.3, gain: 0.7 },

  chitter: { bus: 'sfx', cooldown: 0.12, maxInstances: 2, priority: PRIORITY.unit, duration: 0.3, gain: 0.55 },
  orderMove: { bus: 'sfx', cooldown: 0.08, maxInstances: 2, priority: PRIORITY.unit, duration: 0.16, gain: 0.55 },
  orderAttack: { bus: 'sfx', cooldown: 0.1, maxInstances: 2, priority: PRIORITY.unit, duration: 0.4, gain: 0.55 },

  acidHit: { bus: 'sfx', cooldown: 0.07, maxInstances: 4, priority: PRIORITY.combat, duration: 0.35, gain: 0.32 },
  chitinCrunch: { bus: 'sfx', cooldown: 0.08, maxInstances: 4, priority: PRIORITY.combat, duration: 0.16, gain: 0.36 },
  deathAnt: { bus: 'sfx', cooldown: 0.12, maxInstances: 3, priority: PRIORITY.combat + 0.5, duration: 0.45, gain: 0.45 },
  deathBeetle: { bus: 'sfx', cooldown: 0.15, maxInstances: 2, priority: PRIORITY.combat + 0.5, duration: 0.65, gain: 0.5 },
  deathCricket: { bus: 'sfx', cooldown: 0.15, maxInstances: 2, priority: PRIORITY.combat + 0.5, duration: 0.6, gain: 0.45 },

  waveAlarm: { bus: 'sfx', cooldown: 3, maxInstances: 1, priority: PRIORITY.alert, duration: 3, gain: 0.6 },
  eggQueued: { bus: 'sfx', cooldown: 0.06, maxInstances: 2, priority: PRIORITY.unit, duration: 0.18, gain: 0.5 },
  eggLaid: { bus: 'sfx', cooldown: 0.3, maxInstances: 1, priority: PRIORITY.combat, duration: 0.3, gain: 0.35 },
  hatchChime: { bus: 'sfx', cooldown: 0.6, maxInstances: 2, priority: PRIORITY.alert, duration: 1.4, gain: 0.32 },
  dawnSwell: { bus: 'sfx', cooldown: 2, maxInstances: 1, priority: PRIORITY.alert, duration: 4, gain: 0.45 },
  mutationChosen: { bus: 'sfx', cooldown: 0.5, maxInstances: 1, priority: PRIORITY.alert, duration: 1.6, gain: 0.5 },
  levelUp: { bus: 'sfx', cooldown: 0.15, maxInstances: 1, priority: PRIORITY.alert, duration: 1.1, gain: 0.5 },

  introWhoosh: { bus: 'sfx', cooldown: 1, maxInstances: 1, priority: PRIORITY.cinematic, duration: 2.7, gain: 0.55 },
  introImpact: { bus: 'sfx', cooldown: 1, maxInstances: 1, priority: PRIORITY.cinematic, duration: 3.2, gain: 0.8 },
  introCrystal: { bus: 'sfx', cooldown: 0.05, maxInstances: 7, priority: PRIORITY.cinematic, duration: 2.4, gain: 0.3 },
  introPulse: { bus: 'sfx', cooldown: 1, maxInstances: 1, priority: PRIORITY.cinematic, duration: 2, gain: 0.45 },
  introHum: { bus: 'sfx', cooldown: 1, maxInstances: 1, priority: PRIORITY.cinematic, duration: 3.5, gain: 0.4 },
  introTitle: { bus: 'sfx', cooldown: 1, maxInstances: 1, priority: PRIORITY.cinematic, duration: 3.2, gain: 0.6 },
};

/** Sounds the intro skip cuts short. */
export const INTRO_SOUNDS: ReadonlySet<SoundId> = new Set<SoundId>(['introWhoosh', 'introCrystal', 'introPulse', 'introHum', 'introTitle']);

/** The preview page lists every sound under a Spanish label. */
export const SOUND_LABELS: Record<SoundId, string> = {
  uiHover: 'Interfaz: pasar el cursor',
  uiClick: 'Interfaz: clic',
  uiCommand: 'Interfaz: botón de comando',
  uiError: 'Interfaz: comando no disponible',
  uiStart: 'Interfaz: comenzar partida',
  chitter: 'Enjambre: chasquido al seleccionar',
  orderMove: 'Enjambre: orden de mover',
  orderAttack: 'Enjambre: orden de atacar',
  acidHit: 'Combate: escupitajo de ácido',
  chitinCrunch: 'Combate: crujido de quitina',
  deathAnt: 'Combate: muere una hormiga',
  deathBeetle: 'Combate: muere un acorazado',
  deathCricket: 'Combate: muere un saltador',
  waveAlarm: 'Alerta: oleada al anochecer',
  eggQueued: 'Alerta: huevo encargado',
  eggLaid: 'Alerta: la reina pone un huevo',
  hatchChime: 'Alerta: nace una hormiga',
  dawnSwell: 'Alerta: cámara de evolución al amanecer',
  mutationChosen: 'Alerta: mutación elegida',
  levelUp: 'Alerta: mejora comprada',
  introWhoosh: 'Intro: caída del meteorito',
  introImpact: 'Intro: impacto',
  introCrystal: 'Intro: crecen las agujas de cristal',
  introPulse: 'Intro: pulso de cristal',
  introHum: 'Intro: zumbido de los drones',
  introTitle: 'Intro: título',
};
