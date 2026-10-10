// The underground fungus farm grows the alien fungus, not brown Earth mushrooms.
import { describe, expect, it } from 'vitest';
import { PAL } from './pixelart/palette';
import { PILE_COLORS } from '../../game/systems/RenderSystem';
import { FUNGUS_FARM_MINIMAP_COLOR } from '../../ui/console/minimapDraw';

const FUNGUS = [...PAL.fungus.cap, ...PAL.fungus.stalk, ...PAL.fungus.glow];

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function distance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

describe('fungus farm colors', () => {
  it('paints farm crops from the alien fungus ramp', () => {
    expect(PAL.fungus.cap).toContain(PAL.shroomCap);
    expect(PAL.fungus.cap).toContain(PAL.shroomCapLight);
    expect(PAL.fungus.stalk).toContain(PAL.shroomStem);
  });

  it('paints mushroom pantry piles in fungus tones, not wood brown', () => {
    for (const c of PILE_COLORS.mushroom) {
      expect(FUNGUS).toContain(c);
      expect(PAL.wood).not.toContain(c);
    }
  });

  it('marks the farm on the minimap in a fungus tone that stands apart from the other chambers', () => {
    expect(FUNGUS).toContain(FUNGUS_FARM_MINIMAP_COLOR);
    for (const other of [PAL.defender, PAL.leaf[1], PAL.nurse, PAL.queen, PAL.tunnel[2], PAL.earth[1], PAL.stone[0]]) {
      expect(distance(FUNGUS_FARM_MINIMAP_COLOR, other), other).toBeGreaterThan(80);
    }
  });
});
