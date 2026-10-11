// Draws the Human rival on the surface: buildings stacked in floors (on
// explored ground, like dens), troops from the baked human sprites (only
// where the colony sees now, like every enemy unit), and gunfire: rifle
// tracers, sniper streaks, bunker bursts and tank shells (visual only).
// RenderSystem calls it once per frame.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import { TILE_SIZE } from '../../shared/constants';
import { PAL } from '../../engine/renderer/pixelart/palette';
import { UNIT_ART_PX, drawUnitFrame } from '../../engine/renderer/crystalUnits';
import { HUMAN_FRAME_MS, bakeHumanUnit, type HumanUnitKind } from '../../engine/renderer/humanUnits';
import { isTileVisible, type VisibilityReader } from '../../engine/renderer/fogVisibility';
import {
  COMPONENT,
  Layer,
  type CombatComponent,
  type FacingComponent,
  type HealthComponent,
  type LayerComponent,
  type PositionComponent,
} from '../components/components';
import { HUMAN_BUILDING_STATS } from '../rival/humanBase';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent } from '../rival/humanComponents';
import { drawHumanBuilding, humanBuildingArtSize } from '../rival/humanArt';
import { humanShotsFor, type HumanShot } from '../rival/humanShots';

type Ctx = CanvasRenderingContext2D;

/** RenderSystem's segmented health bar */
export type HealthBarDrawer = (
  ctx: Ctx, px: number, py: number, current: number, max: number, alwaysShow: boolean, scale: number, yOffset: number,
) => void;

interface Frames {
  right: OffscreenCanvas[];
  left: OffscreenCanvas[];
}

/** World px a muzzle sits above a unit's feet */
const MUZZLE_LIFT = TILE_SIZE * 0.55;

/**
 * Walk frame for a unit at render time `time` (s). The render clock can be
 * negative or not yet set while the intro hands over, so wrap into range.
 */
export function humanFrameIndex(time: number, id: number, count: number): number {
  const tick = Number.isFinite(time) ? Math.floor((time * 1000) / HUMAN_FRAME_MS) : 0;
  return (((tick + id) % count) + count) % count;
}

export class HumanRenderer {
  private world: World;
  private fog: VisibilityReader;
  private frames = new Map<HumanUnitKind, Frames>();

  constructor(world: World, fog: VisibilityReader) {
    this.world = world;
    this.fog = fog;
  }

  /** `hide`: entities to leave out this frame (a Human player's base while their opening raises it). */
  draw(ctx: Ctx, interpolation: number, time: number, healthBar: HealthBarDrawer, hide?: (id: EntityId) => boolean): void {
    let buildings = this.world.query(HUMAN_COMPONENT.BUILDING, COMPONENT.POSITION);
    let units = this.world.query(HUMAN_COMPONENT.UNIT, COMPONENT.POSITION);
    if (hide) {
      buildings = buildings.filter((id) => !hide(id));
      units = units.filter((id) => !hide(id));
    }
    if (buildings.length === 0 && units.length === 0 && humanShotsFor(this.world).live().length === 0) return;
    ctx.imageSmoothingEnabled = false;

    // Back to front, so a building lower on the map overlaps the one behind it
    const sorted = [...buildings].sort((a, b) => this.posOf(a).y - this.posOf(b).y || a - b);
    for (const id of sorted) this.drawBuilding(ctx, id, time, healthBar);
    for (const id of units) this.drawUnit(ctx, id, interpolation, time, healthBar);
    this.drawShots(ctx);
  }

  private posOf(id: EntityId): PositionComponent {
    return this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
  }

  private onSurface(id: EntityId): boolean {
    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
    return !layer || layer.layer === Layer.Surface;
  }

