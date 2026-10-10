import { describe, expect, it } from 'vitest';
import { ART_PX, SPRITE_GRID, nestPixelsPerArtPixel, spritePivot } from '../../engine/renderer/sprites/spriteScale';
import {
  NEST_PORTRAIT_RADIUS,
  PORTRAIT_SIZE,
  crispPlacement,
  portraitPlacement,
  portraitSprite,
  type PortraitSprite,
} from './portraitScale';

describe('portrait sprite per selection', () => {
  it('maps every selectable kind to its atlas sprite', () => {
    expect(portraitSprite('ant')).toBe('ant');
    expect(portraitSprite('beetle')).toBe('beetle');
    expect(portraitSprite('cricket')).toBe('cricket');
    expect(portraitSprite('beetle_den')).toBe('den');
    expect(portraitSprite('cricket_den')).toBe('den');
    expect(portraitSprite('nest')).toBe('nest');
    expect(portraitSprite('food', 'leaf')).toBe('food');
    expect(portraitSprite('food')).toBe('food');
    expect(portraitSprite('food', 'giant_mushroom')).toBe('giantMushroom');
  });
});

describe('portrait scale', () => {
  // Screen px per art px and the box size each sprite gets in the 64 px portrait
  const expected: Record<PortraitSprite, { pixelSize: number; box: number }> = {
    ant: { pixelSize: 2, box: 48 },
    beetle: { pixelSize: 2, box: 56 },
    cricket: { pixelSize: 1, box: 48 },
    den: { pixelSize: 1, box: 40 },
    nest: { pixelSize: 1, box: 40 },
    food: { pixelSize: 2, box: 48 },
    mineral: { pixelSize: 2, box: 48 },
    giantMushroom: { pixelSize: 2, box: 64 },
  };

  for (const [sprite, { pixelSize, box }] of Object.entries(expected) as [PortraitSprite, { pixelSize: number; box: number }][]) {
    it(`draws the ${sprite} at ${pixelSize} screen px per art px, centered on whole px`, () => {
      const p = portraitPlacement(sprite);
      expect(p.pixelSize).toBe(pixelSize);
      expect(p.scale * ART_PX).toBe(pixelSize);
      expect(SPRITE_GRID[sprite] * p.pixelSize).toBe(box);
      expect(Number.isInteger(p.offset)).toBe(true);
      expect(p.offset).toBe((PORTRAIT_SIZE - box) / 2);
    });
  }

  it('anchors unit sheets on their pivot so the sheet box starts at the frame offset', () => {
    for (const sprite of ['ant', 'beetle', 'cricket', 'food'] as const) {
      const p = portraitPlacement(sprite);
      // DirectionalSheet.draw puts the box at round(x - pivot px)
      const boxLeft = Math.round(p.at - spritePivot(SPRITE_GRID[sprite]) * ART_PX);
      expect(p.offset + p.scale * boxLeft).toBe(p.offset);
    }
  });

  it('anchors static props on their center so the sprite box starts at the frame offset', () => {
    for (const sprite of ['den', 'giantMushroom', 'mineral'] as const) {
      const p = portraitPlacement(sprite);
      const boxLeft = Math.round(p.at - (SPRITE_GRID[sprite] * ART_PX) / 2);
      expect(boxLeft).toBe(0);
    }
  });

  it('draws the nest mound at the units art scale, so its box starts at the frame offset', () => {
    expect(nestPixelsPerArtPixel(NEST_PORTRAIT_RADIUS)).toBe(ART_PX);
    const p = portraitPlacement('nest');
    expect(p.at).toBe(SPRITE_GRID.nest * ART_PX / 2);
  });
});

describe('crisp placement', () => {
  it('picks the largest whole px per art px that fits and centers the box', () => {
    expect(crispPlacement(24, 96, 'pivot')).toEqual({ pixelSize: 4, scale: 2, offset: 0, at: 25 });
    expect(crispPlacement(16, 50, 'center')).toEqual({ pixelSize: 3, scale: 1.5, offset: 1, at: 16 });
  });

  it('never scales below one screen px per art px', () => {
    expect(crispPlacement(80, 64, 'center')).toMatchObject({ pixelSize: 1, offset: -8 });
  });
});
