import { describe, expect, it } from 'vitest';
import { screenPixelScale } from './screenScale';

describe('screenPixelScale (screen-space overlays keep their on-screen size)', () => {
  it('is 1 on the reference 800×600 canvas and never below 1', () => {
    expect(screenPixelScale(800, 600)).toBe(1);
    expect(screenPixelScale(400, 300)).toBe(1);
  });

  it('is the old cover scale rounded to whole canvas px', () => {
    expect(screenPixelScale(1280, 720)).toBe(2);
    expect(screenPixelScale(1600, 900)).toBe(2);
    expect(screenPixelScale(2560, 1440)).toBe(3);
    expect(screenPixelScale(3200, 1800)).toBe(4);
  });
});