  private drawBuilding(ctx: Ctx, id: EntityId, time: number, healthBar: HealthBarDrawer): void {
    if (!this.onSurface(id)) return;
    const pos = this.posOf(id);
    if (!this.fog.isExplored(Math.round(pos.x), Math.round(pos.y))) return;
    const building = this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!;
    const stats = HUMAN_BUILDING_STATS[building.kind];
    const px = pos.x * TILE_SIZE + TILE_SIZE / 2;
    const ground = pos.y * TILE_SIZE + TILE_SIZE / 2 + stats.halfWidth * TILE_SIZE * 0.5;
    const progress = building.constructing > 0 ? 1 - building.constructing / Math.max(1, stats.buildTime) : 1;
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    const target = combat?.targetEntityId != null ? this.world.getComponent<PositionComponent>(combat.targetEntityId, COMPONENT.POSITION) : null;
    drawHumanBuilding(ctx, building.kind, px, ground, UNIT_ART_PX, { progress, time, faceLeft: target ? target.x < pos.x : true });
    const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (health) {
      const art = humanBuildingArtSize(building.kind);
      healthBar(ctx, px, ground, health.current, health.max, true, building.kind === 'command_center' ? 2 : 1, -art.height * UNIT_ART_PX - 10);
    }
  }

  private framesOf(kind: HumanUnitKind): Frames {
    let frames = this.frames.get(kind);
    if (!frames) {
      const sheet = bakeHumanUnit(kind);
      const right = sheet.frames.map((frame) => {
        const canvas = new OffscreenCanvas(frame.width * UNIT_ART_PX, frame.height * UNIT_ART_PX);
        drawUnitFrame(canvas.getContext('2d')!, frame, 0, 0);
        return canvas;
      });
      const left = right.map((src) => {
        const canvas = new OffscreenCanvas(src.width, src.height);
        const c = canvas.getContext('2d')!;
        c.translate(src.width, 0);
        c.scale(-1, 1);
        c.drawImage(src, 0, 0);
        return canvas;
      });
      frames = { right, left };
      this.frames.set(kind, frames);
    }
    return frames;
  }

  /** Human troops that broke into the nest (the underground frame has no fog) */
  drawUnderground(ctx: Ctx, interpolation: number, time: number, healthBar: HealthBarDrawer): void {
    ctx.imageSmoothingEnabled = false;
    for (const id of this.world.query(HUMAN_COMPONENT.UNIT, COMPONENT.POSITION)) {
      if (this.onSurface(id)) continue;
      this.drawUnit(ctx, id, interpolation, time, healthBar, true);
    }
  }

  private drawUnit(ctx: Ctx, id: EntityId, interpolation: number, time: number, healthBar: HealthBarDrawer, below = false): void {
    if (this.onSurface(id) === below) return;
    const pos = this.posOf(id);
    if (!below && !isTileVisible(this.fog, Math.round(pos.x), Math.round(pos.y))) return;
    const unit = this.world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!;
    const x = pos.prevX + (pos.x - pos.prevX) * interpolation;
    const y = pos.prevY + (pos.y - pos.prevY) * interpolation;
    const px = x * TILE_SIZE + TILE_SIZE / 2;
    const py = y * TILE_SIZE + TILE_SIZE / 2;

    // Face the enemy it shoots at, else the way it walks
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    const target = combat?.targetEntityId != null ? this.world.getComponent<PositionComponent>(combat.targetEntityId, COMPONENT.POSITION) : null;
    const facing = this.world.getComponent<FacingComponent>(id, COMPONENT.FACING);
    const left = target ? target.x < pos.x : Math.cos(facing?.angle ?? 0) < 0;

    const kind: HumanUnitKind = unit.type === 'builder' ? 'soldier' : unit.type;
    const set = this.framesOf(kind);
    const frames = left ? set.left : set.right;
    if (frames.length === 0) return;
    const frame = frames[humanFrameIndex(time, id, frames.length)];
    const scale = unit.type === 'builder' ? 0.75 : 1;
    const w = Math.round(frame.width * scale);
    const h = Math.round(frame.height * scale);
    const dx = Math.round(px - w / 2);
    const dy = Math.round(py - h + TILE_SIZE * 0.35);
    ctx.drawImage(frame, dx, dy, w, h);
    if (unit.type === 'builder') {
      // The builder's hard hat and toolbox, in hazard amber
      ctx.fillStyle = PAL.human.visor;
      ctx.fillRect(dx + Math.round(w * 0.3), dy + Math.round(h * 0.08), Math.round(w * 0.4), 4);
      if (unit.state === 'building' && Math.floor(time * 6) % 2 === 0) {
        ctx.fillStyle = PAL.healthYellow;
        ctx.fillRect(dx + (left ? -2 : w - 2), dy + Math.round(h * 0.5), 4, 4); // welding sparks
      }
    }
    const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (health) healthBar(ctx, px, py, health.current, health.max, false, 1, -h + TILE_SIZE * 0.1);
  }

