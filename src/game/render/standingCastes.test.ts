// The surface pass asks the atlas for standing ants of every caste exactly
// while the camera is tilted, and for the top-down sprite while it is flat.
import { describe, expect, it } from 'vitest';
import { RenderSystem } from '../systems/RenderSystem';
import { StandingSprites } from '../../engine/renderer/standingSprites';
import { AntRole } from '../components/components';

const CASTES = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender, AntRole.Bomber];

function drawAntArgs(tilt: number, role: AntRole, rotation: number): unknown[][] {
  const matrix = { a: 2, b: 0, c: 0, d: tilt ? 1.1 : 2, e: 0, f: 0 };
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    getTransform: () => ({ ...matrix }),
    setTransform: () => undefined,
    globalAlpha: 1,
    drawImage: () => undefined,
  } as unknown as CanvasRenderingContext2D;
  const calls: unknown[][] = [];
  const renderer = Object.create(RenderSystem.prototype) as RenderSystem;
  renderer['animationTime'] = 0;
  renderer['fxShadowSmall'] = {} as OffscreenCanvas;
  renderer['spriteAtlas'] = { drawAnt: (...args: unknown[]) => calls.push(args) } as never;
  const standing = new StandingSprites();
  standing.begin(ctx, {
    getTilt: () => tilt,
    getTiltScale: () => (tilt ? 0.55 : 1),
    getRotation: () => rotation,
    worldToScreen: (x: number, y: number) => ({ x, y }),
  });
  renderer['standing'] = standing;
  renderer['drawAnt'](ctx, 1, 1, Math.PI / 2, 0, role, false, false, false, false);
  standing.flush();
  return calls;
}

describe('standing castes on the surface', () => {
  it.each(CASTES)('%s stands while the camera is tilted, at every rotation', role => {
    for (const rotation of [0, 1, 2, 3]) {
      const [args] = drawAntArgs(2, role, rotation);
      expect(args[5]).toBe(role);
      expect(args[9]).toBe(true);
    }
  });

  it.each(CASTES)('%s stays top-down while the camera is flat', role => {
    for (const rotation of [0, 1, 2, 3]) {
      const [args] = drawAntArgs(0, role, rotation);
      expect(args[9]).toBe(false);
    }
  });
});
