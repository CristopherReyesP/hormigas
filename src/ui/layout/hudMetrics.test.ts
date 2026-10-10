import { describe, expect, it } from 'vitest';
import { CONSOLE_DECK_HEIGHT, STRIP_HEIGHT, hudInsets, hudScale } from './hudMetrics';

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
