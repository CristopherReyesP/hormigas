// Pure layout math for the wave alert's edge arrows (WaveAlert.tsx).

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The band of the screen the view fills, as fractions (the HUD covers the rest); default: all of it */
  band?: { left: number; top: number; width: number; height: number };
}

export interface EdgeMarker {
  /** Percent of the screen width / height, inside the view's band */
  left: number;
  top: number;
  /** Screen-space direction to the target in degrees (0 = right, 90 = down) */
  angle: number;
  /** The target is on screen: mark it where it is instead of on the edge */
  inside: boolean;
}

/**
 * Where to draw the marker for a world `target` (tiles) given the camera's view
 * (tiles): on the target when it is in view, else on the screen edge, inset
 * by `inset` percent of the band, along the line from the band's centre toward it.
 */
export function edgeMarker(view: ViewRect, target: { x: number; y: number }, inset = 6): EdgeMarker {
  const fx = (target.x - view.x) / view.w;
  const fy = (target.y - view.y) / view.h;
  const band = view.band ?? { left: 0, top: 0, width: 1, height: 1 };
  const onScreen = (bx: number, by: number) => ({
    left: (band.left + bx * band.width) * 100,
    top: (band.top + by * band.height) * 100,
  });
  if (fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1) return { ...onScreen(fx, fy), angle: 0, inside: true };
  const cx = fx - 0.5;
  const cy = fy - 0.5;
  const reach = 0.5 - inset / 100;
  const scale = Math.min(cx !== 0 ? reach / Math.abs(cx) : Infinity, cy !== 0 ? reach / Math.abs(cy) : Infinity);
  // Tiles are square, so the angle is taken in tiles, not in screen fractions
  const angle = (Math.atan2(cy * view.h, cx * view.w) * 180) / Math.PI;
  return { ...onScreen(0.5 + cx * scale, 0.5 + cy * scale), angle, inside: false };
}
