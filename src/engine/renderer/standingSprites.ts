import { beginBillboard, type BillboardCamera } from './uprightOverlay';

/** What the standing pass reads from the camera (Camera satisfies it). */
export interface StandingCamera extends BillboardCamera {
  worldToScreen(worldX: number, worldY: number): { x: number; y: number };
}

interface Deferred {
  depth: number;
  order: number;
  transform: { a: number; b: number; c: number; d: number; e: number; f: number };
  alpha: number;
  draw: () => void;
}

/** Ground shadow under standing art that has none of its own (only drawn while tilted). */
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.28)';

/**
 * Units and tall props under a tilted camera. Their ground marks (shadow,
 * selection ellipse, glow) are drawn at once in the tilted ground plane; their
 * bodies are queued with `add` and painted back to front by the screen Y of
 * their ground point (the painter's algorithm), each un-squashed via
 * `billboard`. With a flat camera, or none (the underground), `add` and
 * `after` draw immediately in call order, so top-down rendering is unchanged.
 */
export class StandingSprites {
  private ctx: CanvasRenderingContext2D | null = null;
  private camera: StandingCamera | null = null;
  private tilted = false;
  private items: Deferred[] = [];
  private trailing: Array<() => void> = [];

  /** Start a pass with the camera of the view being drawn. */
  begin(ctx: CanvasRenderingContext2D, camera: StandingCamera | null | undefined): void {
    this.ctx = ctx;
    this.camera = camera ?? null;
    this.tilted = !!camera && camera.getTilt() > 0;
    this.items.length = 0;
    this.trailing.length = 0;
  }

  isTilted(): boolean {
    return this.tilted;
  }

  /**
   * A standing body on the ground point (worldX, worldY), in the units of the
   * current transform. Tilted, it waits for `flush` and replays under the
   * transform and alpha it was queued with.
   */
  add(worldX: number, worldY: number, draw: () => void): void {
    if (!this.tilted || !this.ctx || !this.camera) {
      draw();
      return;
    }
    this.items.push({
      depth: this.camera.worldToScreen(worldX, worldY).y,
      order: this.items.length,
      transform: this.ctx.getTransform(),
      alpha: this.ctx.globalAlpha,
      draw,
    });
  }

  /** Air effects that belong over every standing body (gunfire). */
  after(draw: () => void): void {
    if (this.tilted) this.trailing.push(draw);
    else draw();
  }

  /**
   * Begin drawing a body anchored at (x, y): upright and un-squashed while
   * tilted, untouched while flat. Returns the heading to draw with. Always
   * pair it with ctx.restore().
   */
  billboard(ctx: CanvasRenderingContext2D, x: number, y: number, options: { height?: number; heading?: number } = {}): number {
    if (!this.tilted || !this.camera) {
      ctx.save();
      return options.heading ?? 0;
    }
    return beginBillboard(ctx, this.camera, x, y, options);
  }

  /** A soft ground shadow for art that brings none, only while tilted (flat art stays as it was). */
  shadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
    if (!this.tilted) return;
    ctx.save();
    ctx.fillStyle = SHADOW_COLOR;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Paint the queued bodies back to front, then the trailing effects; the pass ends flat. */
  flush(): void {
    const ctx = this.ctx;
    if (this.tilted && ctx) {
      this.items.sort((p, q) => p.depth - q.depth || p.order - q.order);
      for (const item of this.items) {
        ctx.save();
        const t = item.transform;
        ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
        ctx.globalAlpha = item.alpha;
        item.draw();
        ctx.restore();
      }
      for (const draw of this.trailing) draw();
    }
    this.items.length = 0;
    this.trailing.length = 0;
    this.tilted = false;
    this.camera = null;
    this.ctx = null;
  }
}
