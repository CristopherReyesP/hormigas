import { TILE_SIZE } from '../../../shared/constants';

/**
 * How far from a finger tap an own ant still counts as tapped. A fingertip
 * covers far more than a mouse pointer, and an ant is only a few CSS px
 * wide when the camera is out, so the reach is a fixed size on screen:
 * it spans more tiles the further the camera zooms out.
 */
export const TOUCH_PICK_CSS_PX = 36;
/** Never less than a direct hit on the sprite (SelectionSystem's DIRECT_HIT_RANGE) */
export const MIN_TOUCH_PICK_TILES = 0.75;
/** Never so far that a tap on open ground grabs an ant from across the screen */
export const MAX_TOUCH_PICK_TILES = 3;

/**
 * Finger reach in tiles at camera `zoom` (canvas px per world px) on a canvas
 * with `pixelRatio` canvas px per CSS px.
 */
export function touchPickRadiusTiles(zoom: number, pixelRatio = 1): number {
  const ratio = pixelRatio > 0 ? pixelRatio : 1;
  if (!(zoom > 0)) return MIN_TOUCH_PICK_TILES;
  const tiles = (TOUCH_PICK_CSS_PX * ratio) / zoom / TILE_SIZE;
  return Math.max(MIN_TOUCH_PICK_TILES, Math.min(MAX_TOUCH_PICK_TILES, tiles));
}
