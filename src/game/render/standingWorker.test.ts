// The surface pass asks the atlas for standing ants exactly while the camera
// is tilted; the atlas then decides which castes have a 3/4 view.
import { describe, expect, it } from 'vitest';
import { RenderSystem } from '../systems/RenderSystem';
import { StandingSprites } from '../../engine/renderer/standingSprites';
import { AntRole } from '../components/components';

function drawAntArgs(tilt: number, role: AntRole): unknown[][] {
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
    getRotation: () => 0,
    worldToScreen: (x: number, y: number) => ({ x, y }),
  });
  renderer['standing'] = standing;
  renderer['drawAnt'](ctx, 1, 1, Math.PI / 2, 0, role, false, false, false, false);
  standing.flush();
  return calls;
}

describe('standing ants on the surface', () => {
  it('asks for the standing view while the camera is tilted', () => {
    for (const role of [AntRole.Worker, AntRole.Soldier]) {
      const [args] = drawAntArgs(2, role);
      expect(args[5]).toBe(role);
      expect(args[9]).toBe(true);
    }
  });

  it('asks for the top-down view while the camera is flat', () => {
    const [args] = drawAntArgs(0, AntRole.Worker);
    expect(args[9]).toBe(false);
  });
});
