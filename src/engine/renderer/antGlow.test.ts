import { describe, expect, it } from 'vitest';
import { AntRole } from '../../game/components/components';
import { antGlowPoints } from './SpriteAtlas';

const ROLES = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender];

describe('antGlowPoints (where the vein glows on a sprite)', () => {
  it('puts the gaster vein behind the thorax node, on the body axis', () => {
    for (const role of ROLES) {
      const [gaster, thorax] = antGlowPoints(role);
      expect(gaster.along).toBeLessThan(thorax.along);
      expect(gaster.across).toBe(thorax.across);
    }
  });

  it('keeps every glow point on the 48 px sprite and in front of the gaster for the eyes', () => {
    for (const role of ROLES) {
      const pts = antGlowPoints(role);
      expect(pts.length).toBeGreaterThanOrEqual(4);
      for (const p of pts) {
        expect(Math.abs(p.along)).toBeLessThanOrEqual(24);
        expect(Math.abs(p.across)).toBeLessThanOrEqual(24);
      }
      const eyes = pts.slice(2);
      for (const e of eyes) expect(e.along).toBeGreaterThan(pts[1].along);
    }
  });
});
