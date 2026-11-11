import { describe, expect, it } from 'vitest';
import { ditheredFogLevel, fogLevel } from './FogRenderer';
import { FOG_CLEAR_BRIGHTNESS } from './fogVisibility';

describe('fog levels', () => {
  it('a tile is unexplored, explored or clear', () => {
    expect(fogLevel(false, 1)).toBe(2);
    expect(fogLevel(true, FOG_CLEAR_BRIGHTNESS)).toBe(0);
    expect(fogLevel(true, 0)).toBe(1);
  });

  it('inside a band every cell keeps the band level', () => {
    for (const t of [0.03, 0.5, 0.97]) expect(ditheredFogLevel(1, 1, 1, 1, 0.4, -0.4, t)).toBe(1);
  });

  it('the border between two bands is dithered, denser toward the other band, and only whole levels come out', () => {
    const count = (u: number) => {
      let n = 0;
      for (let k = 0; k < 16; k++) {
        const level = ditheredFogLevel(0, 2, 0, 2, u, 0.01, (k + 0.5) / 16);
        expect([0, 1, 2]).toContain(level);
        if (level > 0) n++;
      }
      return n;
    };
    // Center of the tile: its own level; toward the foggy neighbour: more and more fog cells
    expect(count(0.01)).toBeLessThanOrEqual(1);
    expect(count(0.45)).toBeGreaterThan(count(0.2));
    expect(count(0.45)).toBeGreaterThan(4);
  });
});
