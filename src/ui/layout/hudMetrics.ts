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
 * switches to a compact layout: a thin strip, a command card of icon-only
 * buttons along the bottom (3 rows in portrait, 1 in landscape), the info
 * panel folded to a one-line bar and a small minimap floating over the map.
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
 * Compact HUD sizes (CSS px). Command buttons stay finger-sized: 40 px is
 * under the 44 pt platform guideline but the usual size for dense game
 * controls, and every other touch target is at least 32 px. Mirrored by
 * --cmd-btn, --info-bar-h, --strip-row and --card-h in index.css.
 */
export const COMPACT_BUTTON_PX = 40;
/** Gap between command buttons */
export const COMPACT_BUTTON_GAP = 4;
/** Plate border (2) plus inner padding (4), on both sides */
export const COMPACT_CARD_FRAME = 12;
/** The one-line info summary over the portrait command card (a tap expands it) */
export const COMPACT_INFO_BAR_PX = 32;

/** Height of a compact command card with `rows` rows of buttons. */
export function compactCardHeight(rows: number): number {
  return rows * COMPACT_BUTTON_PX + (rows - 1) * COMPACT_BUTTON_GAP + COMPACT_CARD_FRAME;
}

/**
 * Top strip and bottom deck heights (CSS px at 1×) per layout, before safe
 * areas. Portrait reserves the info bar and a 3-row command card; landscape
 * only a one-row command card (the info bar and the minimap float over the
 * map). Mirrors --strip-h and --deck-h on .hud-layer--phone-* in index.css.
 */
export const HUD_BARS: Record<HudLayout, { strip: number; deck: number }> = {
  desktop: { strip: STRIP_HEIGHT, deck: CONSOLE_DECK_HEIGHT },
  'phone-portrait': { strip: 30, deck: COMPACT_INFO_BAR_PX + compactCardHeight(3) },
  'phone-landscape': { strip: 28, deck: compactCardHeight(1) },
};

const NO_INSETS: ScreenInsets = { top: 0, bottom: 0 };

/** Milliseconds the HUD takes to fade in once the intro ends or is skipped. Mirrors the .hud-layer transition. */
export const HUD_FADE_MS = 400;

/**
 * The bars' insets `reveal` of the way through the HUD fade-in: none while the
 * intro plays (the world takes the whole window, so the letterbox frames the
 * full screen), the full strip and deck of the `layout` at 1, both times the HUD `scale`. Smoothstep-eased, so the camera
 * glides from the window's center into the band instead of jumping.
 * Phone layouts also clear the `safe` areas (notch, home indicator), which
 * their bars grow by; the desktop HUD ignores them.
 */
export function hudInsets(reveal: number, scale = 1, layout: HudLayout = 'desktop', safe: ScreenInsets = NO_INSETS): ScreenInsets {
  const r = Math.max(0, Math.min(1, reveal));
  const eased = r * r * (3 - 2 * r);
  const bars = HUD_BARS[layout];
  const pad = layout === 'desktop' ? NO_INSETS : safe;
  return { top: (bars.strip * scale + pad.top) * eased, bottom: (bars.deck * scale + pad.bottom) * eased };
}

/** Share of a `width`×`height` window's height the map keeps between the HUD bars once the HUD is in. */
export function mapShare(width: number, height: number, safe: ScreenInsets = NO_INSETS): number {
  if (!(height > 0)) return 0;
  const insets = hudInsets(1, hudScale(width, height), hudLayout(width, height), safe);
  return Math.max(0, height - insets.top - insets.bottom) / height;
}
