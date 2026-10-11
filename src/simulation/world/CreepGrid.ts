import { CREEP_SOLID, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';

/** Mycelium coverage (0-255) per surface tile; CREEP_SOLID and up is creep. */
export class CreepGrid {
  readonly width: number;
  readonly height: number;
  readonly coverage: Uint8Array;

  constructor(width = WORLD_WIDTH, height = WORLD_HEIGHT) {
    this.width = width;
    this.height = height;
    this.coverage = new Uint8Array(width * height);
  }

  get(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.coverage[y * this.width + x];
  }

  /** Is the surface tile under this position creep (surface positions round to tiles) */
  isCreepAt(x: number, y: number): boolean {
    return this.get(Math.round(x), Math.round(y)) >= CREEP_SOLID;
  }

  clear(): void {
    this.coverage.fill(0);
  }
}
