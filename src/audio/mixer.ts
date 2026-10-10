import type { AudioEvent } from './events';
import type { VoiceLimiter } from './limiter';
import { soundForEvent } from './soundMap';
import { SOUND_SPECS, type BusName, type SoundId, type SoundParams } from './sounds';
import { hearAt, type Listener } from './spatial';

/** Everything the engine needs to start one voice. */
export interface VoicePlan {
  token: number;
  evicted: number | null;
  sound: SoundId;
  bus: BusName;
  params: SoundParams;
  pan: number;
  /** The sound's bus level times its distance attenuation */
  gain: number;
  /** Seconds the voice holds its slot */
  duration: number;
}

/**
 * Decide whether an event is heard and how: event → sound, then the layer
 * and distance check for world sounds, then the voice budget. Pure apart
 * from the limiter's bookkeeping, so the whole decision runs under test
 * without WebAudio.
 */
export function planVoice(event: AudioEvent, listener: Listener | null, now: number, limiter: VoiceLimiter): VoicePlan | null {
  const request = soundForEvent(event);
  if (!request) return null;

  let pan = 0;
  let distance = 1;
  if (request.at) {
    const mix = hearAt(request.at, listener);
    if (!mix) return null;
    pan = mix.pan;
    distance = mix.gain;
  }

  const spec = SOUND_SPECS[request.sound];
  const duration = request.params.duration ?? spec.duration;
  const grant = limiter.tryStart(request.sound, spec, now, duration);
  if (!grant) return null;

  return {
    token: grant.token,
    evicted: grant.evicted,
    sound: request.sound,
    bus: spec.bus,
    params: request.params,
    pan,
    gain: spec.gain * distance,
    duration,
  };
}
