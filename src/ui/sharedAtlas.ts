import { SpriteAtlas } from '../engine/renderer/SpriteAtlas';

let atlas: SpriteAtlas | null = null;

/** One sprite atlas for every UI preview (portraits, evolution cards); built on first use. */
export function getSpriteAtlas(): SpriteAtlas {
  atlas ??= new SpriteAtlas();
  return atlas;
}
