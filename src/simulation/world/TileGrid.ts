import { WORLD_WIDTH, WORLD_HEIGHT } from '../../shared/constants';
import { TerrainType, type Tile } from './types';
import type { WalkableGrid } from './WalkableGrid';
import { fullBounds, inBounds, insetBounds, onRing, type TileBounds } from './frontier';

export class TileGrid implements WalkableGrid {
  private tiles: Tile[];
  readonly width = WORLD_WIDTH;
  readonly height = WORLD_HEIGHT;
  private seed: number;
  /** Where the run plays now: Phase 1's zone inside the thorn wall, or the whole map */
  bounds: TileBounds = fullBounds(WORLD_WIDTH, WORLD_HEIGHT);
  /** Phase 1's zone, its wall included, while the frontier is sealed; null once it opens */
  frontier: TileBounds | null = null;

  constructor() {
    this.seed = Math.floor(Math.random() * 2147483647);
    this.tiles = new Array(WORLD_WIDTH * WORLD_HEIGHT);
    this.generate();
  }

  private generate(): void {
    // Multi-octave noise for natural terrain — seed makes it unique each load
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const noise = this.multiOctaveNoise(x, y);
        let terrain: TerrainType;
        let walkable = true;

        if (noise < 0.12) {
          terrain = TerrainType.Water;
          walkable = false;
        } else if (noise < 0.20) {
          terrain = TerrainType.Sand;
        } else if (noise < 0.60) {
          terrain = TerrainType.Dirt;
        } else if (noise < 0.82) {
          terrain = TerrainType.Grass;
        } else {
          terrain = TerrainType.Stone;
          walkable = false;
        }

        this.tiles[y * this.width + x] = {
          terrain,
          walkable,
          foodPheromone: 0,
          homePheromone: 0,
          dangerPheromone: 0,
        };
      }
    }

    // Guarantee nest area (center) is always walkable
    this.clearNestArea();
  }

  private clearNestArea(): void {
    const cx = Math.floor(this.width / 2);
    const cy = Math.floor(this.height / 2);
    const radius = 6;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) continue;
        const tile = this.tiles[ty * this.width + tx];
        tile.terrain = TerrainType.Dirt;
        tile.walkable = true;
      }
    }
  }

  private multiOctaveNoise(x: number, y: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 0.06;
    let maxValue = 0;

    for (let i = 0; i < 4; i++) {
      value += this.simpleNoise(x * frequency, y * frequency, i) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / maxValue;
  }

  private simpleNoise(x: number, y: number, octave: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    const a = this.hash(ix, iy, octave);
    const b = this.hash(ix + 1, iy, octave);
    const c = this.hash(ix, iy + 1, octave);
    const d = this.hash(ix + 1, iy + 1, octave);

    // Smoothstep interpolation
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);

    return this.lerp(
      this.lerp(a, b, ux),
      this.lerp(c, d, ux),
      uy
    );
  }

  private hash(x: number, y: number, octave: number): number {
    // Seed + octave make terrain unique each game
    let h = (x * 374761393 + y * 668265263 + octave * 1013904223 + this.seed) >>> 0;
    h = ((h ^ (h >> 13)) * 1274126177) >>> 0;
    h = ((h ^ (h >> 16)) * 2654435761) >>> 0;
    return (h & 0xffff) / 0xffff;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Phase 1: everything outside `zone` is sealed and the zone's outer ring
   * (`wall` tiles deep) becomes the thorn wall. The run then plays inside it.
   */
  sealFrontier(zone: TileBounds, wall: number): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = this.tiles[y * this.width + x];
        if (!inBounds(zone, x, y)) {
          tile.sealed = true;
          tile.walkable = false;
        } else if (onRing(zone, x, y, wall)) {
          tile.thorns = true;
          tile.walkable = false;
        }
      }
    }
    this.frontier = { ...zone };
    this.bounds = insetBounds(zone, wall);
  }

  /** Phase 2: the wall crumbles and the outer ring opens; returns the tiles that opened */
  openFrontier(): number {
    if (!this.frontier) return 0;
    let opened = 0;
    for (const tile of this.tiles) {
      if (!tile.sealed && !tile.thorns) continue;
      delete tile.sealed;
      delete tile.thorns;
      tile.walkable = tile.terrain !== TerrainType.Water && tile.terrain !== TerrainType.Stone;
      opened++;
    }
    this.frontier = null;
    this.bounds = fullBounds(this.width, this.height);
    return opened;
  }

  /** The tile is beyond the wall or part of it (sealed until Phase 2) */
  isSealed(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    return tile !== null && (tile.sealed === true || tile.thorns === true);
  }

  getTile(x: number, y: number): Tile | null {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
    return this.tiles[y * this.width + x];
  }

  setTile(x: number, y: number, tile: Partial<Tile>): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const existing = this.tiles[y * this.width + x];
    Object.assign(existing, tile);
  }

  isWalkable(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    return tile !== null && tile.walkable;
  }

  getNeighbors(x: number, y: number): Array<{ x: number; y: number; tile: Tile }> {
    const neighbors: Array<{ x: number; y: number; tile: Tile }> = [];
    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const tile = this.getTile(nx, ny);
      if (tile) neighbors.push({ x: nx, y: ny, tile });
    }
    return neighbors;
  }
}
