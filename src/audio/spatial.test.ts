import { describe, expect, it } from 'vitest';
import { hearAt, SPATIAL, spatialize, type Listener } from './spatial';

const VIEW = { x: 10, y: 20, w: 40, h: 24 };
const SURFACE: Listener = { layer: 'surface', view: VIEW };

describe('pan by screen x', () => {
  it('centers a sound in the middle of the screen', () => {
    expect(spatialize({ x: 30, y: 32 }, VIEW)).toEqual({ pan: 0, gain: 1 });
  });

  it('pans toward the side of the screen it is on, never hard', () => {
    expect(spatialize({ x: 10, y: 30 }, VIEW).pan).toBeCloseTo(-SPATIAL.panWidth);
    expect(spatialize({ x: 50, y: 30 }, VIEW).pan).toBeCloseTo(SPATIAL.panWidth);
    expect(spatialize({ x: 40, y: 30 }, VIEW).pan).toBeCloseTo(SPATIAL.panWidth / 2);
  });

  it('keeps the edge pan for sounds beyond the screen side', () => {
    expect(spatialize({ x: 70, y: 30 }, VIEW).pan).toBeCloseTo(SPATIAL.panWidth);
  });
});

describe('attenuation off screen', () => {
  it('plays anything on screen at full level', () => {
    for (const p of [{ x: 10, y: 20 }, { x: 50, y: 44 }, { x: 22, y: 41 }]) {
      expect(spatialize(p, VIEW).gain).toBe(1);
    }
  });

  it('drops right past the edge and fades out by the falloff distance', () => {
    const justOff = spatialize({ x: 50.01, y: 30 }, VIEW).gain;
    expect(justOff).toBeLessThanOrEqual(SPATIAL.offscreenGain);
    expect(justOff).toBeGreaterThan(SPATIAL.offscreenGain * 0.99);
    const near = spatialize({ x: 54, y: 30 }, VIEW).gain;
    const far = spatialize({ x: 62, y: 30 }, VIEW).gain;
    expect(near).toBeGreaterThan(far);
    expect(spatialize({ x: 50 + SPATIAL.falloffTiles, y: 30 }, VIEW).gain).toBe(0);
  });

  it('measures the distance to the screen rectangle, corners included', () => {
    const corner = spatialize({ x: 53, y: 48 }, VIEW).gain; // 3 right, 4 below: 5 tiles away
    const side = spatialize({ x: 55, y: 30 }, VIEW).gain; // 5 tiles right
    expect(corner).toBeCloseTo(side);
  });
});

describe('layer filtering', () => {
  it('hears a sound on the viewed layer', () => {
    expect(hearAt({ x: 30, y: 30, layer: 'surface' }, SURFACE)).toEqual({ pan: 0, gain: 1 });
  });

  it('does not hear the other layer, even right under the camera', () => {
    expect(hearAt({ x: 30, y: 30, layer: 'underground' }, SURFACE)).toBeNull();
    expect(hearAt({ x: 30, y: 30, layer: 'surface' }, { layer: 'underground', view: VIEW })).toBeNull();
  });

  it('does not spend a voice on a sound faded below the threshold or with no listener', () => {
    expect(hearAt({ x: 50 + SPATIAL.falloffTiles - 0.5, y: 30, layer: 'surface' }, SURFACE)).toBeNull();
    expect(hearAt({ x: 30, y: 30, layer: 'surface' }, null)).toBeNull();
  });
});
