/**
 * Where Hormi's speech bubble and the bouncing arrow go (CSS px), so the
 * bubble never covers what it points at. Pure: the overlay measures, this decides.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BubblePlacement {
  left: number;
  top: number;
  width: number;
  /** Which end of the free band it sits at */
  side: 'top' | 'bottom';
}

/** Space kept between the bubble and the screen edges, the HUD bars and the target */
export const BUBBLE_MARGIN = 8;
/** Widest bubble; phones get the screen width minus the margins */
export const BUBBLE_MAX_WIDTH = 420;

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Put the bubble at the top or the bottom of the band the HUD bars leave
 * free (never over the command card), on the side away from the target;
 * when both sides touch the target, the side that covers less of it.
 */
export function placeBubble(
  viewport: { width: number; height: number },
  bars: { top: number; bottom: number },
  bubbleHeight: number,
  target: Rect | null,
): BubblePlacement {
  const m = BUBBLE_MARGIN;
  const width = Math.max(0, Math.min(BUBBLE_MAX_WIDTH, viewport.width - 2 * m));
  const left = Math.round((viewport.width - width) / 2);
  const topY = bars.top + m;
  const bottomY = Math.max(topY, viewport.height - bars.bottom - m - bubbleHeight);
  const at = (side: 'top' | 'bottom'): BubblePlacement => ({ left, width, side, top: side === 'top' ? topY : bottomY });
  if (!target) return at('top');
  const padded: Rect = { left: target.left - m, top: target.top - m, width: target.width + 2 * m, height: target.height + 2 * m };
  const cover = (p: BubblePlacement) => overlap({ left: p.left, top: p.top, width: p.width, height: bubbleHeight }, padded);
  // The side away from the target first: a target in the upper half sends the bubble down
  const targetMid = target.top + target.height / 2;
  const prefer: Array<'top' | 'bottom'> = targetMid < viewport.height / 2 ? ['bottom', 'top'] : ['top', 'bottom'];
  const [first, second] = prefer.map(at);
  if (cover(first) === 0) return first;
  if (cover(second) === 0) return second;
  return cover(first) <= cover(second) ? first : second;
}

export interface ArrowPlacement {
  /** Tip of the arrow (CSS px) */
  x: number;
  y: number;
  /** The arrow points down at the target from above, or up at it from below */
  pointing: 'down' | 'up';
}

/** The bouncing arrow over a HUD target: above it, or below it when it sits at the top of the screen. */
export function placeArrow(target: Rect, viewportHeight: number): ArrowPlacement {
  const x = target.left + target.width / 2;
  if (target.top > viewportHeight * 0.25) return { x, y: target.top - 4, pointing: 'down' };
  return { x, y: target.top + target.height + 4, pointing: 'up' };
}
