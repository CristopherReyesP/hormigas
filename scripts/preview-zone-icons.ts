// ASCII preview of the pixel-art zone icon stamps (same paint code as RenderSystem)
import { PixelPainter } from '../src/engine/renderer/pixelart/PixelPainter';
import { PAL } from '../src/engine/renderer/pixelart/palette';

function preview(name: string, paint: (p: PixelPainter) => void) {
  const grid: string[][] = Array.from({ length: 16 }, () => Array(16).fill('.'));
  let fillStyle = '';
  const ch = (c: string): string => {
    if (c === PAL.outline) return '#';
    if (c === PAL.white) return 'W';
    if (c === PAL.meat[1]) return 'm';
    if (c === PAL.meat[2]) return 'M';
    if (c === PAL.sand[2]) return 's';
    if (c === PAL.shroomCap) return 'r';
    if (c === PAL.shroomCapLight) return 'R';
    if (c === PAL.shroomStem) return 't';
    if (c === PAL.queen) return 'Q';
    if (c === PAL.defender) return 'D';
    return 'd'; // lighter defender shade etc.
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
  console.log(`── ${name} ──`);
  console.log(grid.map((r) => r.join('')).join('\n'));
  console.log('');
}

preview('ALMACÉN (carne+hueso)', (p) => {
  p.rect(4, 6, 8, 6, PAL.outline);
  p.rect(5, 7, 6, 4, PAL.meat[1]);
  p.rect(5, 7, 4, 2, PAL.meat[2]);
  p.rect(11, 8, 3, 2, PAL.white);
  p.px(14, 8, PAL.white);
  p.px(5, 7, PAL.white);
});

preview('INCUBACIÓN (huevo)', (p) => {
  p.rect(5, 4, 6, 9, PAL.outline);
  p.rect(6, 5, 4, 7, PAL.white);
  p.rect(6, 5, 2, 2, PAL.sand[2]);
  p.px(7, 6, PAL.white);
});

preview('GRANJA (hongo)', (p) => {
  p.rect(3, 5, 10, 4, PAL.outline);
  p.rect(4, 6, 8, 2, PAL.shroomCap);
  p.rect(4, 6, 4, 1, PAL.shroomCapLight);
  p.rect(6, 9, 4, 4, PAL.outline);
  p.rect(7, 9, 2, 3, PAL.shroomStem);
});

preview('TRONO (corona)', (p) => {
  p.rect(3, 9, 10, 3, PAL.outline);
  p.rect(4, 10, 8, 1, PAL.queen);
  p.rect(4, 6, 2, 4, PAL.queen);
  p.rect(7, 4, 2, 6, PAL.queen);
  p.rect(10, 6, 2, 4, PAL.queen);
  p.px(7, 4, PAL.white);
  p.hline(4, 12, 8, PAL.outline);
});

preview('DEFENSA (escudo)', (p) => {
  p.rect(4, 3, 8, 7, PAL.outline);
  p.rect(5, 10, 6, 2, PAL.outline);
  p.rect(7, 12, 2, 2, PAL.outline);
  p.rect(5, 4, 6, 6, PAL.defender);
  p.rect(6, 10, 4, 1, PAL.defender);
  p.rect(5, 4, 3, 2, '#a87fe0');
  p.hline(5, 7, 6, PAL.outline);
});
