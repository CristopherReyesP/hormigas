import type { AudioLayer, WorldPoint } from './events';

/** The visible part of the viewed layer, in tiles (what `Camera.getViewRectTiles` returns). */
export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the player's ears are: the layer they look at and the part of it on screen. */
export interface Listener {
  layer: AudioLayer;
  view: ViewRect;
}

export interface SpatialMix {
  /** -1 hard left … 1 hard right */
  pan: number;
  /** 0..1 level multiplier */
  gain: number;
}

export const SPATIAL = {
  /** Even a unit at the screen edge stays a little in the other ear: never hard-pan */
  panWidth: 0.7,
  /** The first tile past the screen edge is already this much quieter than on screen */
  offscreenGain: 0.5,
  /** Tiles past the screen edge where a sound fades out completely */
  falloffTiles: 16,
  /** Below this level a sound is not worth a voice */
  minGain: 0.03,
} as const;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Pan by screen x and attenuation by distance from the screen. A point on
 * screen plays at full level, panned by where it is across the view; a
 * point off screen drops to `offscreenGain` and fades out quadratically over
 * `falloffTiles`, keeping the pan of the side it is on.
 */
export function spatialize(p: { x: number; y: number }, view: ViewRect): SpatialMix {
  const half = view.w / 2;
  const pan = half > 0 ? clamp((p.x - (view.x + half)) / half, -1, 1) * SPATIAL.panWidth : 0;
  const dx = Math.max(view.x - p.x, 0, p.x - (view.x + view.w));
  const dy = Math.max(view.y - p.y, 0, p.y - (view.y + view.h));
  const d = Math.hypot(dx, dy);
  if (d === 0) return { pan, gain: 1 };
  const fade = Math.max(0, 1 - d / SPATIAL.falloffTiles);
  return { pan, gain: SPATIAL.offscreenGain * fade * fade };
}

/**
 * How a world sound reaches the player, or null when it does not: sounds on
 * the other layer are not heard at all (the surface battle is silent from
 * the nest), and far off-screen sounds fade below the voice threshold.
 */
export function hearAt(at: WorldPoint, listener: Listener | null): SpatialMix | null {
  if (!listener || at.layer !== listener.layer) return null;
  const mix = spatialize(at, listener.view);
  return mix.gain < SPATIAL.minGain ? null : mix;
}
