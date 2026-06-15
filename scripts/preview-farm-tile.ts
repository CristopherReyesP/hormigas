// ASCII preview of the new farm bed texture (row 8) vs the pantry floor (row 3)
// — same fake-ctx technique used for the cricket sprite. Verifies the two tiles
// READ differently before any playtest.
import { PixelPainter } from '../src/engine/renderer/pixelart/PixelPainter';
import { PAL, hash2 } from '../src/engine/renderer/pixelart/palette';

function charGrid(w: number, h: number) {
  const grid: string[][] = Array.from({ length: h }, () => Array(w).fill('.'));
  let fillStyle = '';
  const colorChar = (c: string): string => {
    if (c === PAL.earth[0]) return '_';
    if (c === PAL.earth[2]) return ':';
    if (c === PAL.earth[3]) return '-';
    if (c === PAL.tunnel[1]) return ':';
    if (c === PAL.tunnel[2]) return ',';
    if (c === PAL.grass[0]) return 'g';
    if (c === PAL.glowGreen) return 'G';
    if (c === PAL.shroomStem) return 'm';
    if (c === PAL.shroomCapLight) return 'O';
    return '#';
  };
  const ctx = {
    set fillStyle(v: string) { fillStyle = v; },
    get fillStyle() { return fillStyle; },
    fillRect(x: number, y: number, fw: number, fh: number) {
      for (let yy = y; yy < y + fh; yy++) {
        for (let xx = x; xx < x + fw; xx++) {
          if (yy >= 0 && yy < h && xx >= 0 && xx < w) grid[yy][xx] = colorChar(fillStyle);
        }
      }
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, print: () => grid.map((r) => r.join('')).join('\n') };
}

// ── Row 3 (pantry floor): generic renderTile recipe ──
{
  const { ctx, print } = charGrid(16, 16);
  const p = new PixelPainter(ctx, 1);
  const col = 0, row = 3;
  p.rect(0, 0, 16, 16, PAL.tunnel[1]);
  const seed = col * 7 + row * 131;
  for (let i = 0; i < 14; i++) {
    const gx = Math.floor(hash2(seed, i * 3) * 16);
    const gy = Math.floor(hash2(seed, i * 3 + 1) * 16);
    p.px(gx, gy, hash2(seed, i * 3 + 2) < 0.5 ? PAL.grass[0] : PAL.tunnel[2]);
  }
  const pebbles = 2 + Math.floor(hash2(seed, 99) * 2);
  for (let i = 0; i < pebbles; i++) {
    const bx = 1 + Math.floor(hash2(seed + 1, i * 5) * 13);
    const by = 1 + Math.floor(hash2(seed + 1, i * 5 + 1) * 13);
    p.rect(bx, by, 2, 2, PAL.grass[0]);
    p.px(bx, by, PAL.tunnel[2]);
  }
  for (let i = 0; i < 3; i++) {
    const sx = 2 + Math.floor(hash2(seed + 2, i * 7) * 12);
    const sy = 2 + Math.floor(hash2(seed + 2, i * 7 + 1) * 12);
    p.px(sx, sy, PAL.glowGreen);
  }
  console.log('ROW 3 — pantry floor (despensa):');
  console.log(print());
}

console.log('');

// ── Row 8 (farm bed): the NEW recipe from RenderSystem ──
{
  const { ctx, print } = charGrid(16, 16);
  const i = 0;
  const p = new PixelPainter(ctx, 1);
  const seed = i * 7 + 8 * 131;
  p.rect(0, 0, 16, 16, PAL.earth[2]);
  for (const fy of [3, 8, 13]) {
    p.hline(0, fy, 16, PAL.earth[0]);
    p.hline(0, fy - 1, 16, PAL.earth[3]);
  }
  for (let k = 0; k < 9; k++) {
    const gx = Math.floor(hash2(seed, k * 3) * 16);
    const gy = Math.floor(hash2(seed, k * 3 + 1) * 16);
    p.px(gx, gy, PAL.shroomStem);
  }
  for (let k = 0; k < 2; k++) {
    const sx = 2 + Math.floor(hash2(seed + 5, k * 7) * 12);
    const sy = 2 + Math.floor(hash2(seed + 5, k * 7 + 1) * 12);
    p.px(sx, sy, PAL.shroomCapLight);
  }
  console.log('ROW 8 — farm bed (granja, NUEVA):');
  console.log(print());
  console.log('\nLegend: : base | _ furrow | - lit ridge | m mycelium | O spore | g/G pantry specks');
}
