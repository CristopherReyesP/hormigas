import type { ScreenInsets } from './canvasFit';

/**
 * HUD bar sizes in CSS px. Mirrors --strip-h and --deck-h in index.css: the
 * camera centers and clamps the world inside the band these bars leave open.
 */
export const STRIP_HEIGHT = 30;
/** Full-width part of the bottom console; the minimap and command card rise above it. */
export const CONSOLE_DECK_HEIGHT = 140;

/** Milliseconds the HUD takes to fade in once the intro ends or is skipped. Mirrors the .hud-layer transition. */
export const HUD_FADE_MS = 400;

/**
 * The bars' insets `reveal` of the way through the HUD fade-in: none while the
 * intro plays (the world takes the whole window, so the letterbox frames the
 * full screen), the full strip and deck at 1. Smoothstep-eased, so the camera
 * glides from the window's center into the band instead of jumping.
 */
export function hudInsets(reveal: number): ScreenInsets {
  const r = Math.max(0, Math.min(1, reveal));
  const eased = r * r * (3 - 2 * r);
  return { top: STRIP_HEIGHT * eased, bottom: CONSOLE_DECK_HEIGHT * eased };
}
