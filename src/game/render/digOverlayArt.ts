// The dig tool's map overlay: which earth can be dug, what never can, the
// queue order of the pending marks with a ring for the ones being opened,
// and the preview of the tiles a stroke or the pointer would mark.

import { PAL } from '../../engine/renderer/pixelart/palette';
import { TILE_SIZE } from '../../shared/constants';
import { DigTileClass, type DigPreview } from '../dig/digStatus';

export interface DigOverlay {
  /** One DigTileClass per tile, row-major; cached until the layout changes */
  classes: Uint8Array;
  width: number;
  /** Pending marks in queue order (1 = next) and the opening progress, if any */
  jobs: ReadonlyArray<{ x: number; y: number; order: number; progress: number | null }>;
  /** Tiles the current (or a just-finished) stroke tried to mark */
  preview: ReadonlyArray<{ x: number; y: number; state: Exclude<DigPreview, 'invalid'> }>;
  /** The tile under the mouse and how it would take a mark (desktop) */
  hover: { x: number; y: number; state: DigPreview } | null;
}

const PREVIEW_OK = '#7cff6b';
const PREVIEW_OVER = '#ff4b4b';
const DIGGABLE_TINT = 'rgba(124, 255, 107, 0.07)';
const DIGGABLE_DOT = 'rgba(124, 255, 107, 0.45)';
const ENTRANCE_TINT = 'rgba(255, 196, 64, 0.16)';
const ENTRANCE_DOT = 'rgba(255, 196, 64, 0.7)';
const BLOCKED_TINT = 'rgba(0, 0, 0, 0.45)';
const HATCH = 'rgba(255, 75, 75, 0.35)';

// 3×5 digits for the queue order (the banner font has no numbers)
const DIGITS: readonly string[] = [
  '111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001010010', '111101111101111', '111101111001111',
];

function drawNumber(ctx: CanvasRenderingContext2D, n: number, cx: number, cy: number, scale: number): void {
  const text = String(n);
  const w = text.length * 4 * scale - scale;
  const x0 = Math.round(cx - w / 2);
  const y0 = Math.round(cy - (5 * scale) / 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(x0 - scale, y0 - scale, w + 2 * scale, 7 * scale);
  ctx.fillStyle = PAL.glowAmber;
  for (let i = 0; i < text.length; i++) {
    const bits = DIGITS[text.charCodeAt(i) - 48];
    const gx = x0 + i * 4 * scale;
    for (let b = 0; b < 15; b++) {
      if (bits[b] === '1') ctx.fillRect(gx + (b % 3) * scale, y0 + Math.floor(b / 3) * scale, scale, scale);
    }
  }
}

/** Draw the overlay over the visible tile window [x0, x1) × [y0, y1), in world space */
export function drawDigOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: DigOverlay,
  x0: number, y0: number, x1: number, y1: number,
): void {
  const T = TILE_SIZE;
  const { classes, width } = overlay;

  // Area: a faint green on diggable earth, amber on the entrance row,
  // dark with a red hatch on rock and the map edge
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const cls = classes[y * width + x];
      if (cls === DigTileClass.Open) continue;
      const px = x * T;
      const py = y * T;
      if (cls === DigTileClass.Diggable || cls === DigTileClass.Entrance) {
        // A faint wash plus a center dot: the dot grid reads even on dark earth
        const entrance = cls === DigTileClass.Entrance;
        ctx.fillStyle = entrance ? ENTRANCE_TINT : DIGGABLE_TINT;
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = entrance ? ENTRANCE_DOT : DIGGABLE_DOT;
        ctx.fillRect(px + T / 2 - 2, py + T / 2 - 2, 4, 4);
      } else {
        ctx.fillStyle = BLOCKED_TINT;
        ctx.fillRect(px, py, T, T);
        // Two diagonal strokes of 2px blocks: reads as "no" at any zoom
        ctx.fillStyle = HATCH;
        for (let i = 0; i < T; i += 2) {
          ctx.fillRect(px + i, py + i, 2, 2);
          ctx.fillRect(px + ((i + T / 2) % T), py + i, 2, 2);
        }
      }
    }
  }

  // Queue order, and a ring that fills while the tile is being opened
  const scale = Math.max(1, Math.round(T / 16));
  for (const job of overlay.jobs) {
    if (job.x < x0 || job.x >= x1 || job.y < y0 || job.y >= y1) continue;
    const cx = job.x * T + T / 2;
    const cy = job.y * T + T / 2;
    if (job.progress !== null) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.beginPath();
      ctx.arc(cx, cy, T / 2 - 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = PREVIEW_OK;
      ctx.beginPath();
      ctx.arc(cx, cy, T / 2 - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * job.progress);
      ctx.stroke();
    }
    drawNumber(ctx, job.order, cx, cy, scale);
  }

  // What a stroke marked (green) or could not (red: over the limit)
  ctx.lineWidth = 2;
  for (const p of overlay.preview) {
    ctx.strokeStyle = p.state === 'ok' ? PREVIEW_OK : PREVIEW_OVER;
    ctx.strokeRect(p.x * T + 1, p.y * T + 1, T - 2, T - 2);
    if (p.state === 'over') {
      ctx.fillStyle = 'rgba(255, 75, 75, 0.25)';
      ctx.fillRect(p.x * T, p.y * T, T, T);
    }
  }

  const hover = overlay.hover;
  if (hover) {
    ctx.strokeStyle = hover.state === 'ok' ? PREVIEW_OK : hover.state === 'over' ? PREVIEW_OVER : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(hover.x * T + 1, hover.y * T + 1, T - 2, T - 2);
  }
}
