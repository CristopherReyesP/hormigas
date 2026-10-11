// The one art-pixel scale (art direction rule): one art pixel = ART_PX world
// px, which is 2 screen px at zoom 1 and a whole number of screen px at every
// 0.5 zoom step. Bigger creatures get bigger grids, never a bigger scale.
import { TILE_SIZE } from '../../../shared/constants';
import { gridPivot } from '../pixelart/ArtPen';

export const ART_PX = 2;

/** Art-pixel grid (square) of every atlas sprite. */
export const SPRITE_GRID = {
  ant: 24,
  queen: 52,
  beetle: 28,
  cricket: 48,
  food: 24,
  /** A mineral node's crystal cluster (drawn with PixelPainter, never turned) */
  mineral: 24,
  den: 40,
  giantMushroom: 32,
  nest: 40,
  // Phase 2's creatures beyond the wall
  legionary: 24,
  legionQueen: 44,
  spider: 32,
  mantis: 40,
  tarantula: 88,
  centipede: 40,
  sporeJelly: 32,
  acidSpitter: 32,
} as const;

export const WALK_FRAMES = 4;

/** Rotation pivot (continuous art px) of a square grid: the centre of its middle pixel. */
export function spritePivot(size: number): number {
  return gridPivot(size);
}

/** Art pixels whose centres lie this close to the pivot stay on the grid in every direction. */
export function rotationSafeRadius(size: number): number {
  return Math.floor(size / 2) - 1;
}

/** Walk-cycle frame (0..frames-1) for a continuous leg phase in radians. */
export function walkFrame(legPhase: number, frames = WALK_FRAMES): number {
  const TWO_PI = Math.PI * 2;
  const phase = ((legPhase % TWO_PI) + TWO_PI) % TWO_PI;
  return Math.floor(phase / (TWO_PI / frames)) % frames;
}

/**
 * Whole world px per art px for the colony mound of `radius` tiles: the
 * mound spans about 2.6 radii, rounded to a whole scale so every art pixel
 * stays a crisp square (2 at the game's nest radius, matching the units).
 */
export function nestPixelsPerArtPixel(radius: number): number {
  return Math.max(1, Math.round((radius * TILE_SIZE * 1.3 * 2) / SPRITE_GRID.nest));
}
