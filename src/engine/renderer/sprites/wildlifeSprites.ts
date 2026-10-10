// Neutral wildlife sprite recipes: the olive alien burrower (28×28, the beetle) and the straw
// cricket (48×48). Authored facing right with symmetric interior shading;
// ArtPen adds the top-left light and the ground shadow after each turn.
import { ArtGrid } from '../pixelart/ArtGrid';
import { ArtPen } from '../pixelart/ArtPen';
import { directionAngle } from '../pixelart/directions';
import { PAL } from '../pixelart/palette';
import { SPRITE_GRID } from './spriteScale';

const GAIT = [1, 0, -1, 0];

export interface WildlifeSpriteSpec {
  frame: number;
  direction: number;
  /** Dithered ground shadow under the silhouette. */
  shadow?: boolean;
}

/**
 * 28×28 art-pixel beetle (the in-game "acorazado"), facing right. Not an
 * insect: an armored alien burrower with a low olive hide, four stubby
 * clawed legs, overlapping bony ash plates down its back, a toothy maw and a
 * small cluster of amber eyes. Muted, no glow, never the faction hues.
 */
export function paintBeetle({ frame, direction, shadow = true }: WildlifeSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.beetle);
  const p = new ArtPen(grid, directionAngle(direction));
  const B = PAL.beetle;
  const H = PAL.beetleAsh;
  const O = PAL.outline;
  const A = Math.floor(SPRITE_GRID.beetle / 2);
  const swing = GAIT[frame % GAIT.length];
  const mirror = (y: number): number => 2 * A - y;
  const gape = frame % 4 < 2 ? 1 : 0;

  // One silhouette: four stubby clawed legs (diagonal pairs step together),
  // the low hide and the blunt head
  p.outlined(pen => {
    for (let side = -1; side <= 1; side += 2) {
      for (const [hipX, pair] of [[9, 0], [17, 1]] as const) {
        const s = (pair + (side === 1 ? 1 : 0)) % 2 === 0 ? swing : -swing;
        const footX = hipX + s;
        pen.capsule(hipX, A + side * 5, footX, A + side * 7, 1.3, B[0]);
        pen.px(footX - 1, A + side * 9, B[0]); // claws
        pen.px(footX + 1, A + side * 9, B[0]);
      }
    }
    pen.ellipse(13, A, 9, 6.4, B[1]);
    pen.ellipse(21.5, A, 3.6, 4.2, B[1]);
  }, O);

  // Overlapping bony plates, tail first so each front plate laps the one behind
  for (const [x, ry] of [[6, 4], [10, 5.4], [14, 5.6], [18, 4.6]] as const) {
    p.ellipse(x, A, 2.6, ry, H[1]);
    p.line(x - 2, A - ry + 1, x - 2, A + ry - 1, H[0]); // the lapped rear edge in shadow
    p.line(x + 2, A - ry + 2, x + 2, A + ry - 2, H[2]); // a pale ridge on the leading edge
  }
  p.hline(5, A, 15, H[0]); // spine groove between the plate halves

  // Toothy maw: a black gash ringed by pale teeth, gaping on the step
  p.rect(24, A - 1 - gape, 2, 3 + gape * 2, PAL.black);
  for (const x of [23, 25]) {
    p.px(x, A - 2 - gape, H[2]);
    p.px(x, mirror(A - 2 - gape), H[2]);
  }
  p.px(24, A - 2 - gape, H[2]);
  p.px(24, mirror(A - 2 - gape), H[2]);

  // A small cluster of amber eyes above the maw
  p.px(21, A - 2, PAL.beetleEye);
  p.px(22, A - 1, PAL.beetleEye);
  p.px(22, A + 1, PAL.beetleEye);
  p.px(21, A + 2, PAL.beetleEye);

  p.shade([B, H]);
  p.sheen(13, A, 4, B[2]);
  if (shadow) p.castShadow(O, 1, 2);
  return grid;
}

/**
 * 48×48 art-pixel cricket, facing right — a grasshopper read from above:
 * long tapered body with folded wings, dark pronotum saddle, big black eyes,
 * and DOMINANT Z-folded jumping legs (thick femur out to a wide knee, thin
 * brown tibia tucked back in, brown feet). Straw, so it reads on the moss.
 */
