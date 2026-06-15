// ASCII preview: chamber floors as MATERIAL sprites (same paint code as RenderSystem).
// Storage = carpet of leaves, Incubation = straw bedding, Queen = woven mat, Defense = cobble.
import { PixelPainter } from '../src/engine/renderer/pixelart/PixelPainter';
import { PAL, hash2 } from '../src/engine/renderer/pixelart/palette';

function paintToGrid(paint: (p: PixelPainter) => void): string[][] {
  const grid: string[][] = Array.from({ length: 16 }, () => Array(16).fill('.'));
  let fillStyle = '';
  const ch = (c: string): string => {
    if (c === PAL.leaf[0]) return 'L';
    if (c === PAL.leaf[1]) return 'l';
    if (c === PAL.leaf[2]) return '!';
    if (c === PAL.grass[0]) return 'v'; // vein
    if (c === PAL.wood[0]) return '_';
    if (c === PAL.wood[1]) return 'w';
    if (c === PAL.wood[2]) return '=';
    if (c === PAL.queen) return 'Q';
    if (c === PAL.glowAmber) return '*';
    if (c === PAL.tunnel[0]) return ',';
    if (c === PAL.tunnel[1]) return ':';
    if (c === PAL.sand[0]) return 's';
    if (c === PAL.sand[1]) return 'S';
    if (c === PAL.sand[2]) return '$';
    if (c === PAL.stone[0]) return 'o';
    if (c === PAL.stone[1]) return 'O';
    if (c === PAL.black) return '#';
    return '?';
  };
  const ctx = {
    set fillStyle(v: string) { fillStyle = v; },
    get fillStyle() { return fillStyle; },
    fillRect(x: number, y: number, w: number, h: number) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        if (yy >= 0 && yy < 16 && xx >= 0 && xx < 16) grid[yy][xx] = ch(fillStyle);
      }
    },
  } as unknown as CanvasRenderingContext2D;
  paint(new PixelPainter(ctx, 1));
  return grid;
}

const paintLeaf = (p: PixelPainter, x: number, y: number, vertical: boolean, shade: number) => {
  const body = shade === 0 ? PAL.leaf[0] : PAL.leaf[1];
  const lit = shade === 0 ? PAL.leaf[1] : PAL.leaf[2];
  if (vertical) {
    p.rect(x + 1, y, 1, 5, lit);
    p.rect(x, y + 1, 3, 3, body);
    p.vline(x + 1, y + 1, 3, PAL.grass[0]);
    p.px(x + 1, y + 5, PAL.wood[1]);
  } else {
    p.rect(x, y + 1, 5, 1, lit);
    p.rect(x + 1, y, 3, 3, body);
    p.hline(x + 1, y + 1, 3, PAL.grass[0]);
    p.px(x + 5, y + 1, PAL.wood[1]);
  }
};

const i = 0;
const floors: Array<{ name: string; grid: string[][] }> = [];

floors.push({ name: 'ALMACÉN (hojas)', grid: paintToGrid((p) => {
  const seed = i * 7 + 3 * 131;
  p.rect(0, 0, 16, 16, PAL.tunnel[1]);
  for (let k = 0; k < 6; k++) {
    const cellX = (k % 2) * 7;
    const cellY = Math.floor(k / 2) * 5;
    const lx = cellX + Math.floor(hash2(seed, k * 5) * 5);
    const ly = cellY + Math.floor(hash2(seed, k * 5 + 1) * 2);
    paintLeaf(p, lx, ly, hash2(seed, k * 5 + 2) < 0.5, k % 2);
  }
}) });

floors.push({ name: 'INCUBACIÓN (paja)', grid: paintToGrid((p) => {
  const seed = i * 7 + 4 * 131;
  p.rect(0, 0, 16, 16, PAL.tunnel[0]);
  for (let k = 0; k < 8; k++) {
    const sx = (k % 2) * 6 + Math.floor(hash2(seed, k * 3) * 5);
    const sy = k * 2 + Math.floor(hash2(seed, k * 3 + 1) * 2);
    p.hline(sx, sy, 4 + Math.floor(hash2(seed, k * 3 + 2) * 3), PAL.sand[0]);
  }
  for (let k = 0; k < 6; k++) {
    const sx = ((k + 1) % 2) * 6 + Math.floor(hash2(seed + 17, k * 3) * 5);
    const sy = k * 2 + 1 + Math.floor(hash2(seed + 17, k * 3 + 1) * 2);
    if (k % 3 === 2) p.vline(sx, sy, 4, PAL.sand[1]);
    else p.hline(sx, sy, 5, PAL.sand[1]);
    p.px(sx, sy, PAL.sand[2]);
  }
}) });

floors.push({ name: 'TRONO (tejido)', grid: paintToGrid((p) => {
  const seed = i * 7 + 2 * 131;
  p.rect(0, 0, 16, 16, PAL.wood[1]);
  for (let b = 0; b < 4; b++) {
    p.hline(0, b * 4 + 1, 16, PAL.wood[2]);
    p.vline(b * 4 + 2, 0, 16, PAL.wood[0]);
  }
  for (let k = 0; k < 3; k++) {
    const gx = Math.floor(hash2(seed, k * 5) * 13);
    const gy = 1 + Math.floor(hash2(seed, k * 5 + 1) * 3) * 4;
    p.hline(gx, gy, 3, PAL.queen);
    p.px(gx, gy, PAL.glowAmber);
  }
}) });

floors.push({ name: 'DEFENSA (adoquín)', grid: paintToGrid((p) => {
  const seed = i * 7 + 9 * 131;
  p.rect(0, 0, 16, 16, PAL.black);
  for (let row = 0; row < 4; row++) {
    const offset = (row % 2) * 2;
    for (let col = 0; col < 4; col++) {
      const sx = col * 4 + offset - 2;
      const sy = row * 4;
      p.rect(sx + 1, sy + 1, 3, 3, PAL.stone[0]);
      p.px(sx + 1, sy + 1, PAL.stone[1]);
      if (hash2(seed + row, col) < 0.25) p.rect(sx + 1, sy + 1, 3, 3, PAL.stone[1]);
    }
  }
}) });

const header = floors.map((f) => f.name.padEnd(19)).join('');
console.log(header);
for (let row = 0; row < 16; row++) {
  console.log(floors.map((f) => f.grid[row].join('').padEnd(19)).join(''));
}
console.log('\nLegend: L/l/! hoja+brillo v vena | s/S/$ paja | w/=/_ tejido Q/* hilo dorado | o/O losas # juntas');
