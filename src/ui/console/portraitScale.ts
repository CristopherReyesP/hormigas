// Crisp placement of atlas sprites in small UI frames (selection portrait,
// evolution chamber specimen): every art pixel must cover a whole number of
// screen px, starting on a whole screen px, or the pixel art blurs.
import type { SelectedEntityInfo } from '../../game/GameManager';
import { TILE_SIZE } from '../../shared/constants';
import { ART_PX, SPRITE_GRID, spritePivot } from '../../engine/renderer/sprites/spriteScale';

/** Portrait canvas size in screen px. */
export const PORTRAIT_SIZE = 64;

/**
 * Nest radius (tiles) at which the atlas draws the mound at ART_PX world px
 * per art px, like every other sprite (drawNest spans about 2.6 radii).
 */
export const NEST_PORTRAIT_RADIUS = (SPRITE_GRID.nest * ART_PX) / (TILE_SIZE * 2.6);

/** Atlas sprite a portrait can show (a key of SPRITE_GRID). */
export type PortraitSprite = 'ant' | 'beetle' | 'cricket' | 'den' | 'nest' | 'food' | 'giantMushroom';

/** Where to draw a sprite in a square frame so it stays pixel-crisp. */
export interface CrispPlacement {
  /** Screen px per art px (a whole number). */
  pixelSize: number;
  /** Canvas transform scale: world px → screen px. */
  scale: number;
  /** Screen px from the frame's top-left to the sprite box's (both axes). */
  offset: number;
  /** World coordinate to pass to the atlas draw call (both axes), under `scale` and `offset`. */
  at: number;
}

/**
 * Fit a square sprite of `grid` art px into a `frame` px square: the largest
 * whole number of screen px per art px that fits (at least 1), the box
 * centered on a whole screen px. `anchor` is what the atlas draw call
 * positions: a unit sheet's rotation pivot or a static prop's center.
 */
export function crispPlacement(grid: number, frame: number, anchor: 'pivot' | 'center'): CrispPlacement {
  const pixelSize = Math.max(1, Math.floor(frame / grid));
  return {
    pixelSize,
    scale: pixelSize / ART_PX,
    offset: Math.floor((frame - grid * pixelSize) / 2),
    at: anchor === 'pivot' ? spritePivot(grid) * ART_PX : (grid * ART_PX) / 2,
  };
}

/** The atlas sprite of a selection (food shows its sprite, the giant mushroom its own prop). */
export function portraitSprite(kind: SelectedEntityInfo['type'], foodType?: string): PortraitSprite {
  switch (kind) {
    case 'beetle_den':
    case 'cricket_den':
    case 'crystal_hive':
    case 'crystal_unit':
    case 'crystal_spire':
    case 'human_building':
      return 'den'; // Crystal portraits draw baked unit frames instead (Portrait)
    case 'human_unit':
      return 'beetle'; // a stand-in: InfoPanel shows HumanPortrait for Humans
    case 'food':
      return foodType === 'giant_mushroom' ? 'giantMushroom' : 'food';
    default:
      return kind;
  }
}

/** Unit and food sheets draw from their pivot; dens, the mushroom and the nest from their center. */
const PIVOT_ANCHORED: ReadonlySet<PortraitSprite> = new Set(['ant', 'beetle', 'cricket', 'food']);

/** Crisp, centered placement of `sprite` in the portrait. */
export function portraitPlacement(sprite: PortraitSprite, frame = PORTRAIT_SIZE): CrispPlacement {
  return crispPlacement(SPRITE_GRID[sprite], frame, PIVOT_ANCHORED.has(sprite) ? 'pivot' : 'center');
}