export function paintCricket({ frame, direction, shadow = true }: WildlifeSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.cricket);
  const p = new ArtPen(grid, directionAngle(direction));
  const C = PAL.cricket;
  const W = PAL.wood;
  const O = PAL.outline;
  const A = Math.floor(SPRITE_GRID.cricket / 2);
  const swing = GAIT[frame % GAIT.length];
  const flick = frame % 2;
  const mirror = (y: number): number => 2 * A - y;

  // Jumping legs — the signature. Tibia first (lies under the femur): the
  // knee folds back toward the tail.
  for (let side = -1; side <= 1; side += 2) {
    const footX = 5 + Math.round(swing * 1.5);
    p.line(12, A + side * 12, footX, A + side * 5, W[1]);
    p.line(13, A + side * 12, footX + 1, A + side * 5, W[1]);
    p.px(footX - 1, A + side * 4, W[0]);
    p.px(footX, A + side * 5, W[0]);
    // Femur: a thick club from the hip out to the knee, well outside the body
    p.outlined(pen => {
      pen.capsule(20, A + side * 3, 13, A + side * 11, 1.8, C[1]);
      pen.disc(13, A + side * 12, 1.2, C[1]);
    }, O);
    p.line(19, A + side * 4, 14, A + side * 10, C[2]); // femur ridge
    p.px(13, A + side * 12, C[2]); // knee
  }

  // Walking legs — two small elbowed brown pairs, alternating gait
  for (let side = -1; side <= 1; side += 2) {
    const sA = side === 1 ? swing : -swing;
    p.polyline([[24, A + side * 3], [22, A + side * 7], [20 - sA, A + side * 9]], W[1]);
    p.polyline([[28, A + side * 3], [31, A + side * 7], [33 + sA, A + side * 9]], W[1]);
  }

  // Body — long taper from the pointed wing tips (tail) to the thorax
  p.outlined(pen => pen.poly([[4, A], [7, A - 2], [24, A - 5], [24, A + 5], [7, A + 2]], C[1]), O);
  // Folded wings: dark seam over the tail half, lit wing ridges, dark wing edges
  p.line(6, A, 16, A, C[0]);
  p.line(9, A - 2, 23, A - 3, C[2]);
  p.line(9, mirror(A - 2), 23, mirror(A - 3), C[2]);
  p.line(12, A - 4, 23, A - 4, C[0]);
  p.line(12, mirror(A - 4), 23, mirror(A - 4), C[0]);
  // Abdomen segment chevrons peeking between the wings
  for (const x of [9, 13, 17]) {
    p.px(x, A - 1, C[0]);
    p.px(x, mirror(A - 1), C[0]);
  }

  // Head first — the pronotum saddle overlaps its rear
  p.outlined(pen => pen.ellipse(31, A, 3.6, 3.9, C[1]), O);
  // Pronotum saddle — a wide darker plate riding over body rear + head front
  p.outlined(pen => pen.rect(22, A - 5, 6, 11, C[0]), O);
  p.vline(24, A - 4, 9, C[1]); // central keel
  p.hline(23, A - 5, 4, C[1]);
  p.hline(23, mirror(A - 5), 4, C[1]);

  // Big black eyes at the sides of the head
  p.rect(31, A - 4, 3, 2, PAL.black);
  p.rect(31, mirror(A - 4) - 1, 3, 2, PAL.black);
  // Mouth palps
  p.px(35, A - 1, C[0]);
  p.px(35, mirror(A - 1), C[0]);

  // Long antennae swept forward-out, flicking across frames
  p.polyline([[34, A - 2], [40, A - 7 + flick], [43, A - 10 + flick]], C[0]);
  p.polyline([[34, mirror(A - 2)], [40, mirror(A - 7 + flick)], [43, mirror(A - 10 + flick)]], C[0]);

  p.shade([C, W]);
  p.sheen(15, A, 2, C[2]);
  p.sheen(31, A, 2, C[2]);
  if (shadow) p.castShadow(O, 1, 2);
  return grid;
}