  private visible(x: number, y: number): boolean {
    return isTileVisible(this.fog, Math.round(x), Math.round(y));
  }

  private drawShots(ctx: Ctx): void {
    const shots = humanShotsFor(this.world).live();
    if (shots.length === 0) return;
    ctx.save();
    for (const shot of shots) {
      if (!this.visible(shot.fromX, shot.fromY) && !this.visible(shot.toX, shot.toY)) continue;
      this.drawShot(ctx, shot);
    }
    ctx.restore();
  }

  private drawShot(ctx: Ctx, shot: HumanShot): void {
    const fx = shot.fromX * TILE_SIZE + TILE_SIZE / 2;
    const fy = shot.fromY * TILE_SIZE + TILE_SIZE / 2 - MUZZLE_LIFT;
    const tx = shot.toX * TILE_SIZE + TILE_SIZE / 2;
    const ty = shot.toY * TILE_SIZE + TILE_SIZE / 2 - TILE_SIZE * 0.2;
    const t = shot.age / shot.life;
    if (shot.kind === 'shell') {
      this.drawShell(ctx, fx, fy, tx, ty, t, shot.fromX === shot.toX && shot.fromY === shot.toY);
      return;
    }
    // A tracer: a bright streak racing from the muzzle, then fading on the target
    const head = Math.min(1, t * 2.5);
    const tail = Math.max(0, head - (shot.kind === 'sniper' ? 0.9 : 0.45));
    const color = shot.kind === 'sniper' ? PAL.white : shot.kind === 'turret' ? PAL.healthYellow : PAL.human.visor;
    const width = shot.kind === 'turret' ? 3 : 2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(fx + (tx - fx) * tail, fy + (ty - fy) * tail);
    ctx.lineTo(fx + (tx - fx) * head, fy + (ty - fy) * head);
    ctx.stroke();
    // Muzzle flash on the first frames
    if (t < 0.4) {
      ctx.fillStyle = PAL.healthYellow;
      ctx.fillRect(Math.round(fx - 3), Math.round(fy - 3), 6, 6);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(Math.round(fx - 1), Math.round(fy - 1), 2, 2);
    }
    // Impact spark
    if (head >= 1) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(tx - 2), Math.round(ty - 2), 4, 4);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** A tank shell lobs in an arc, then bursts (a building collapse is a burst on the spot) */
  private drawShell(ctx: Ctx, fx: number, fy: number, tx: number, ty: number, t: number, burstOnly: boolean): void {
    const flight = burstOnly ? 0 : 0.6;
    ctx.globalCompositeOperation = 'lighter';
    if (t < flight) {
      const k = t / flight;
      const x = fx + (tx - fx) * k;
      const y = fy + (ty - fy) * k - Math.sin(k * Math.PI) * TILE_SIZE * 0.8;
      ctx.fillStyle = PAL.healthYellow;
      ctx.fillRect(Math.round(x - 3), Math.round(y - 3), 6, 6);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
    } else {
      const k = flight >= 1 ? 1 : (t - flight) / (1 - flight);
      const radius = TILE_SIZE * (burstOnly ? 1.2 : 0.9) * (0.3 + k);
      ctx.strokeStyle = k < 0.5 ? PAL.healthYellow : PAL.dangerRed;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(tx, ty, radius, 0, Math.PI * 2);
      ctx.stroke();
      if (k < 0.4) {
        ctx.fillStyle = PAL.white;
        ctx.fillRect(Math.round(tx - 6), Math.round(ty - 6), 12, 12);
      }
    }
    // The muzzle blast
    if (!burstOnly && t < 0.2) {
      ctx.fillStyle = PAL.healthYellow;
      ctx.fillRect(Math.round(fx - 5), Math.round(fy - 5), 10, 10);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
