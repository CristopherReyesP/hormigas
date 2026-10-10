// Where the Humans set up camp: a seeded clearing on the far side of the map,
// like the crater (`pickCraterSite`), but away from the crater too, so the
// meteorite's shard field stays a contested landmark between the two bases.

import { floodFromNest, pickCraterSite, type CraterSiteInput, type TilePos } from '../run/craterSite';

export interface HumanSiteInput extends CraterSiteInput {
  /** A spot to keep away from (the crater); null for none */
  avoid: TilePos | null;
  /** Minimum distance to `avoid`, in tiles */
  avoidDistance: number;
}

/**
 * A reachable clearing of `clearRadius` on the far side of the map (at least
 * `farFraction` of the farthest clearing's distance from the nest) and at
 * least `avoidDistance` from `avoid`, picked with the seeded `rng`. When no
 * clearing is far from `avoid`, the plain far-side pick is used.
 */
export function pickHumanBaseSite(input: HumanSiteInput): TilePos {
  const { width, height, nest, clearRadius: r, edgeMargin: m, farFraction, avoid, avoidDistance } = input;
  const reached = floodFromNest(input);
  const isReached = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && reached[y * width + x] === 1;

  const clearings: Array<{ x: number; y: number; d: number }> = [];
  for (let y = m; y < height - m; y++) {
    for (let x = m; x < width - m; x++) {
      if (!isReached(x, y)) continue;
      if (avoid && Math.hypot(x - avoid.x, y - avoid.y) < avoidDistance) continue;
      let clear = true;
      for (let dy = -r; dy <= r && clear; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy <= r * r && !isReached(x + dx, y + dy)) { clear = false; break; }
        }
      }
      if (clear) clearings.push({ x, y, d: Math.hypot(x - nest.x, y - nest.y) });
    }
  }
  if (clearings.length === 0) return pickCraterSite(input);

  const maxD = clearings.reduce((best, c) => Math.max(best, c.d), 0);
  const far = clearings.filter((c) => c.d >= maxD * farFraction);
  const pick = far[Math.min(far.length - 1, Math.floor(input.rng() * far.length))];
  return { x: pick.x, y: pick.y };
}
