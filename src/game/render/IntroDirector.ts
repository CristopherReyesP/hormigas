import type { Camera } from '../../engine/camera/Camera';
import { TILE_SIZE } from '../../shared/constants';
import {
  introCameraFocus,
  introCameraZoom,
  introLitAreas,
  isPlayerArrival,
  playerIntroCameraFocus,
  playerIntroLitAreas,
  type IntroClock,
  type IntroVariant,
  type Vec2,
} from './introTimeline';

/** A player race's own opening: where its arrival comes in from, and the rival base the camera glances toward (world px). */
export interface PlayerIntroShot {
  from: Vec2;
  rival: Vec2 | null;
}

/** Lights a ground circle for this frame: tile center, radius in tiles. */
export type GroundLight = (tileX: number, tileY: number, radius: number) => void;

/**
 * The intro's camera operator. Each rendered frame it reads the intro clock,
 * frames the shot from introTimeline (colony → chase the meteor or the
 * dropship → close-up on where it came down → glide home) and lights the
 * ground it is over, so the chase crosses lit terrain instead of black fog.
 * `impact` is the variant's target: the crater, or the Human base site.
 * A Crystal or Human player's own opening lands at home (`impact` is the
 * nest tile) and `shot` says where it comes in from and where the rival is.
 *
 * GameManager owns the one IntroClock and advances it right before the frame
 * is drawn; this director and the MeteorIntro that draws (inside RenderSystem)
 * only read it, so the camera stays locked to the art.
 */
export class IntroDirector {
  private readonly clock: IntroClock;
  private active = true;
  private readonly camera: Camera;
  /** World px of the nest and the impact */
  private readonly nest: Vec2;
  private readonly impact: Vec2;
  private readonly light: GroundLight;
  private readonly variant: IntroVariant;
  private readonly shot: PlayerIntroShot | null;

  constructor(
    camera: Camera,
    clock: IntroClock,
    nest: Vec2,
    impact: Vec2,
    light: GroundLight,
    variant: IntroVariant = 'crystal',
    shot: PlayerIntroShot | null = null,
  ) {
    this.camera = camera;
    this.shot = isPlayerArrival(variant) ? (shot ?? { from: nest, rival: null }) : null;
    this.variant = variant;
    this.clock = clock;
    this.nest = nest;
    this.impact = impact;
    this.light = light;
  }

  /** Once per rendered frame, after the clock advanced and before drawing. */
  frame(): void {
    if (!this.active) return;
    if (!this.clock.isPlaying()) {
      this.finish();
      return;
    }
    const t = this.clock.elapsed;
    const shot = this.shot;
    const focus = shot
      ? playerIntroCameraFocus(t, shot.from, this.impact, shot.rival, this.variant)
      : introCameraFocus(t, this.nest, this.impact, this.variant);
    this.camera.direct({ x: focus.x, y: focus.y, zoom: introCameraZoom(t, this.camera.getDefaultZoom()) });
    const lit = shot
      ? playerIntroLitAreas(t, shot.from, this.impact, shot.rival, this.variant)
      : introLitAreas(t, this.nest, this.impact, this.variant);
    for (const area of lit) {
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
