import type { Vector2 } from '../../shared/types';

/** What A* reads from a grid: TileGrid, or a plain grid in tests. Out of bounds must be unwalkable. */
export interface PathGrid {
  readonly width: number;
  readonly height: number;
  isWalkable(x: number, y: number): boolean;
}

interface AStarNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: AStarNode | null;
  /**
   * Tie-break among equal f. The open list used to be an array re-sorted
   * (stably) every step; ranks reproduce that order exactly, so the heap pops
   * the same node the old code did and every route stays the same.
   */
  rank: number;
  /** Slot in the heap array, or -1 once the node is closed */
  heapIndex: number;
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
];

/** Integer key for a tile; the offsets keep slightly out-of-bounds starts distinct. */
function tileKey(x: number, y: number): number {
  return (y + 0x8000) * 0x10000 + (x + 0x8000);
}

function before(a: AStarNode, b: AStarNode): boolean {
  return a.f < b.f || (a.f === b.f && a.rank < b.rank);
}

/** Binary min-heap on (f, rank) with in-place decrease-key. */
class OpenHeap {
  private items: AStarNode[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: AStarNode): void {
    node.heapIndex = this.items.length;
    this.items.push(node);
    this.siftUp(node.heapIndex);
  }

  pop(): AStarNode {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      last.heapIndex = 0;
      this.siftDown(0);
    }
    top.heapIndex = -1;
    return top;
  }

  /** Restore order after a node's key changed in either direction. */
  update(node: AStarNode): void {
    const index = node.heapIndex;
    this.siftUp(index);
    if (node.heapIndex === index) this.siftDown(index);
  }

  private siftUp(index: number): void {
    const items = this.items;
    const node = items[index];
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      const parent = items[parentIndex];
      if (!before(node, parent)) break;
      items[index] = parent;
      parent.heapIndex = index;
      index = parentIndex;
    }
    items[index] = node;
    node.heapIndex = index;
  }

  private siftDown(index: number): void {
    const items = this.items;
    const length = items.length;
    const node = items[index];
    for (;;) {
      const left = index * 2 + 1;
      if (left >= length) break;
      const right = left + 1;
      const child = right < length && before(items[right], items[left]) ? right : left;
      if (!before(items[child], node)) break;
      items[index] = items[child];
      items[index].heapIndex = index;
      index = child;
    }
    items[index] = node;
    node.heapIndex = index;
  }
}

interface Improvement {
  node: AStarNode;
  g: number;
  h: number;
  f: number;
}

export function findPath(grid: PathGrid, start: Vector2, end: Vector2, maxSteps = 2000): Vector2[] | null {
  const endTileX = Math.round(end.x);
  const endTileY = Math.round(end.y);
  const startTileX = Math.round(start.x);
  const startTileY = Math.round(start.y);

  if (!grid.isWalkable(endTileX, endTileY)) return null;

  const open = new OpenHeap();
  const nodes = new Map<number, AStarNode>();
  let nextRank = 0;

  const startH = heuristic(startTileX, startTileY, endTileX, endTileY);
  const startNode: AStarNode = {
    x: startTileX,
    y: startTileY,
    g: 0,
    h: startH,
    f: startH,
    parent: null,
    rank: nextRank++,
    heapIndex: -1,
  };
  nodes.set(tileKey(startTileX, startTileY), startNode);
  open.push(startNode);

  const improved: Improvement[] = [];
  const added: AStarNode[] = [];

  let steps = 0;
  while (open.size > 0 && steps < maxSteps) {
    steps++;
    const current = open.pop();

    if (current.x === endTileX && current.y === endTileY) {
      return reconstructPath(current);
    }

    improved.length = 0;
    added.length = 0;
    for (const [dx, dy] of DIRS) {
      const nx = current.x + dx;
      const ny = current.y + dy;

      const existing = nodes.get(tileKey(nx, ny));
      if (existing && existing.heapIndex === -1) continue; // closed
      if (!grid.isWalkable(nx, ny)) continue;

      // Prevent diagonal movement through walls
      if (dx !== 0 && dy !== 0) {
        if (!grid.isWalkable(current.x + dx, current.y) ||
            !grid.isWalkable(current.x, current.y + dy)) continue;
      }

      const moveCost = (dx !== 0 && dy !== 0) ? 1.414 : 1;
      const g = current.g + moveCost;
      const h = heuristic(nx, ny, endTileX, endTileY);
      const f = g + h;

      if (existing) {
        if (existing.g <= g) continue;
        improved.push({ node: existing, g, h, f });
      } else {
        added.push({ x: nx, y: ny, g, h, f, parent: current, rank: 0, heapIndex: -1 });
      }
    }

    // The old list kept an improved node where it sat and appended new ones,
    // then re-sorted stably. So a node whose f dropped lands after the nodes
    // already holding that f, in its previous order, and before this step's
    // new nodes. A node whose f stayed the same keeps its place.
    if (improved.length > 1) {
      improved.sort((a, b) => (before(a.node, b.node) ? -1 : 1));
    }
    for (const change of improved) {
      const node = change.node;
      const fDropped = change.f !== node.f;
      node.g = change.g;
      node.h = change.h;
      node.f = change.f;
      node.parent = current;
      if (fDropped) node.rank = nextRank++;
      open.update(node);
    }
    for (const node of added) {
      node.rank = nextRank++;
      nodes.set(tileKey(node.x, node.y), node);
      open.push(node);
    }
  }

  return null; // No path found
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  // Octile distance
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
}

function reconstructPath(node: AStarNode): Vector2[] {
  const path: Vector2[] = [];
  let current: AStarNode | null = node;
  while (current) {
    path.push({ x: current.x, y: current.y });
    current = current.parent;
  }
  return path.reverse();
}
