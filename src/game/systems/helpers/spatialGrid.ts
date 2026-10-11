/**
 * A uniform bucket grid over tile space for "what is near (x, y)?" lookups.
 * Rebuilt once per tick from a snapshot (clear + insert), then queried by
 * every unit: a lookup touches only the cells a circle overlaps instead of
 * every item, which keeps big colonies × big food fields from going O(n·m).
 *
 * Items carry their snapshot index; `queryCircle` returns candidates sorted
 * by it, so callers that walked the whole snapshot in order (first match /
 * nearest with first-wins ties) keep exactly the same answer.
 */
export interface GridItem {
  x: number;
  y: number;
  /** Position in the snapshot the grid was built from */
  index: number;
}

export class SpatialGrid<T extends GridItem> {
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: T[][];
  /** Live items per cell: cells keep their arrays between ticks (no shrink + regrow every clear) */
  private readonly counts: Int32Array;
  private readonly cellSize: number;

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.counts = new Int32Array(this.cols * this.rows);
  }

  clear(): void {
    this.counts.fill(0);
  }

  insert(item: T): void {
    const c = this.cellOf(item.y, this.rows) * this.cols + this.cellOf(item.x, this.cols);
    this.cells[c][this.counts[c]++] = item;
  }

  /**
   * Items within `radius` of (x, y), in snapshot order. The cut is a little
   * generous (callers keep their own exact `<` / `<=` checks), so nothing a
   * full scan would have accepted is ever missed.
   */
  queryCircle(x: number, y: number, radius: number, out: T[]): T[] {
    out.length = 0;
    const reach = radius + 1e-6;
    const reachSq = reach * reach;
    const minCx = this.cellOf(x - radius, this.cols);
    const maxCx = this.cellOf(x + radius, this.cols);
    const minCy = this.cellOf(y - radius, this.rows);
    const maxCy = this.cellOf(y + radius, this.rows);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const c = cy * this.cols + cx;
        const cell = this.cells[c];
        const n = this.counts[c];
        for (let i = 0; i < n; i++) {
          const item = cell[i];
          const dx = item.x - x;
          const dy = item.y - y;
          if (dx * dx + dy * dy <= reachSq) out.push(item);
        }
      }
    }
    if (out.length > 1) out.sort(byIndex);
    return out;
  }

  private cellOf(v: number, count: number): number {
    const c = Math.floor(v / this.cellSize);
    return c < 0 ? 0 : c >= count ? count - 1 : c;
  }
}

function byIndex(a: GridItem, b: GridItem): number {
  return a.index - b.index;
}
