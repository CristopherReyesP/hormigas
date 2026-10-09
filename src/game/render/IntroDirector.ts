import type { Camera } from '../../engine/camera/Camera';
import { TILE_SIZE } from '../../shared/constants';
import { IntroClock, introCameraFocus, introCameraZoom, introLitAreas, type Vec2 } from './introTimeline';

/** Lights a ground circle for this frame: tile center, radius in tiles. */
export type GroundLight = (tileX: number, tileY: number, radius: number) => void;

/**
 * The intro's camera operator. Each rendered frame it advances its own
 * IntroClock, frames the shot from introTimeline (colony → chase the meteor
 * → crater close-up → glide home) and lights the ground the fireball is over,
 * so the chase crosses lit terrain instead of black fog.
 *
 * RenderSystem owns the MeteorIntro that draws; GameManager feeds this
 * director the same render `dt` right before the frame is drawn, so both
 * clocks read the same intro time and the camera stays locked to the art.
 */
export class IntroDirector {
  private readonly clock = new IntroClock();
  private active = true;
  private readonly camera: Camera;
  /** World px of the nest and the impact */
  private readonly nest: Vec2;
  private readonly impact: Vec2;
  private readonly light: GroundLight;

  constructor(camera: Camera, nest: Vec2, impact: Vec2, light: GroundLight) {
    this.camera = camera;
    this.nest = nest;
    this.impact = impact;
    this.light = light;
  }

  /** Once per rendered frame, before drawing; `dt` is the render dt (0 while paused). */
  frame(dt: number): void {
    if (!this.active) return;
    this.clock.advance(dt);
    if (!this.clock.isPlaying()) {
      this.finish();
      return;
    }
    const t = this.clock.elapsed;
    const focus = introCameraFocus(t, this.nest, this.impact);
    this.camera.direct({ x: focus.x, y: focus.y, zoom: introCameraZoom(t, this.camera.getDefaultZoom()) });
    for (const area of introLitAreas(t, this.nest, this.impact)) {
      this.light(Math.floor(area.x / TILE_SIZE), Math.floor(area.y / TILE_SIZE), area.r);
    }
  }

  /** The intro ended or was skipped: camera home on the colony at the player's zoom, control back. */
  finish(): void {
    if (!this.active) return;
    this.active = false;
    this.camera.release({ x: this.nest.x, y: this.nest.y, zoom: this.camera.getDefaultZoom() });
  }

  isActive(): boolean {
    return this.active;
  }

  /** Intro seconds so far. */
  elapsed(): number {
    return this.clock.elapsed;
  }
}
