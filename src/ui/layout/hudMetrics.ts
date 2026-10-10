import type { ScreenInsets } from './canvasFit';

/**
 * HUD bar sizes in CSS px. Mirrors --strip-h and --deck-h in index.css: the
 * camera centers and clamps the world inside the band these bars leave open.
 */
export const STRIP_HEIGHT = 30;
/** Full-width part of the bottom console; the minimap and command card rise above it. */
export const CONSOLE_DECK_HEIGHT = 140;

/** The window the HUD is laid out for at 1×: bigger windows scale it up in whole steps. */
export const HUD_BASE_WIDTH = 1280;
export const HUD_BASE_HEIGHT = 720;

/**
 * Whole-number HUD scale for a window of `width`×`height` CSS px: 1× up to
 * twice 1280×720, 2× from 2560×1440, 3× from 3840×2160. Whole steps keep the
 * pixel font and the 2 px borders crisp; the smaller side ratio wins, so a
 * wide but short window never pushes the console off the bottom.
 */
export function hudScale(width: number, height: number): number {
  return Math.max(1, Math.floor(Math.min(width / HUD_BASE_WIDTH, height / HUD_BASE_HEIGHT)));
}

/**
 * Phone layouts. A window narrower than PHONE_MAX_WIDTH or shorter than
 * PHONE_MAX_HEIGHT (CSS px) cannot hold the 1280×720 console, so the HUD
 * switches to a compact layout: stacked in portrait (minimap and info over
 * a full-width command card), a low deck in landscape.
 */
export type HudLayout = 'desktop' | 'phone-portrait' | 'phone-landscape';
export const PHONE_MAX_WIDTH = 820;
export const PHONE_MAX_HEIGHT = 500;

export function hudLayout(width: number, height: number): HudLayout {
  if (!(width > 0) || !(height > 0)) return 'desktop';
  if (width >= PHONE_MAX_WIDTH && height >= PHONE_MAX_HEIGHT) return 'desktop';
  return height > width ? 'phone-portrait' : 'phone-landscape';
}

/**
 * Top strip and bottom deck heights (CSS px at 1×) per layout. Mirrors
 * --strip-h and --deck-h on .hud-layer--phone-* in index.css.
 */
export const HUD_BARS: Record<HudLayout, { strip: number; deck: number }> = {
  desktop: { strip: STRIP_HEIGHT, deck: CONSOLE_DECK_HEIGHT },
  'phone-portrait': { strip: 52, deck: 332 },
  'phone-landscape': { strip: 30, deck: 112 },
};

/** Milliseconds the HUD takes to fade in once the intro ends or is skipped. Mirrors the .hud-layer transition. */
export const HUD_FADE_MS = 400;

/**
 * The bars' insets `reveal` of the way through the HUD fade-in: none while the
 * intro plays (the world takes the whole window, so the letterbox frames the
 * full screen), the full strip and deck of the `layout` at 1, both times the HUD `scale`. Smoothstep-eased, so the camera
 * glides from the window's center into the band instead of jumping.
 */
export function hudInsets(reveal: number, scale = 1, layout: HudLayout = 'desktop'): ScreenInsets {
  const r = Math.max(0, Math.min(1, reveal));
  const eased = r * r * (3 - 2 * r);
  const bars = HUD_BARS[layout];
  return { top: bars.strip * scale * eased, bottom: bars.deck * scale * eased };
}
