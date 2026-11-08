import { describe, expect, it, vi } from 'vitest';
import { drawAmountBar, drawOreFloat } from './resourceArt';
import { drawDigOverlay } from './digOverlayArt';
import { DigTileClass } from '../dig/digStatus';
import { drawWaveUnits } from './waveFunArt';
import { BOSS_COMPONENT } from '../run/miniBoss';
import { COMPONENT, Layer } from '../components/components';
import type { World } from '../../engine/ecs/World';
import { RenderSystem } from '../systems/RenderSystem';
import { CrystalRivalArt } from './crystalRivalArt';

function recordingContext() {
  let matrix = { a: 0, b: 2, c: -2, d: 0, e: 800, f: 100 };
  const original = { ...matrix };
  const stack: typeof matrix[] = [];
  const draws: typeof matrix[] = [];
  const ctx = {
    save: () => stack.push({ ...matrix }),
    restore: () => { matrix = stack.pop()!; },
    getTransform: () => matrix,
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => { matrix = { a, b, c, d, e, f }; },
    fillRect: () => draws.push({ ...matrix }),
    strokeRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, original, draws, stack };
}

describe('bitmap overlays under camera rotation', () => {
  it.each(['amount', 'ore', 'dig'])('keeps %s upright and restores world drawing', kind => {
    const { ctx, original, draws, stack } = recordingContext();
    if (kind === 'amount') drawAmountBar(ctx, 100, 200, 0.5, 'crystal');
    if (kind === 'ore') drawOreFloat(ctx, 100, 200, 5, 0.3);
    if (kind === 'dig') drawDigOverlay(ctx, {
      classes: new Uint8Array([DigTileClass.Open]), width: 1,
      jobs: [{ x: 0, y: 0, order: 2, progress: null }], preview: [], hover: null,
    }, 0, 0, 1, 1);
    expect(draws.length).toBeGreaterThan(0);
    for (const matrix of draws) {
      expect([matrix.a, matrix.b, matrix.c, matrix.d]).toEqual([2, 0, 0, 2]);
    }
    expect(ctx.getTransform()).toEqual(original);
    expect(stack).toHaveLength(0);
  });
});


it('restores the camera matrix and stack after drawing boss health', () => {
  const { ctx, original, stack } = recordingContext();
  const drawing = new Proxy(ctx, {
    get: (target, key) => Reflect.get(target, key) ?? (() => {}),
  });
  const world = {
    query: (key: string) => key === BOSS_COMPONENT ? [1] : [],
    getComponent: (_id: number, key: string) => {
      if (key === BOSS_COMPONENT) return { kind: 'beetle', phase: 'idle' };
      if (key === COMPONENT.POSITION) return { x: 20, y: 20, prevX: 20, prevY: 20 };
      if (key === COMPONENT.HEALTH) return { current: 50, max: 100 };
      return undefined;
    },
  } as unknown as World;
  drawWaveUnits(drawing, world, Layer.Surface, 1, 1, null);
  expect(stack).toHaveLength(0);
  expect(ctx.getTransform()).toEqual(original);
});


it('keeps crystal health and shield bars stacked in screen space', () => {
  const { ctx, original, draws, stack } = recordingContext();
  const renderer = Object.create(RenderSystem.prototype) as RenderSystem;
  renderer['world'] = { getComponent: () => ({ current: 50, max: 100 }) } as unknown as World;
  renderer['crystalArt'] = new CrystalRivalArt();
  renderer['fxHealthFrame'] = {} as OffscreenCanvas;
  ctx.drawImage = () => {};
  renderer['drawCrystalBars'](ctx, 1, 100, 200, 1);
  expect(draws.length).toBeGreaterThan(1);
  for (const matrix of draws) expect(matrix).toEqual(draws[0]);
  expect(stack).toHaveLength(0);
  expect(ctx.getTransform()).toEqual(original);
});
