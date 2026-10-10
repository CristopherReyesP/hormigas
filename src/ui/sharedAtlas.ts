import { sharedSpriteAtlas, type SpriteAtlas } from '../engine/renderer/SpriteAtlas';

/** The sprite atlas for every UI preview (portraits, evolution cards): the game view's own, so ants show the colony's marks. */
export function getSpriteAtlas(): SpriteAtlas {
  return sharedSpriteAtlas();
}
