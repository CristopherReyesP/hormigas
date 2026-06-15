export class VisibilityGrid {
  readonly width: number;
  readonly height: number;
  private explored: Uint8Array;
  private brightness: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.explored = new Uint8Array(width * height);
    this.brightness = new Uint8Array(width * height);
  }

  resetBrightness(): void {
    this.brightness.fill(0);
  }

  revealCircle(centerTileX: number, centerTileY: number, radius: number): void {
    const r2 = radius * radius;
    const minX = Math.max(0, Math.floor(centerTileX - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(centerTileX + radius));
    const minY = Math.max(0, Math.floor(centerTileY - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(centerTileY + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - centerTileX;
        const dy = y - centerTileY;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > r2) continue;

        const idx = y * this.width + x;
        const t = Math.sqrt(dist2) / radius;
        const value = Math.round(255 * (1 - t * t)); // quadratic falloff

        if (value > this.brightness[idx]) {
          this.brightness[idx] = value;
        }

        this.explored[idx] = 1;
      }
    }
  }

  revealArea(centerX: number, centerY: number, radius: number): void {
    this.revealCircle(centerX, centerY, radius);
  }

  isExplored(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.explored[y * this.width + x] === 1;
  }

  getBrightness(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.brightness[y * this.width + x];
  }
}
