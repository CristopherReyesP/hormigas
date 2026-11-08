/**
 * Keep a world-space overlay upright at its transformed anchor, retaining zoom.
 * Call ctx.restore() after drawing. Sprite-local transforms must be restored first.
 */
export function beginUprightOverlay(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  const m = ctx.getTransform();
  const sx = Math.hypot(m.a, m.c);
  setUprightTransform(ctx, m, x, y, sx);
}

/** The camera state a billboard reads (Camera satisfies it). */
export interface BillboardCamera {
  getTilt(): number;
  getTiltScale(): number;
  getRotation(): number;
}

/**
 * Draw centered art above a ground anchor without the camera's vertical squash.
 * Foot-anchored art uses height 0; centered units supply their approximate height.
 * The returned heading is screen-relative. Restore the context after drawing.
 */
export function beginBillboard(
  ctx: CanvasRenderingContext2D,
  camera: BillboardCamera,
  x: number,
  y: number,
  options: { height?: number; heading?: number } = {},
): number {
  const heading = options.heading ?? 0;
  if (camera.getTilt() === 0) {
    ctx.save();
    return heading;
  }
  ctx.save();
  const m = ctx.getTransform();
  const scale = Math.hypot(m.a, m.c);
  const lift = (options.height ?? 0) * 0.5 * (1 - camera.getTiltScale());
  setUprightTransform(ctx, m, x, y, scale, lift);
  return screenHeading(heading, camera.getRotation());
}

/** A map heading as the screen shows it under `rotation` quarter turns (0 = right, canvas y down). */
export function screenHeading(heading: number, rotation: number): number {
  return heading + rotation * Math.PI / 2;
}

function setUprightTransform(ctx: CanvasRenderingContext2D, m: DOMMatrix, x: number, y: number, scale: number, lift = 0): void {
  ctx.setTransform(scale, 0, 0, scale,
    m.a * x + m.c * y + m.e - scale * x,
    m.b * x + m.d * y + m.f - scale * (y + lift));
}
