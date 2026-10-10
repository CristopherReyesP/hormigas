import { describe, expect, it } from 'vitest';
import { Camera } from '../../engine/camera/Camera';
import { PAL } from '../../engine/renderer/pixelart/palette';
import { textWidth } from '../../engine/renderer/pixelart/PixelFont';
import { MeteorIntro, introTitleScale } from './MeteorIntro';
import { INTRO_TIMELINE as T, INTRO_TITLE_LINES, IntroClock } from './introTimeline';

/** A screen context that records every fillRect with the style it was painted in. */
function recordingCtx(width: number, height: number) {
  const fills: Array<{ style: string; rect: number[] }> = [];
  const ctx = {
    canvas: { width, height },
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save() {},
    restore() {},
    drawImage() {},
    fillRect(x: number, y: number, w: number, h: number) { fills.push({ style: ctx.fillStyle, rect: [x, y, w, h] }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills };
}

/** An intro whose clock sits with the letterbox fully in, before the meteor lands. */
function introAtLetterbox(): MeteorIntro {
  const clock = new IntroClock();
  while (clock.elapsed < T.letterboxIn + 0.05) clock.advance(1 / 60);
  const intro = new MeteorIntro({ x: 20, y: 20 }, { x: 60, y: 45 }, clock);
  intro.frame();
  return intro;
}

const bars = (fills: Array<{ style: string; rect: number[] }>) => fills.filter((f) => f.style === PAL.black).map((f) => f.rect);
const even = (v: number) => Math.round(v / 2) * 2;

describe('intro letterbox at real window sizes', () => {
  it('slides in from the edges of the camera viewport, across the whole canvas width', () => {
    const camera = new Camera();
    camera.setCanvasSize(1600, 1000, 1);
    camera.setViewport({ x: 0, y: 0, w: 1600, h: 1000 });
    const { ctx, fills } = recordingCtx(1600, 1000);
    introAtLetterbox().drawScreenFx(ctx, camera);
    const bar = even(1000 * 0.11);
    expect(bars(fills)).toEqual([[0, 0, 1600, bar], [0, 1000 - bar, 1600, bar]]);
  });

  it('sizes the bars from the viewport height, not a fixed 600 px', () => {
    const camera = new Camera();
    camera.setCanvasSize(2560, 1440, 1);
    camera.setViewport({ x: 0, y: 40, w: 2560, h: 1200 });
    const { ctx, fills } = recordingCtx(2560, 1440);
    introAtLetterbox().drawScreenFx(ctx, camera);
    const bar = even(1200 * 0.11);
    expect(bars(fills)).toEqual([[0, 40, 2560, bar], [0, 40 + 1200 - bar, 2560, bar]]);
  });

  it('frames the whole canvas on the underground layer (no camera)', () => {
    const { ctx, fills } = recordingCtx(3200, 1800);
    introAtLetterbox().drawScreenFx(ctx, null);
    const bar = even(1800 * 0.11);
    expect(bars(fills)).toEqual([[0, 0, 3200, bar], [0, 1800 - bar, 3200, bar]]);
  });
});

describe('introTitleScale', () => {
  const longest = Math.max(...INTRO_TITLE_LINES.map((l) => textWidth(l, 1)));

  it('keeps the 10x title on the reference 800×600 canvas', () => {
    expect(introTitleScale(800, 600)).toBe(10);
  });

  it('grows with the canvas so the title keeps its share of the screen', () => {
    expect(introTitleScale(1600, 900)).toBe(20);
    expect(introTitleScale(3200, 1800)).toBe(40);
  });

  it('always fits the canvas width and height', () => {
    for (const [w, h] of [[1280, 720], [2560, 1440], [3440, 1440], [900, 1600]]) {
      const s = introTitleScale(w, h);
      expect(longest * s, `${w}x${h}`).toBeLessThan(w);
      expect(INTRO_TITLE_LINES.length * 7 * s, `${w}x${h}`).toBeLessThan(h * 0.5);
    }
  });
});
