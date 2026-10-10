import type { GameManager, MinimapEntity, SurfaceMinimapDot } from '../../game/GameManager';
import { PAL } from '../../engine/renderer/pixelart/palette';
import { isTileVisible } from '../../engine/renderer/fogVisibility';
import { TERRAIN_COLORS, TerrainType, UndergroundTerrainType, ChamberType } from '../../simulation/world/types';
import { UNDERGROUND_HEIGHT, UNDERGROUND_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { fitMinimap, tileToMinimap, viewRectOnMinimap, type MinimapLayout } from './minimapTransform';

/**
 * Minimap painters. Terrain is cached at one pixel per tile and redrawn only
 * when it changes; fog, markers and the camera box are repainted on a slow
 * poll (a few times a second), never per frame.
 */

const CHROME_BG = '#0e080b';
const CHROME_TEXT = '#e8d8dc';
const ACCENT = '#c6ff3d';
const DANGER = '#ff3b3b';
/** The farm's pale bioluminescent mint: apart from the defender violet and the leaf pantry. */
export const FUNGUS_FARM_MINIMAP_COLOR = PAL.fungus.glow[2];

export interface MinimapCache {
  terrain: HTMLCanvasElement | null;
  overlay: HTMLCanvasElement | null;
  version: number;
}

export function createMinimapCache(): MinimapCache {
  return { terrain: null, overlay: null, version: -1 };
}

function tileCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** One minimap pixel of surface terrain: the terrain's base shade, flecked with its lighter one. */
export function surfaceTileColor(terrain: TerrainType, x: number, y: number): string {
  const colors = TERRAIN_COLORS[terrain] ?? TERRAIN_COLORS[TerrainType.Dirt];
  return (x * 7 + y * 13) % 5 === 0 ? colors.fleck : colors.base;
}

function blit(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, layout: MinimapLayout): void {
  ctx.drawImage(source, layout.offsetX, layout.offsetY, layout.width, layout.height);
}

function square(ctx: CanvasRenderingContext2D, layout: MinimapLayout, x: number, y: number, size: number, color: string, outline?: string): void {
  const p = tileToMinimap(layout, x, y);
  const px = Math.round(p.x - size / 2);
  const py = Math.round(p.y - size / 2);
  if (outline) {
    ctx.fillStyle = outline;
    ctx.fillRect(px - 1, py - 1, size + 2, size + 2);
  }
  ctx.fillStyle = color;
  ctx.fillRect(px, py, size, size);
}

function strokeView(ctx: CanvasRenderingContext2D, layout: MinimapLayout, view: { x: number; y: number; w: number; h: number }, unit: number): void {
  const rect = viewRectOnMinimap(layout, view);
  if (rect.w <= 0 || rect.h <= 0) return;
  ctx.strokeStyle = CHROME_TEXT;
  ctx.lineWidth = unit;
  ctx.strokeRect(
    Math.round(rect.x) + unit / 2,
    Math.round(rect.y) + unit / 2,
    Math.max(unit * 2, Math.round(rect.w) - unit),
    Math.max(unit * 2, Math.round(rect.h) - unit),
  );
}

/** Wave threats (the breach, the hive raid, the live wave): a red ring that throbs with `blink` */
function drawWavePings(
  ctx: CanvasRenderingContext2D,
  layout: MinimapLayout,
  threats: ReadonlyArray<{ x: number; y: number }>,
  unit: number,
  blink: boolean,
): void {
  if (threats.length === 0) return;
  ctx.strokeStyle = DANGER;
  ctx.lineWidth = unit;
  const r = unit * (blink ? 7 : 4);
  for (const t of threats) {
    const p = tileToMinimap(layout, t.x, t.y);
    ctx.strokeRect(Math.round(p.x - r) + unit / 2, Math.round(p.y - r) + unit / 2, r * 2 - unit, r * 2 - unit);
  }
}

const DOT_ORDER: Record<SurfaceMinimapDot['kind'], number> = { food: 0, den: 1, ant: 2, enemy: 3, nest: 4 };

/** Surface: terrain under fog of war, colony and visible enemies, nest, camera box. */
export function drawSurfaceMinimap(
  ctx: CanvasRenderingContext2D,
  gm: GameManager,
  cache: MinimapCache,
  unit: number,
  blink: boolean,
): MinimapLayout {
  const { width, height } = ctx.canvas;
  const layout = fitMinimap(WORLD_WIDTH, WORLD_HEIGHT, width, height);

  if (!cache.terrain) {
    cache.terrain = tileCanvas(WORLD_WIDTH, WORLD_HEIGHT);
    const tctx = cache.terrain.getContext('2d')!;
    const grid = gm.getSurfaceGrid();
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        const tile = grid.getTile(x, y);
        if (!tile) continue;
        tctx.fillStyle = surfaceTileColor(tile.terrain, x, y);
        tctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // Fog: unexplored is near-black (a faint silhouette, like the world view), explored-but-unwatched is dimmed, watched is clear
  cache.overlay ??= tileCanvas(WORLD_WIDTH, WORLD_HEIGHT);
  const octx = cache.overlay.getContext('2d')!;
  const image = octx.createImageData(WORLD_WIDTH, WORLD_HEIGHT);
  const fog = gm.getSurfaceFog();
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const i = (y * WORLD_WIDTH + x) * 4;
      image.data[i] = 14;
      image.data[i + 1] = 8;
      image.data[i + 2] = 11;
      image.data[i + 3] = !fog.isExplored(x, y) ? 215 : isTileVisible(fog, x, y) ? 0 : 130;
    }
  }
  octx.putImageData(image, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = CHROME_BG;
  ctx.fillRect(0, 0, width, height);
  blit(ctx, cache.terrain, layout);
  blit(ctx, cache.overlay, layout);

  const dots = gm.getSurfaceMinimapDots().sort((a, b) => DOT_ORDER[a.kind] - DOT_ORDER[b.kind]);
  for (const dot of dots) {
    switch (dot.kind) {
      case 'food': square(ctx, layout, dot.x, dot.y, unit, PAL.leaf[2]); break;
      case 'den': square(ctx, layout, dot.x, dot.y, unit * 3, PAL.beetleEye, CHROME_BG); break;
      case 'ant': square(ctx, layout, dot.x, dot.y, unit * 2, PAL.swarm.flesh[4]); break;
      case 'enemy': square(ctx, layout, dot.x, dot.y, unit * 3, DANGER, CHROME_BG); break;
      case 'nest': square(ctx, layout, dot.x, dot.y, unit * 5, blink ? ACCENT : PAL.swarm.vein[0], CHROME_BG); break;
    }
  }

  drawWavePings(ctx, layout, gm.getWaveThreats('surface'), unit, blink);
  strokeView(ctx, layout, gm.getSurfaceView(), unit);
  return layout;
}

const UNDERGROUND_DOT: Record<MinimapEntity['kind'], string> = {
  worker: PAL.swarm.flesh[4],
  soldier: PAL.swarm.flesh[3],
  scout: PAL.scout,
  nurse: PAL.nurse,
  defender: PAL.defender,
  queen: PAL.queen,
  invader: DANGER,
};

/** Underground: dug tunnels and chambers, dig orders, entrances, colony dots, camera box. */
export function drawUndergroundMinimap(
  ctx: CanvasRenderingContext2D,
  gm: GameManager,
  cache: MinimapCache,
  unit: number,
  blink = false,
): MinimapLayout {
  const { width, height } = ctx.canvas;
  const layout = fitMinimap(UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT, width, height);
  const grid = gm.getUndergroundGrid();

  const version = grid.getLayoutVersion();
  if (!cache.terrain || version !== cache.version) {
    cache.version = version;
    cache.terrain ??= tileCanvas(UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT);
    const tctx = cache.terrain.getContext('2d')!;
    for (let y = 0; y < UNDERGROUND_HEIGHT; y++) {
      for (let x = 0; x < UNDERGROUND_WIDTH; x++) {
        const tile = grid.getTile(x, y);
        if (!tile) continue;
        let color: string;
        if (!tile.walkable) {
          // Undiggable rock reads apart from plain earth: those pockets are the map's fixed constraints
          color = tile.terrain === UndergroundTerrainType.Reinforced ? PAL.stone[0] : PAL.earth[1];
        } else if (tile.chamberType === ChamberType.Queen) {
          color = PAL.queen;
        } else if (tile.chamberType === ChamberType.FoodStorage) {
          color = PAL.leaf[1];
        } else if (tile.chamberType === ChamberType.Incubation || tile.chamberType === ChamberType.Egg) {
          color = PAL.nurse;
        } else if (tile.chamberType === ChamberType.FungusFarm) {
          color = FUNGUS_FARM_MINIMAP_COLOR;
        } else if (tile.chamberType === ChamberType.Defense) {
          color = PAL.defender;
        } else {
          color = PAL.tunnel[2];
        }
        tctx.fillStyle = color;
        tctx.fillRect(x, y, 1, 1);
      }
    }
  }

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = CHROME_BG;
  ctx.fillRect(0, 0, width, height);
  blit(ctx, cache.terrain, layout);

  ctx.fillStyle = PAL.glowAmber;
  for (const job of gm.getUndergroundDigOrders()) {
    const p = tileToMinimap(layout, job.x, job.y);
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), Math.ceil(layout.scale), Math.ceil(layout.scale));
  }

  // Entrances: each is a forage artery AND a breach point, so they get a marker
  for (const entrance of gm.getUndergroundEntrances()) {
    const p = tileToMinimap(layout, entrance.x + 0.5, 0);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(Math.round(p.x) - unit * 2, layout.offsetY, unit * 4, unit * 2);
    ctx.fillRect(Math.round(p.x) - unit, layout.offsetY + unit * 2, unit * 2, unit * 4);
  }

  // Invaders and the queen drawn last so nothing covers them
  const entities = gm.getUndergroundEntities();
  for (const e of entities) {
    if (e.kind === 'queen' || e.kind === 'invader') continue;
    square(ctx, layout, e.x, e.y, unit * 2, UNDERGROUND_DOT[e.kind]);
  }
  for (const e of entities) {
    if (e.kind !== 'queen' && e.kind !== 'invader') continue;
    square(ctx, layout, e.x, e.y, unit * 4, UNDERGROUND_DOT[e.kind], CHROME_BG);
  }

  drawWavePings(ctx, layout, gm.getWaveThreats('underground'), unit, blink);
  strokeView(ctx, layout, gm.getUndergroundView(), unit);
  return layout;
}
