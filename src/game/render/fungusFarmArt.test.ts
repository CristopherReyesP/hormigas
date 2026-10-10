import { describe, expect, it } from 'vitest';
import { PixelPainter } from '../../engine/renderer/pixelart/PixelPainter';
import { PAL } from '../../engine/renderer/pixelart/palette';
import { FarmStage } from './fungusGrowth';
import { paintCarriedMushroom, paintFarmCrop, paintFarmGlow } from './fungusFarmArt';

/** A 2D context stand-in that records every filled art pixel and its color */
function recorder() {
  const pixels = new Map<string, string>();
  let fill = '';
  const ctx = {
    set fillStyle(c: string) { fill = c; },
    get fillStyle() { return fill; },
    fillRect(x: number, y: number, w: number, h: number) {
      for (let iy = y; iy < y + h; iy += 2) for (let ix = x; ix < x + w; ix += 2) pixels.set(`${ix},${iy}`, fill);
    },
  };
  return { painter: new PixelPainter(ctx as unknown as CanvasRenderingContext2D, 2), pixels };
}

const FUNGUS = new Set<string>([...PAL.fungus.cap, ...PAL.fungus.stalk, ...PAL.fungus.glow]);

describe('fungus farm crop art', () => {
  it('paints every stage only in the alien fungus palette, inside its 16x16 tile', () => {
    for (let stage = FarmStage.Spores; stage <= FarmStage.Ready; stage++) {
      for (let shape = 0; shape < 3; shape++) {
        for (const sway of [-1, 0, 1]) {
          const { painter, pixels } = recorder();
          paintFarmCrop(painter, stage as FarmStage, shape, sway);
          expect(pixels.size).toBeGreaterThan(0);
          for (const [key, color] of pixels) {
            expect(FUNGUS.has(color), `${color} at ${key}`).toBe(true);
            const [x, y] = key.split(',').map(Number);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(32);
            expect(y).toBeLessThan(32);
          }
        }
      }
    }
  });

  it('grows: each stage covers more of the tile than the one before', () => {
    for (let shape = 0; shape < 3; shape++) {
      let last = 0;
      for (let stage = FarmStage.Sprouts; stage <= FarmStage.Mature; stage++) {
        const { painter, pixels } = recorder();
        paintFarmCrop(painter, stage as FarmStage, shape, 0);
        expect(pixels.size).toBeGreaterThan(last);
        last = pixels.size;
      }
    }
  });

  it('gives mature caps glowing gills and a pale glow halo', () => {
    const { painter, pixels } = recorder();
    paintFarmCrop(painter, FarmStage.Mature, 0, 0);
    expect([...pixels.values()]).toContain(PAL.fungus.glow[1]);
    const glow = recorder();
    paintFarmGlow(glow.painter, 0);
    expect([...glow.pixels.values()]).toContain(PAL.fungus.glow[2]);
  });

  it('sways by moving the caps, not the stems', () => {
    const left = recorder();
    const right = recorder();
    paintFarmCrop(left.painter, FarmStage.Mature, 1, -1);
    paintFarmCrop(right.painter, FarmStage.Mature, 1, 1);
    const stem = PAL.fungus.stalk[3];
    const stems = (m: Map<string, string>) => [...m].filter(([, c]) => c === stem).map(([k]) => k).sort();
    expect(stems(left.pixels)).toEqual(stems(right.pixels));
    expect([...left.pixels.keys()].sort()).not.toEqual([...right.pixels.keys()].sort());
  });

  it('draws the carried mushroom with a pale violet cap', () => {
    const { painter, pixels } = recorder();
    paintCarriedMushroom(painter);
    const colors = new Set(pixels.values());
    expect(colors.has(PAL.fungus.cap[4]) || colors.has(PAL.fungus.cap[3])).toBe(true);
  });
});
