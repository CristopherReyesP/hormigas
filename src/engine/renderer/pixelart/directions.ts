// Facing directions for pre-baked sprites. Units never rotate freely: their
// angle snaps to one of 16 directions (22.5° apart) and the atlas draws the
// frame baked for it, so art pixels stay crisp squares at any heading.

export const DIRECTIONS = 16;
const STEP = (Math.PI * 2) / DIRECTIONS;

/** Index 0..15 of the direction nearest `angle` (radians, 0 = facing right, canvas y down). */
export function directionIndex(angle: number): number {
  return ((Math.round(angle / STEP) % DIRECTIONS) + DIRECTIONS) % DIRECTIONS;
}

/** Angle (radians) of direction `index`. */
export function directionAngle(index: number): number {
  return index * STEP;
}

/** `angle` snapped to the nearest of the 16 directions. */
export function snapAngle(angle: number): number {
  return Math.round(angle / STEP) * STEP;
}
