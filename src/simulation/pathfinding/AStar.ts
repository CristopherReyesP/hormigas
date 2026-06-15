import type { TileGrid } from '../world/TileGrid';
import type { Vector2 } from '../../shared/types';

interface AStarNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: AStarNode | null;
}

export function findPath(grid: TileGrid, start: Vector2, end: Vector2, maxSteps = 2000): Vector2[] | null {
  const endTileX = Math.round(end.x);
  const endTileY = Math.round(end.y);
  const startTileX = Math.round(start.x);
  const startTileY = Math.round(start.y);

  if (!grid.isWalkable(endTileX, endTileY)) return null;

  const open: AStarNode[] = [];
  const closed = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;

  const startNode: AStarNode = {
    x: startTileX,
    y: startTileY,
    g: 0,
    h: heuristic(startTileX, startTileY, endTileX, endTileY),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.g + startNode.h;
  open.push(startNode);

  let steps = 0;
  while (open.length > 0 && steps < maxSteps) {
    steps++;
    // Find node with lowest f
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;

    if (current.x === endTileX && current.y === endTileY) {
      return reconstructPath(current);
    }

    closed.add(key(current.x, current.y));

    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    for (const [dx, dy] of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;

      if (closed.has(key(nx, ny))) continue;
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

      const existing = open.find(n => n.x === nx && n.y === ny);
      if (existing && existing.g <= g) continue;

      if (existing) {
        existing.g = g;
        existing.h = h;
        existing.f = f;
        existing.parent = current;
      } else {
        open.push({ x: nx, y: ny, g, h, f, parent: current });
      }
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
    path.unshift({ x: current.x, y: current.y });
    current = current.parent;
  }
  return path;
}
