import { describe, expect, it } from 'vitest';
import css from '../../index.css?raw';
import {
  COMPACT_BUTTON_PX, CONSOLE_DECK_HEIGHT, HINT_LINE_PX, HUD_BARS, QUICK_BAR_PX, STRIP_HEIGHT, compactCardHeight, hudInsets, hudLayout, hudScale, mapShare,
} from './hudMetrics';

describe('HUD insets around the intro', () => {
  it('gives the world the whole window during the intro and the band between the bars after the fade', () => {
    expect(hudInsets(0)).toEqual({ top: 0, bottom: 0 });
    expect(hudInsets(1)).toEqual({ top: STRIP_HEIGHT, bottom: CONSOLE_DECK_HEIGHT });
  });

  it('eases in without a jump, so the camera glides into the band as the HUD fades in', () => {
    let last = hudInsets(0);
    for (let i = 1; i <= 10; i++) {
      const next = hudInsets(i / 10);
      expect(next.top).toBeGreaterThan(last.top);
      expect(next.bottom).toBeGreaterThan(last.bottom);
      // No tenth of the fade moves the band more than a fifth of the way
      expect(next.bottom - last.bottom).toBeLessThanOrEqual(CONSOLE_DECK_HEIGHT / 5);
      last = next;
    }
    // Slow out of the full window, so the first frames of the fade barely move the camera
    expect(hudInsets(0.1).bottom).toBeLessThan(CONSOLE_DECK_HEIGHT * 0.05);
  });

  it('holds the end states outside the fade', () => {
    expect(hudInsets(-0.5)).toEqual(hudInsets(0));
    expect(hudInsets(1.5)).toEqual(hudInsets(1));
  });
});

describe('HUD scale on big screens', () => {
  it('keeps 1280×720 (and anything up to just under twice that) at 1×', () => {
    expect(hudScale(1280, 720)).toBe(1);
    expect(hudScale(1920, 1080)).toBe(1);
    expect(hudScale(2559, 1440)).toBe(1);
    expect(hudScale(800, 600)).toBe(1);
    expect(hudScale(0, 0)).toBe(1);
  });

  it('steps up in whole multiples so the pixel font and borders stay crisp', () => {
    expect(hudScale(2560, 1440)).toBe(2);
    expect(hudScale(3840, 2160)).toBe(3);
    // A wide but short window is limited by its height
    expect(hudScale(3440, 1080)).toBe(1);
  });

  it('scales the bars the camera keeps clear by the same step', () => {
    expect(hudInsets(1, 2)).toEqual({ top: STRIP_HEIGHT * 2, bottom: CONSOLE_DECK_HEIGHT * 2 });
    expect(hudInsets(0, 2)).toEqual({ top: 0, bottom: 0 });
    expect(hudInsets(1)).toEqual(hudInsets(1, 1));
  });
});

describe('phone layouts', () => {
  it('keeps the desktop console on windows that can hold it', () => {
    expect(hudLayout(1280, 720)).toBe('desktop');
    expect(hudLayout(1024, 600)).toBe('desktop');
    expect(hudLayout(0, 0)).toBe('desktop');
  });

  it('stacks the HUD on a portrait phone and lowers the deck on a landscape one', () => {
    expect(hudLayout(390, 844)).toBe('phone-portrait');
    expect(hudLayout(412, 915)).toBe('phone-portrait');
    expect(hudLayout(844, 390)).toBe('phone-landscape');
    expect(hudLayout(915, 412)).toBe('phone-landscape');
    // A small tablet or a narrow desktop window in landscape still needs the compact deck
    expect(hudLayout(800, 600)).toBe('phone-landscape');
  });

  it('keeps the camera clear of the bars of the layout in use', () => {
    expect(hudInsets(1, 1, 'phone-portrait')).toEqual({ top: HUD_BARS['phone-portrait'].strip, bottom: HUD_BARS['phone-portrait'].deck });
    expect(hudInsets(1, 1, 'phone-landscape')).toEqual({ top: HUD_BARS['phone-landscape'].strip, bottom: HUD_BARS['phone-landscape'].deck });
    expect(hudInsets(1, 1, 'desktop')).toEqual(hudInsets(1));
  });
});

