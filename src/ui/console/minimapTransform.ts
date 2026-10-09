/**
 * Tile ↔ minimap pixel math. The map is drawn at one uniform scale and
 * letterboxed inside the (square) minimap box.
 */

export interface MinimapLayout {
  /** Map size in tiles */
  mapW: number;
  mapH: number;
  /** Pixels per tile */
  scale: number;
  /** Drawn map size and position inside the box, in pixels */
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function fitMinimap(mapW: number, mapH: number, boxW: number, boxH: number): MinimapLayout {
  const scale = Math.min(boxW / mapW, boxH / mapH);
  const width = mapW * scale;
  const height = mapH * scale;
  return {
    mapW,
    mapH,
    scale,
    width,
    height,
    offsetX: Math.floor((boxW - width) / 2),
    offsetY: Math.floor((boxH - height) / 2),
  };
}

export function tileToMinimap(layout: MinimapLayout, tileX: number, tileY: number): { x: number; y: number } {
  return {
    x: layout.offsetX + tileX * layout.scale,
    y: layout.offsetY + tileY * layout.scale,
  };
}

/** Pixel → tile, clamped to the map so clicks on the letterbox bars hit the nearest edge. */
export function minimapToTile(layout: MinimapLayout, px: number, py: number): { x: number; y: number } {
  const x = (px - layout.offsetX) / layout.scale;
  const y = (py - layout.offsetY) / layout.scale;
  return {
    x: Math.max(0, Math.min(layout.mapW, x)),
    y: Math.max(0, Math.min(layout.mapH, y)),
  };
}

/** Camera rect (tiles) in minimap pixels, clipped to the drawn map. */
export function viewRectOnMinimap(layout: MinimapLayout, view: TileRect): TileRect {
  const x0 = Math.max(0, view.x);
  const y0 = Math.max(0, view.y);
  const x1 = Math.min(layout.mapW, view.x + view.w);
  const y1 = Math.min(layout.mapH, view.y + view.h);
  const topLeft = tileToMinimap(layout, x0, y0);
  return {
    x: topLeft.x,
    y: topLeft.y,
    w: Math.max(0, x1 - x0) * layout.scale,
    h: Math.max(0, y1 - y0) * layout.scale,
  };
}
