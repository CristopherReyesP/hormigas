/**
 * "Can the colony see this tile right now?" — the single rule shared by the
 * fog overlay and every entity that must hide under it.
 *
 * Explored-but-unwatched ground keeps its terrain and structures (dens stay
 * remembered, as in StarCraft), but moving enemies are only drawn where the
 * fog is fully clear. Using the same threshold as FogRenderer guarantees a
 * beetle never shows up on a tile the overlay paints as fogged.
 */

/** Brightness at or above which FogRenderer draws a tile fully clear. */
export const FOG_CLEAR_BRIGHTNESS = 128;

/** The read-only slice of VisibilityGrid this rule needs. */
export interface VisibilityReader {
  isExplored(x: number, y: number): boolean;
  getBrightness(x: number, y: number): number;
}

export function isTileVisible(grid: VisibilityReader, x: number, y: number): boolean {
  return grid.isExplored(x, y) && grid.getBrightness(x, y) >= FOG_CLEAR_BRIGHTNESS;
}
