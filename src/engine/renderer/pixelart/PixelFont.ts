// PixelFont — a 5×7 bitmap capital font for on-canvas banners (intro title,
// later the victory banner). Each glyph is 7 rows of 5 bits, '1' = ink.
// Drawn with fillRect blocks only, so it scales by whole pixels and never blurs.

export const GLYPH_W = 5;
export const GLYPH_H = 7;
/** Glyph width plus a 1-pixel gap */
const ADVANCE = GLYPH_W + 1;

const FONT_5X7: Record<string, string> = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 10001 01010 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  ':': '00000 01100 01100 00000 01100 01100 00000',
  ' ': '00000 00000 00000 00000 00000 00000 00000',
};

export function hasGlyph(ch: string): boolean {
  return ch in FONT_5X7;
}

/** The glyph's 7 rows (unknown characters render as a blank cell). */
export function glyphRows(ch: string): string[] {
  return (FONT_5X7[ch] ?? FONT_5X7[' ']).split(' ');
}

/** Width in canvas px of `text` at `scale` px per font pixel (no trailing gap). */
export function textWidth(text: string, scale: number): number {
  return text.length === 0 ? 0 : (text.length * ADVANCE - 1) * scale;
}

/**
 * Draw `text` with its top-left corner at (x, y), `scale` px per font pixel.
 * `color` may vary by glyph row (0 = top) for stepped, bevel-like shading.
 */
export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: string | ((row: number) => string),
): void {
  for (let i = 0; i < text.length; i++) {
    const rows = glyphRows(text[i]);
    const gx = x + i * ADVANCE * scale;
    for (let r = 0; r < GLYPH_H; r++) {
      ctx.fillStyle = typeof color === 'string' ? color : color(r);
      for (let c = 0; c < GLYPH_W; c++) {
        if (rows[r][c] === '1') ctx.fillRect(gx + c * scale, y + r * scale, scale, scale);
      }
    }
  }
}
