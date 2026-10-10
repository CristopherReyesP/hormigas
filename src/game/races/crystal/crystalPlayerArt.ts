// World-space art for the player's Crystal Hive: the Hive's crown of spires
// (the rival's comes from the meteor intro's crater), structures growing out
// of the ground as they crystallize, the build ghost and the rally line.
// Pure canvas drawing; RenderSystem decides when.

import { PAL } from '../../../engine/renderer/pixelart/palette';
import { TILE_SIZE } from '../../../shared/constants';
import type { CrystalStructureKind } from '../../components/components';
import type { CrystalRivalArt } from '../../render/crystalRivalArt';
import type { CrystalOverlay } from './CrystalPlayerController';
import { constructionProgress, type ConstructionComponent } from './crystalPlayerComponents';
import { CRYSTAL_PLAYER_ECONOMY } from './crystalPlayerRules';

type Ctx = CanvasRenderingContext2D;

const center = (tile: number): number => tile * TILE_SIZE + TILE_SIZE / 2;

/** The Hive's crown: a tall central prism among smaller towers, back to front */
export const HIVE_CROWN: ReadonlyArray<{ dx: number; dy: number; kind: CrystalStructureKind; floors: number }> = [
  { dx: -20, dy: -8, kind: 'forge', floors: 2 },
  { dx: 20, dy: -8, kind: 'forge', floors: 2 },
  { dx: 0, dy: -4, kind: 'prism', floors: 3 },
  { dx: -12, dy: 8, kind: 'extractor', floors: 2 },
  { dx: 13, dy: 9, kind: 'extractor', floors: 1 },
];

/** The Hive drawn as a cluster of crystal towers around its core (px, py are world px) */
export function drawHiveCrown(ctx: Ctx, art: CrystalRivalArt, px: number, py: number): void {
  for (const spire of HIVE_CROWN) art.drawSpire(ctx, px + spire.dx, py + spire.dy, spire.kind, spire.floors);
}

/**
 * A structure: whole when finished. While it crystallizes it rises out of
 * the ground (a faint full-size outline shows what it will be) with a cyan
 * progress bar at its foot; a new floor grows on top of the standing spire.
 * Returns the top of what is drawn (world px).
 */
export function drawGrowingSpire(
  ctx: Ctx,
  art: CrystalRivalArt,
  px: number,
  py: number,
  kind: CrystalStructureKind,
  floors: number,
  construction: ConstructionComponent | undefined,
  time: number,
): number {
  if (!construction) return art.drawSpire(ctx, px, py, kind, floors);
  const growth = constructionProgress(construction);
  const target = construction.kind === 'floor' ? floors + 1 : floors;
  const span = art.spireSpan(py, kind, target);
  let from = span.bottom;
  if (construction.kind === 'floor') {
    art.drawSpire(ctx, px, py, kind, floors);
    from = art.spireSpan(py, kind, floors).top;
  }
  // The outline of what it grows into, pulsing
  ctx.globalAlpha = 0.18 + 0.1 * Math.sin(time * 4);
  art.drawSpire(ctx, px, py, kind, target);
  ctx.globalAlpha = 1;
  // The grown part, rising from the ground (or from the old tip)
  const clipTop = Math.round(from - (from - span.top) * growth);
  ctx.save();
  ctx.beginPath();
  ctx.rect(px - TILE_SIZE * 2, clipTop, TILE_SIZE * 4, span.bottom - clipTop + 4);
  ctx.clip();
  art.drawSpire(ctx, px, py, kind, target);
  ctx.restore();
  // Progress bar at its foot
  const w = 24;
  const x = Math.round(px - w / 2);
  const y = Math.round(py + TILE_SIZE * 0.6);
  ctx.fillStyle = PAL.crystal.outline;
  ctx.fillRect(x - 1, y - 1, w + 2, 4);
  ctx.fillStyle = PAL.crystal.shield;
  ctx.fillRect(x, y, Math.round(w * growth), 2);
  return span.top;
}

/** A dotted ring of `radius` world px around (px, py) */
function dottedRing(ctx: Ctx, px: number, py: number, radius: number, color: string): void {
  ctx.fillStyle = color;
  const steps = Math.max(12, Math.round(radius / 4));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.fillRect(Math.round(px + Math.cos(a) * radius) - 1, Math.round(py + Math.sin(a) * radius * 0.6) - 1, 2, 2);
  }
}

/** The build ghost under the pointer (green where it fits, red where not) and the selected spire's rally line */
export function drawCrystalOverlay(ctx: Ctx, overlay: CrystalOverlay, art: CrystalRivalArt, time: number): void {
  const { ghost, rally } = overlay;
  if (rally) {
    const ax = center(rally.from.x);
    const ay = center(rally.from.y);
    const bx = center(rally.to.x);
    const by = center(rally.to.y);
    const len = Math.hypot(bx - ax, by - ay);
    ctx.fillStyle = PAL.crystal.shield;
    for (let d = 0; d < len; d += 8) {
      const f = d / len;
      ctx.fillRect(Math.round(ax + (bx - ax) * f) - 1, Math.round(ay + (by - ay) * f) - 1, 2, 2);
    }
    // A small banner on the rally tile
    ctx.fillStyle = PAL.crystal.gold[1];
    ctx.fillRect(Math.round(bx) - 1, Math.round(by) - 14, 2, 14);
    ctx.fillStyle = PAL.crystal.shield;
    ctx.fillRect(Math.round(bx) + 1, Math.round(by) - 14, 7, 5);
  }
  if (!ghost) return;
  const px = center(ghost.x);
  const py = center(ghost.y);
  const tint = ghost.valid ? '#5fff7a' : '#ff3b3b';
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = tint;
  ctx.fillRect(ghost.x * TILE_SIZE - TILE_SIZE, ghost.y * TILE_SIZE - TILE_SIZE, TILE_SIZE * 3, TILE_SIZE * 3);
  ctx.globalAlpha = ghost.valid ? 0.55 + 0.15 * Math.sin(time * 6) : 0.35;
  art.drawSpire(ctx, px, py, ghost.kind, 1);
  ctx.globalAlpha = 1;
  if (ghost.kind === 'extractor') dottedRing(ctx, px, py, CRYSTAL_PLAYER_ECONOMY.extractorRadius * TILE_SIZE, tint);
}
