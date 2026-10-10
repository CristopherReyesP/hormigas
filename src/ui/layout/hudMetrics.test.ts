import { describe, expect, it } from 'vitest';
import { CONSOLE_DECK_HEIGHT, STRIP_HEIGHT, hudInsets } from './hudMetrics';

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
