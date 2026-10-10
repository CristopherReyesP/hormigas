// World-space art for the Crystal Hive rival: its hovering units (baked
// crystal sheets), its spires (crystal towers that grow a floor at a time),
// the hex ring a live shield shows and the cyan shield bar over the health bar.
// Pure canvas drawing; RenderSystem decides what is visible and where.

import { PAL } from '../../engine/renderer/pixelart/palette';
import { CRYSTAL_FRAME_MS, UNIT_ART_PX, bakeCrystalUnit, drawUnitFrame } from '../../engine/renderer/crystalUnits';
import type { CrystalStructureKind, CrystalUnitKind } from '../components/components';
import { buildSpire, type SpireArt } from './crystalDeployArt';
import { TILE_SIZE } from '../../shared/constants';

type Ctx = CanvasRenderingContext2D;

/** Spire columns by kind and floor count: each floor adds height (art px) */
function spireShape(kind: CrystalStructureKind, floors: number): { width: number; height: number; lean: 1 | -1 } {
  if (kind === 'extractor') return { width: 5, height: 8 + floors * 3, lean: -1 };
  return { width: kind === 'prism' ? 7 : 5, height: 12 + floors * 7, lean: kind === 'prism' ? -1 : 1 };
}

export class CrystalRivalArt {
  private unitFrames = new Map<CrystalUnitKind, OffscreenCanvas[]>();
  private spires = new Map<string, SpireArt>();

  /** Baked hover cycle of a unit kind, one canvas per frame (built on first use) */
  private framesOf(kind: CrystalUnitKind): OffscreenCanvas[] {
    let frames = this.unitFrames.get(kind);
    if (!frames) {
      frames = bakeCrystalUnit(kind).frames.map((frame) => {
        const canvas = new OffscreenCanvas(frame.width * UNIT_ART_PX, frame.height * UNIT_ART_PX);
        drawUnitFrame(canvas.getContext('2d')!, frame, 0, 0);
        return canvas;
      });
      this.unitFrames.set(kind, frames);
    }
    return frames;
  }

  /** A hovering Crystal unit with its shadow at (px, py); returns the sprite's top (world px) */
  drawUnit(ctx: Ctx, px: number, py: number, kind: CrystalUnitKind, entityId: number, time: number): number {
    const frames = this.framesOf(kind);
    // Per-entity phase so a wave does not bob in lockstep
    const frame = frames[(Math.floor((time * 1000) / CRYSTAL_FRAME_MS) + entityId) % frames.length];
    const top = Math.round(py - frame.height + TILE_SIZE * 0.35);
    ctx.drawImage(frame, Math.round(px - frame.width / 2), top);
    return top;
  }

  /** A spire seated on (px, py); returns its tip (world px) */
  drawSpire(ctx: Ctx, px: number, py: number, kind: CrystalStructureKind, floors: number): number {
    const key = `${kind}:${floors}`;
    let art = this.spires.get(key);
    if (!art) {
      const shape = spireShape(kind, floors);
      art = buildSpire(shape.width, shape.height, shape.lean);
      this.spires.set(key, art);
    }
    const left = Math.round(px - art.baseX);
    const top = Math.round(py + TILE_SIZE * 0.3 + art.baseBelow - art.body.height);
    ctx.drawImage(art.body, left, top);
    // Floor bands: one gold ring per floor above the first
    ctx.fillStyle = PAL.crystal.gold[1];
    const baseY = top + art.body.height - art.baseBelow;
    for (let f = 1; f < floors; f++) ctx.fillRect(Math.round(px) - 4, baseY - f * 14, 8, 2);
    return top;
  }

  /** A dotted cyan hex ring around a shielded unit, brighter right after a hit */
  drawShieldRing(ctx: Ctx, px: number, py: number, radius: number, ratio: number, hitRecently: boolean): void {
    if (ratio <= 0) return;
    ctx.globalAlpha = hitRecently ? 0.9 : 0.25 + 0.35 * ratio;
    ctx.fillStyle = hitRecently ? PAL.crystal.shell[4] : PAL.crystal.shield;
    const cy = py - radius * 0.35;
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2;
      const a1 = ((i + 1) / 6) * Math.PI * 2;
      for (let t = 0; t < 1; t += 0.25) {
        const x = px + Math.cos(a0) * radius * (1 - t) + Math.cos(a1) * radius * t;
        const y = cy + (Math.sin(a0) * (1 - t) + Math.sin(a1) * t) * radius * 0.6;
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The shield as a segmented cyan bar, the same size as the health bar */
  drawShieldBar(ctx: Ctx, frame: CanvasImageSource, px: number, y: number, current: number, max: number, scale = 1): void {
    const ratio = Math.max(0, Math.min(1, current / Math.max(1, max)));
    const w = 25 * scale;
    const x = Math.round(px - w / 2);
    ctx.drawImage(frame, x, Math.round(y), w, 4 * scale);
    let lit = Math.ceil(ratio * 6);
    if (current > 0 && lit === 0) lit = 1;
    ctx.fillStyle = PAL.crystal.shield;
    for (let i = 0; i < lit; i++) ctx.fillRect(x + (1 + i * 4) * scale, Math.round(y) + scale, 3 * scale, 2 * scale);
  }
}
