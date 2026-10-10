import { describe, expect, it } from 'vitest';
import { BUBBLE_MAX_WIDTH, placeArrow, placeBubble, type Rect } from './placement';

const PHONE = { width: 390, height: 844 };
const PHONE_BARS = { top: 30, bottom: 32 + 140 };
const LANDSCAPE = { width: 844, height: 390 };
const LANDSCAPE_BARS = { top: 28, bottom: 52 };

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

describe('bubble placement', () => {
  it('fits a phone screen with a margin and stays out of the HUD bars', () => {
    const p = placeBubble(PHONE, PHONE_BARS, 150, null);
    expect(p.width).toBe(PHONE.width - 16);
    expect(p.left).toBe(8);
    expect(p.top).toBeGreaterThanOrEqual(PHONE_BARS.top);
  });

  it('is never wider than its maximum on desktop', () => {
    expect(placeBubble({ width: 1440, height: 900 }, { top: 30, bottom: 140 }, 150, null).width).toBe(BUBBLE_MAX_WIDTH);
  });

  it('a command button at the bottom sends the bubble to the top', () => {
    const button: Rect = { left: 300, top: 700, width: 40, height: 40 };
    const p = placeBubble(PHONE, PHONE_BARS, 160, button);
    expect(p.side).toBe('top');
    expect(overlaps({ ...p, height: 160 }, button)).toBe(false);
  });

  it('a target near the top sends the bubble down, above the console', () => {
    const tab: Rect = { left: 10, top: 40, width: 80, height: 30 };
    const p = placeBubble(PHONE, PHONE_BARS, 160, tab);
    expect(p.side).toBe('bottom');
    expect(p.top + 160).toBeLessThanOrEqual(PHONE.height - PHONE_BARS.bottom);
    expect(overlaps({ ...p, height: 160 }, tab)).toBe(false);
  });

  it('on a landscape phone it picks the side that leaves the target uncovered', () => {
    const den: Rect = { left: 400, top: 60, width: 40, height: 40 };
    const p = placeBubble(LANDSCAPE, LANDSCAPE_BARS, 110, den);
    expect(overlaps({ ...p, height: 110 }, den)).toBe(false);
  });

  it('when both sides touch the target, it covers the least of it', () => {
    const big: Rect = { left: 0, top: 100, width: 390, height: 500 };
    const p = placeBubble(PHONE, PHONE_BARS, 200, big);
    expect(['top', 'bottom']).toContain(p.side);
  });
});

describe('arrow placement', () => {
  it('points down at a target low on screen and up at one near the top', () => {
    expect(placeArrow({ left: 100, top: 700, width: 40, height: 40 }, 844)).toEqual({ x: 120, y: 696, pointing: 'down' });
    expect(placeArrow({ left: 0, top: 40, width: 80, height: 30 }, 844)).toEqual({ x: 40, y: 74, pointing: 'up' });
  });
});
