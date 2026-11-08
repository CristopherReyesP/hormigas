import { describe, expect, it, vi } from 'vitest';
import { beginBillboard, beginUprightOverlay } from './uprightOverlay';

describe('upright world overlays', () => {
  it.each([[2, 0, 0, 2], [0, 2, -2, 0], [-2, 0, 0, -2], [0, -2, 2, 0]])('retains anchor and scale with matrix %j', (a, b, c, d) => {
    const setTransform = vi.fn();
    const save = vi.fn();
    const ctx = { save, getTransform: () => ({ a, b, c, d, e: 17, f: 23 }), setTransform } as unknown as CanvasRenderingContext2D;
    beginUprightOverlay(ctx, 100, 200);
    expect(save).toHaveBeenCalledOnce();
    expect(setTransform).toHaveBeenCalledWith(2, 0, 0, 2, a * 100 + c * 200 + 17 - 200, b * 100 + d * 200 + 23 - 400);
  });
});


describe('tilted billboards', () => {
  for (const rotation of [0, 1, 2, 3]) {
    for (const scale of [0.75, 0.55]) {
      it(`preserves the ground anchor and square pixels at rotation ${rotation}, scale ${scale}`, () => {
        const angle = rotation * Math.PI / 2;
        const a = 2 * Math.cos(angle), b = 2 * scale * Math.sin(angle);
        const c = -2 * Math.sin(angle), d = 2 * scale * Math.cos(angle);
        const setTransform = vi.fn();
        const ctx = { save: vi.fn(), getTransform: () => ({ a, b, c, d, e: 17, f: 23 }), setTransform } as unknown as CanvasRenderingContext2D;
        const camera = { getTilt: () => 1, getTiltScale: () => scale, getRotation: () => rotation };
        const heading = beginBillboard(ctx, camera, 100, 200, { height: 40, heading: -Math.PI / 2 });
        const [sx, skewY, skewX, sy, tx, ty] = setTransform.mock.calls[0];
        expect(sx).toBeCloseTo(2);
        expect(sy).toBeCloseTo(2);
        expect(skewX).toBe(0);
        expect(skewY).toBe(0);
        expect(sx * 100 + tx).toBeCloseTo(a * 100 + c * 200 + 17);
        // The lift is measured from the ground point in screen space.
        expect(sy * (200 + 20 * (1 - scale)) + ty).toBeCloseTo(b * 100 + d * 200 + 23);
        expect(heading).toBeCloseTo(-Math.PI / 2 + angle);
      });
    }
  }
  it('does not alter the top-down transform or heading', () => {
    const ctx = { save: vi.fn(), setTransform: vi.fn() } as unknown as CanvasRenderingContext2D;
    expect(beginBillboard(ctx, { getTilt: () => 0, getTiltScale: () => 1, getRotation: () => 1 }, 5, 6, { heading: 0.3 })).toBe(0.3);
    expect(ctx.setTransform).not.toHaveBeenCalled();
  });
});
