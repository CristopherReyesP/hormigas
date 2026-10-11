import { describe, expect, it } from 'vitest';
import { alertStackBox, alertStackCompact } from './alertStack';
import { HUD_BARS } from './layout/hudMetrics';

describe('alertStackBox', () => {
  it('hangs the banners right under the desktop strip, in the column between the objectives and the next-wave card', () => {
    const box = alertStackBox('desktop', 1);
    expect(box.top).toBeGreaterThan(HUD_BARS.desktop.strip);
    expect(box.top).toBeLessThanOrEqual(HUD_BARS.desktop.strip + 12);
    // Objectives: 10 px in, 272 px wide; next wave: 10 px in, 250 px wide
    expect(box.side).toBeGreaterThanOrEqual(10 + 272);
    expect(box.side).toBeGreaterThanOrEqual(10 + 250);
  });

  it('scales with the HUD on big windows', () => {
    const one = alertStackBox('desktop', 1);
    const two = alertStackBox('desktop', 2);
    expect(two.top).toBe(one.top * 2);
    expect(two.side).toBe(one.side * 2);
  });

  it('keeps clear of the objectives and the minimap on a landscape phone', () => {
    const box = alertStackBox('phone-landscape', 1);
    expect(box.top).toBeGreaterThan(HUD_BARS['phone-landscape'].strip);
    // Objectives: 6 px in, up to 200 px wide; minimap: 6 px in, 140 px wide
    expect(box.side).toBeGreaterThanOrEqual(6 + 200);
    expect(box.side).toBeGreaterThanOrEqual(6 + 140);
  });

  it('drops under the minimap on a portrait phone, which has no room beside it, clear of the MENÚ tab', () => {
    const box = alertStackBox('phone-portrait', 1);
    // Minimap: 6 px under the strip, 36 px of tabs over a 96 px map, plus its frame
    expect(box.top).toBeGreaterThanOrEqual(HUD_BARS['phone-portrait'].strip + 6 + 36 + 96 + 12);
    // Clear of the MENÚ tab on the left edge (44 px), and no narrower than that on the right
    expect(box.side).toBeGreaterThanOrEqual(44);
    expect(box.side).toBeLessThanOrEqual(60);
  });
});

describe('alertStackCompact', () => {
  it('tightens the banners on phones and on short desktop windows, so the column ends well above the console', () => {
    expect(alertStackCompact('phone-portrait', 1, 740)).toBe(true);
    expect(alertStackCompact('phone-landscape', 1, 390)).toBe(true);
    expect(alertStackCompact('desktop', 1, 600)).toBe(true);
    expect(alertStackCompact('desktop', 1, 720)).toBe(true);
  });

  it('keeps the full-size banners while the map between the bars is tall enough for them', () => {
    expect(alertStackCompact('desktop', 1, 900)).toBe(false);
    expect(alertStackCompact('desktop', 1, 1080)).toBe(false);
    // The bars double on a 2× HUD, the banners do not (they live outside it)
    expect(alertStackCompact('desktop', 2, 1440)).toBe(false);
  });
});
