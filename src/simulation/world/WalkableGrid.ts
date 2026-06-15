export interface WalkableGrid {
  readonly width: number;
  readonly height: number;
  isWalkable(x: number, y: number): boolean;
  getNeighbors(x: number, y: number): Array<{ x: number; y: number }>;
}