describe('compact HUD leaves the map most of the screen', () => {
  it('gives the map at least 68% of a portrait phone (iPhone 13 in Safari and full screen)', () => {
    expect(mapShare(390, 664)).toBeGreaterThanOrEqual(0.68);
    expect(mapShare(390, 844)).toBeGreaterThanOrEqual(0.75);
    expect(mapShare(412, 915)).toBeGreaterThanOrEqual(0.75);
  });

  it('gives the map at least 75% of a landscape phone', () => {
    expect(mapShare(844, 390)).toBeGreaterThanOrEqual(0.75);
    expect(mapShare(863, 360)).toBeGreaterThanOrEqual(0.75);
    expect(mapShare(667, 375)).toBeGreaterThanOrEqual(0.75);
  });

  it('keeps the desktop console as it was', () => {
    expect(HUD_BARS.desktop).toEqual({ strip: 30, deck: 140 });
    expect(mapShare(1280, 720)).toBeCloseTo((720 - 30 - 140) / 720);
  });

  it('still fits finger-sized command buttons: two rows under the hint line and the quick-select bar in portrait, one in landscape', () => {
    expect(COMPACT_BUTTON_PX).toBeGreaterThanOrEqual(40);
    expect(compactCardHeight(2)).toBeGreaterThanOrEqual(2 * COMPACT_BUTTON_PX);
    expect(QUICK_BAR_PX).toBeGreaterThanOrEqual(40);
    expect(HUD_BARS['phone-portrait'].deck).toBe(HINT_LINE_PX + QUICK_BAR_PX + compactCardHeight(2));
    // Landscape: the hint line and the bar float over the map, like the info bar did
    expect(HUD_BARS['phone-landscape'].deck).toBe(compactCardHeight(1));
  });

  it('the phone command bars take at most 10% more height than the compact HUD before them', () => {
    // Before the quick-select bar: a 32 px info bar over a 3-row card (portrait), a 1-row card (landscape)
    const before = { 'phone-portrait': 30 + 32 + compactCardHeight(3), 'phone-landscape': 28 + compactCardHeight(1) };
    for (const layout of ['phone-portrait', 'phone-landscape'] as const) {
      const bars = HUD_BARS[layout].strip + HUD_BARS[layout].deck;
      expect(bars, layout).toBeLessThanOrEqual(before[layout] * 1.1);
    }
  });

  it('keeps the camera clear of the notch and the home indicator on phones only', () => {
    const safe = { top: 47, bottom: 34 };
    expect(hudInsets(1, 1, 'phone-portrait', safe)).toEqual({
      top: HUD_BARS['phone-portrait'].strip + 47,
      bottom: HUD_BARS['phone-portrait'].deck + 34,
    });
    expect(hudInsets(0, 1, 'phone-portrait', safe)).toEqual({ top: 0, bottom: 0 });
    // The desktop HUD ignores safe areas, as its CSS does
    expect(hudInsets(1, 1, 'desktop', safe)).toEqual(hudInsets(1));
    expect(mapShare(390, 844, safe)).toBeGreaterThanOrEqual(0.65);
  });

  it('mirrors the bar sizes in index.css', () => {
    const rule = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThanOrEqual(0);
      return css.slice(at, css.indexOf('}', at));
    };
    const px = (block: string, name: string) => Number(block.match(new RegExp(`${name}:\\s*(\\d+)px`))?.[1]);
    const phone = rule('.hud-layer--phone');
    expect(px(phone, '--cmd-btn')).toBe(COMPACT_BUTTON_PX);
    expect(px(phone, '--hint-h')).toBe(HINT_LINE_PX);
    expect(px(phone, '--quick-h')).toBe(QUICK_BAR_PX);
    expect(px(rule('.hud-layer--phone-portrait'), '--strip-row')).toBe(HUD_BARS['phone-portrait'].strip);
    expect(px(rule('.hud-layer--phone-portrait'), '--card-h')).toBe(compactCardHeight(2));
    expect(px(rule('.hud-layer--phone-landscape'), '--strip-row')).toBe(HUD_BARS['phone-landscape'].strip);
    expect(px(rule('.hud-layer--phone-landscape'), '--card-h')).toBe(compactCardHeight(1));
  });
});
