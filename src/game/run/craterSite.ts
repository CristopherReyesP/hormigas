/**
 * Where the meteorite lands. The crater is a fixed place in the run: the
 * opening impact draws it, the minimap marks it, and the Crystal Hive rises
 * from it later. So it must be a clearing the colony can actually walk to,
 * on the far side of the map, and the same for the same seed.
 */

export interface TilePos {
  x: number;
  y: number;
}

export interface CraterSiteInput {
  width: number;
  height: number;
  nest: TilePos;
  isWalkable: (x: number, y: number) => boolean;
  /** Seeded generator in [0, 1); the only source of variation */
  rng: () => number;
  /** Every tile within this radius of the impact must be walkable */
  clearRadius: number;
  /** Tiles kept free between the impact and the map edge */
  edgeMargin: number;
  /** Candidates must be at least this fraction of the farthest candidate's distance */
  farFraction: number;
}

/** Tiles reachable from the nest over walkable ground (4-connected flood fill). */
function floodFromNest(input: CraterSiteInput): Uint8Array {
  const { width, height, nest, isWalkable } = input;
  const reached = new Uint8Array(width * height);
  const queue: number[] = [nest.y * width + nest.x];
  reached[queue[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % width;
    const y = (i - x) / width;
    const next: Array<[number, number]> = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of next) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (reached[j] || !isWalkable(nx, ny)) continue;
      reached[j] = 1;
      queue.push(j);
    }
  }
  return reached;
}

export function pickCraterSite(input: CraterSiteInput): TilePos {
  const { width, height, nest, clearRadius: r, edgeMargin: m, farFraction } = input;
  const reached = floodFromNest(input);
  const isReached = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && reached[y * width + x] === 1;

  // Clearings: reachable tiles whose whole disc is reachable (hence walkable)
  const clearings: Array<{ x: number; y: number; d: number }> = [];
  let farthestReach = { x: nest.x, y: nest.y, d: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isReached(x, y)) continue;
      const d = Math.hypot(x - nest.x, y - nest.y);
      if (d > farthestReach.d) farthestReach = { x, y, d };
      if (x < m || y < m || x >= width - m || y >= height - m) continue;
      let clear = true;
      for (let dy = -r; dy <= r && clear; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy <= r * r && !isReached(x + dx, y + dy)) { clear = false; break; }
        }
      }
      if (clear) clearings.push({ x, y, d });
    }
  }

  // No clearing anywhere (a tight maze): the farthest reachable tile will do
  if (clearings.length === 0) return { x: farthestReach.x, y: farthestReach.y };

  const maxD = clearings.reduce((best, c) => Math.max(best, c.d), 0);
  const far = clearings.filter((c) => c.d >= maxD * farFraction);
  const pick = far[Math.min(far.length - 1, Math.floor(input.rng() * far.length))];
  return { x: pick.x, y: pick.y };
}
