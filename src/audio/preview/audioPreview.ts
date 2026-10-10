// DEV-ONLY sound preview harness (scripts/audio-preview.html) — not imported by the game.
// Lists every procedural sound with a play button, plus the full intro, a
// 60-ant battle through the voice limiter and the music bed by day and night.
import type { AntRole } from '../../game/components/components';
import { AudioEngine } from '../engine';
import type { AudioEvent } from '../events';
import { INTRO_CUES, introRealSeconds } from '../introCues';
import { busLevels, DEFAULT_AUDIO_SETTINGS } from '../settings';
import { SOUND_LABELS, type SoundId, type SoundParams } from '../sounds';
import { SPIRE_NOTES } from '../synth/introRecipes';

const VIEW = { x: 0, y: 0, w: 40, h: 24 };
const CASTES: Array<[AntRole, string]> = [
  ['worker', 'obrera'],
  ['soldier', 'soldado'],
  ['scout', 'exploradora'],
  ['nurse', 'nodriza'],
  ['defender', 'defensora'],
];

let engine: AudioEngine | null = null;
let night = false;

/** The context starts on the first click, as in the game. */
function audio(): AudioEngine {
  if (!engine) {
    engine = new AudioEngine(new AudioContext({ latencyHint: 'interactive' }));
    engine.applyLevels(busLevels(DEFAULT_AUDIO_SETTINGS));
    engine.setListener(() => ({ layer: 'surface', view: VIEW }));
  }
  const ctx = engine.ctx as AudioContext;
  if (ctx.state === 'suspended') void ctx.resume();
  return engine;
}

const app = document.getElementById('app')!;

function section(title: string, note?: string): HTMLElement {
  const box = document.createElement('section');
  const h = document.createElement('h2');
  h.textContent = title;
  box.append(h);
  if (note) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = note;
    box.append(p);
  }
  const row = document.createElement('div');
  row.className = 'row';
  box.append(row);
  app.append(box);
  return row;
}

function button(row: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  row.append(b);
  return b;
}

function sound(row: HTMLElement, id: SoundId, params: SoundParams = {}, label = SOUND_LABELS[id]): void {
  button(row, label, () => audio().play(id, params));
}

const status = document.createElement('p');
status.className = 'status';
app.append(status);
setInterval(() => {
  const e = engine;
  status.textContent = e
    ? `Voces activas: ${e.activeVoices()} · Música: ${e.musicPlaying ? (night ? 'noche' : 'día') : 'apagada'}`
    : 'Haz clic en cualquier sonido para iniciar el audio.';
}, 200);

let row = section('Interfaz');
for (const id of ['uiHover', 'uiClick', 'uiCommand', 'uiError', 'uiStart'] as const) sound(row, id);

row = section('Enjambre', 'El chasquido de selección cambia un poco con cada casta.');
for (const [caste, name] of CASTES) sound(row, 'chitter', { caste }, `Selección: ${name}`);
sound(row, 'orderMove');
sound(row, 'orderAttack');

row = section('Combate', 'Los golpes en pantalla se panean por su posición; fuera de pantalla se atenúan.');
for (const id of ['acidHit', 'chitinCrunch', 'deathAnt', 'deathBeetle', 'deathCricket'] as const) sound(row, id);
const hitAt = (x: number) => audio().handle({ type: 'hit', by: 'ant', at: { x, y: 12, layer: 'surface' } });
button(row, 'Golpe a la izquierda', () => hitAt(2));
button(row, 'Golpe a la derecha', () => hitAt(38));
button(row, 'Golpe fuera de pantalla', () => hitAt(48));
button(row, 'Golpe en la otra capa (no se oye)', () =>
  audio().handle({ type: 'hit', by: 'ant', at: { x: 20, y: 12, layer: 'underground' } }));
button(row, 'Batalla de 60 hormigas (limitador)', () => {
  const e = audio();
  let ticks = 0;
  const timer = setInterval(() => {
    // 60 fighters, each landing a hit every ~0.8 s, plus the odd death
    for (let i = 0; i < 60; i++) {
      if (Math.random() > 1 / 48) continue;
      const at = { x: Math.random() * 60 - 10, y: 12, layer: 'surface' as const };
      e.handle({ type: 'hit', by: Math.random() < 0.7 ? 'ant' : 'wildlife', at });
      if (Math.random() < 0.04) e.handle({ type: 'death', kind: Math.random() < 0.6 ? 'ant' : 'beetle', at });
    }
    if (++ticks > 60 * 4) clearInterval(timer);
  }, 1000 / 60);
});

row = section('Alertas');
for (const id of ['waveAlarm', 'eggQueued', 'eggLaid'] as const) sound(row, id);
for (const [caste, name] of CASTES) sound(row, 'hatchChime', { caste }, `Nace: ${name}`);
sound(row, 'dawnSwell');
sound(row, 'mutationChosen');
sound(row, 'levelUp', { index: 1 });

row = section('Intro', 'La intro completa dispara cada sonido en su momento de la línea de tiempo, como en el juego.');
const whoosh = INTRO_CUES.find((c) => c.cue === 'whoosh')!;
const hum = INTRO_CUES.find((c) => c.cue === 'hum')!;
sound(row, 'introWhoosh', { duration: whoosh.duration });
sound(row, 'introImpact');
SPIRE_NOTES.forEach((_, index) => sound(row, 'introCrystal', { index }, `Aguja de cristal ${index + 1}`));
sound(row, 'introPulse');
sound(row, 'introHum', { duration: hum.duration });
sound(row, 'introTitle');
button(row, 'Intro completa', () => {
  const e = audio();
  e.startRun();
  for (const cue of INTRO_CUES) {
    const event: AudioEvent = { type: 'intro', cue: cue.cue, index: cue.index, duration: cue.duration };
    setTimeout(() => e.handle(event), introRealSeconds(0, cue.at) * 1000);
  }
});

row = section('Música', 'Fondo ambiental: pad alienígena con campanillas de día; más oscuro y con pulso de noche.');
button(row, 'Día', () => {
  night = false;
  const e = audio();
  e.handle({ type: 'phase', phase: 'day' });
  e.startMusic();
});
button(row, 'Noche', () => {
  night = true;
  const e = audio();
  e.handle({ type: 'phase', phase: 'night' });
  e.startMusic();
});
button(row, 'Detener', () => audio().endRun());
