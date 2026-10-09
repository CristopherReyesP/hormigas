import { describe, expect, it } from 'vitest';
import { GLYPH_H, GLYPH_W, glyphRows, hasGlyph, textWidth } from './PixelFont';
import { INTRO_TITLE } from '../../../game/render/introTimeline';

describe('PixelFont (5×7 bitmap)', () => {
  it('can spell the intro title', () => {
    for (const ch of INTRO_TITLE) expect(hasGlyph(ch)).toBe(true);
  });

  it('has every capital letter, each a full 5×7 cell with ink', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const rows = glyphRows(ch);
      expect(rows).toHaveLength(GLYPH_H);
      for (const row of rows) expect(row).toHaveLength(GLYPH_W);
      expect(rows.join('')).toContain('1');
    }
  });

  it('measures text as 5 px glyphs with a 1 px gap, times the scale', () => {
    expect(textWidth('A', 4)).toBe(5 * 4);
    expect(textWidth('AB', 1)).toBe(11);
    expect(textWidth(INTRO_TITLE, 2)).toBe((INTRO_TITLE.length * 6 - 1) * 2);
    expect(textWidth('', 3)).toBe(0);
  });
});
