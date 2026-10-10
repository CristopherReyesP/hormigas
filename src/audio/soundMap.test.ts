import { describe, expect, it } from 'vitest';
import type { AudioEvent } from './events';
import { VoiceLimiter } from './limiter';
import { planVoice } from './mixer';
import { soundForEvent } from './soundMap';
import { SOUND_IDS, SOUND_SPECS } from './sounds';
import type { Listener } from './spatial';

const HERE = { x: 30, y: 30, layer: 'surface' } as const;
const BELOW = { x: 30, y: 30, layer: 'underground' } as const;
const SURFACE: Listener = { layer: 'surface', view: { x: 10, y: 20, w: 40, h: 24 } };

describe('event → sound mapping', () => {
  it.each<[AudioEvent, string]>([
    [{ type: 'ui', sound: 'hover' }, 'uiHover'],
    [{ type: 'ui', sound: 'click' }, 'uiClick'],
    [{ type: 'ui', sound: 'command' }, 'uiCommand'],
    [{ type: 'ui', sound: 'error' }, 'uiError'],
    [{ type: 'ui', sound: 'start' }, 'uiStart'],
    [{ type: 'select', caste: 'soldier' }, 'chitter'],
    [{ type: 'order', kind: 'move' }, 'orderMove'],
    [{ type: 'order', kind: 'attack' }, 'orderAttack'],
    [{ type: 'hit', by: 'ant', at: HERE }, 'acidHit'],
    [{ type: 'hit', by: 'wildlife', at: HERE }, 'chitinCrunch'],
    [{ type: 'death', kind: 'ant', at: HERE }, 'deathAnt'],
    [{ type: 'death', kind: 'beetle', at: HERE }, 'deathBeetle'],
    [{ type: 'death', kind: 'cricket', at: HERE }, 'deathCricket'],
    [{ type: 'wave' }, 'waveAlarm'],
    [{ type: 'eggQueued' }, 'eggQueued'],
    [{ type: 'eggLaid', at: BELOW }, 'eggLaid'],
    [{ type: 'hatch', caste: 'worker' }, 'hatchChime'],
    [{ type: 'dawnOffer' }, 'dawnSwell'],
    [{ type: 'mutationChosen' }, 'mutationChosen'],
    [{ type: 'intro', cue: 'whoosh', duration: 2.6 }, 'introWhoosh'],
    [{ type: 'intro', cue: 'impact' }, 'introImpact'],
    [{ type: 'intro', cue: 'crystal', index: 3 }, 'introCrystal'],
    [{ type: 'intro', cue: 'pulse' }, 'introPulse'],
    [{ type: 'intro', cue: 'hum', duration: 3.2 }, 'introHum'],
    [{ type: 'intro', cue: 'title' }, 'introTitle'],
  ])('%o plays %s', (event, sound) => {
    expect(soundForEvent(event)?.sound).toBe(sound);
  });

  it('maps control beats to no sound', () => {
    expect(soundForEvent({ type: 'phase', phase: 'night' })).toBeNull();
    expect(soundForEvent({ type: 'intro', cue: 'end' })).toBeNull();
    expect(soundForEvent({ type: 'introSkip' })).toBeNull();
  });

  it('passes the caste and the intro timing on to the recipe', () => {
    expect(soundForEvent({ type: 'select', caste: 'scout' })?.params).toEqual({ caste: 'scout' });
    expect(soundForEvent({ type: 'intro', cue: 'crystal', index: 4 })?.params.index).toBe(4);
    expect(soundForEvent({ type: 'intro', cue: 'hum', duration: 3.25 })?.params.duration).toBe(3.25);
  });

  it('makes combat and laying world sounds, and the player feedback global', () => {
    expect(soundForEvent({ type: 'hit', by: 'ant', at: HERE })?.at).toEqual(HERE);
    expect(soundForEvent({ type: 'eggLaid', at: BELOW })?.at).toEqual(BELOW);
    expect(soundForEvent({ type: 'select', caste: 'worker' })?.at).toBeUndefined();
    expect(soundForEvent({ type: 'wave' })?.at).toBeUndefined();
  });

  it('gives every sound a sane mixer spec', () => {
    for (const id of SOUND_IDS) {
      const spec = SOUND_SPECS[id];
      expect(spec.gain, id).toBeGreaterThan(0);
      expect(spec.gain, id).toBeLessThanOrEqual(0.8);
      expect(spec.duration, id).toBeGreaterThan(0);
      expect(spec.maxInstances, id).toBeGreaterThanOrEqual(1);
      expect(spec.cooldown, id).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('mixer plan', () => {
  it('routes a world sound by the listener: panned, attenuated and on its bus', () => {
    const plan = planVoice({ type: 'hit', by: 'ant', at: { x: 40, y: 30, layer: 'surface' } }, SURFACE, 0, new VoiceLimiter());
    expect(plan).toMatchObject({ sound: 'acidHit', bus: 'sfx', gain: SOUND_SPECS.acidHit.gain });
    expect(plan!.pan).toBeGreaterThan(0);
  });

  it('drops world sounds on the layer the player is not viewing', () => {
    const limiter = new VoiceLimiter();
    expect(planVoice({ type: 'death', kind: 'ant', at: BELOW }, SURFACE, 0, limiter)).toBeNull();
    expect(planVoice({ type: 'eggLaid', at: BELOW }, SURFACE, 0, limiter)).toBeNull();
    // The silent sound spent no cooldown: the same death on the viewed layer still plays
    expect(planVoice({ type: 'death', kind: 'ant', at: HERE }, SURFACE, 0, limiter)).not.toBeNull();
  });

  it('plays global feedback whatever the layer, centered', () => {
    const underground: Listener = { layer: 'underground', view: SURFACE.view };
    expect(planVoice({ type: 'wave' }, underground, 0, new VoiceLimiter())).toMatchObject({ sound: 'waveAlarm', pan: 0 });
    expect(planVoice({ type: 'order', kind: 'move' }, null, 0, new VoiceLimiter())).toMatchObject({ sound: 'orderMove', pan: 0 });
  });

  it('holds the slot for the cue duration when the intro gives one', () => {
    const plan = planVoice({ type: 'intro', cue: 'hum', duration: 3.25 }, null, 0, new VoiceLimiter());
    expect(plan?.duration).toBe(3.25);
  });

  it('applies the cooldown across events of the same sound', () => {
    const limiter = new VoiceLimiter();
    expect(planVoice({ type: 'hit', by: 'ant', at: HERE }, SURFACE, 0, limiter)).not.toBeNull();
    expect(planVoice({ type: 'hit', by: 'ant', at: HERE }, SURFACE, 0.01, limiter)).toBeNull();
    expect(planVoice({ type: 'hit', by: 'wildlife', at: HERE }, SURFACE, 0.01, limiter)).not.toBeNull();
  });
});
