// Where the banner column under the top strip sits (AlertStack in App.tsx).
//
// Every banner that hangs from the top (the full-pantry note, the boss bar,
// the wave warning or counter, the wave announcement, the nest alert and the
// night milestone) flows in this one column, so they stack instead of
// covering each other, and the column keeps clear of the strip and of the
// panels in the top corners.

import { HUD_BARS, type HudLayout } from './layout/hudMetrics';

/** Gap between the strip (or the corner panels) and the first banner */
const GAP = 8;
/** Desktop corners: OBJETIVOS (10 px in, 272 px wide) and Próxima oleada (10 px in, 250 px wide); mirrors index.css */
const DESKTOP_CORNER = 10 + 272;
/** Phone corners: OBJETIVOS and Próxima oleada (6 px in, up to 200 px), the minimap (6 px in, 140 px); mirrors index.css */
const PHONE_CORNER = 6 + 200;
/** Portrait: the minimap under the strip (6 px down, 36 px tabs, 96 px map, padding and frame) */
const PORTRAIT_MINIMAP = 6 + 36 + 96 + 16;
/** The MENÚ tab on the left edge, mid-height (save.css); the column keeps clear of it on both sides */
const MENU_TAB = 44;

export interface AlertStackBox {
  /** Top of the column, CSS px (phones add the safe area in CSS) */
  top: number;
  /** Inset of the column from each side, CSS px */
  side: number;
}

/** The banner column for a HUD `layout` at a whole-number HUD `scale`. */
export function alertStackBox(layout: HudLayout, scale = 1): AlertStackBox {
  const strip = HUD_BARS[layout].strip;
  if (layout === 'phone-portrait') {
    // No room beside the minimap: the column starts under it, clear of the MENÚ tab
    return { top: (strip + PORTRAIT_MINIMAP + GAP) * scale, side: (MENU_TAB + GAP) * scale };
  }
  const corner = layout === 'desktop' ? DESKTOP_CORNER : PHONE_CORNER;
  return { top: (strip + GAP) * scale, side: (corner + GAP) * scale };
}

/** Height (CSS px) the map needs between the bars for the full-size banners */
const ROOMY_MAP = 640;

/**
 * Whether the column takes its tight look (smaller titles, the nest alert on
 * one row): always on phones, and on desktop windows whose map, between the
 * strip and the console, is too short for the full-size banners to stay
 * clear of the message feed over the console.
 */
export function alertStackCompact(layout: HudLayout, scale: number, height: number): boolean {
  if (layout !== 'desktop') return true;
  const bars = HUD_BARS.desktop;
  return height - (bars.strip + bars.deck) * scale < ROOMY_MAP;
}
