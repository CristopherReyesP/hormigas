// World-space art for the night-wave extras: nest defenses (Espina, Trampa
// de resina, Muro de quitina), elite outlines and affix icons, mini-boss
// crowns, the wave effects (heal pulses, blasts and their telegraphs, boss
// charges, spine shots), the defense build ghost and the scouted breach.
// RenderSystem calls these with its camera transform already applied, so
// everything is in world px: an entity at tile x is drawn at x * T + T / 2.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import { TILE_SIZE } from '../../shared/constants';
import { PAL, withAlpha } from '../../engine/renderer/pixelart/palette';
import {
  COMPONENT,
  Layer,
  type HealthComponent,
  type LayerComponent,
  type LayerValue,
  type PositionComponent,
  type RenderComponent,
} from '../components/components';
import { ELITE_AFFIXES, ELITE_COMPONENT, type EliteComponent } from '../run/eliteAffixes';
import { BOSS_COMPONENT, type BossComponent } from '../run/miniBoss';
import { DEFENSE_AREA, DEFENSE_STATS, STRUCTURE_COMPONENT, type DefenseKind, type StructureComponent } from '../run/defenses';
import { waveRuntimeFor, type WaveFx } from '../run/waveRuntime';
import { HUMAN_COMPONENT } from '../rival/humanComponents';

const T = TILE_SIZE;

/** What the GameManager hands the renderer each frame */
export interface WaveOverlay {
  /** The defense build tool's preview, on the layer in view */
  ghost: {
    kind: DefenseKind;
    layer: 'surface' | 'underground';
    x: number;
    y: number;
    valid: boolean;
    reason?: string;
    cost: number;
    range: number;
  } | null;
  /** While building: the tiles the build area is around on the layer in view */
  anchors: Array<{ x: number; y: number }>;
  /**
   * Scouted next wave: the breach entrance (underground); on the surface the
   * raiders' origin, the edge the beetles leave from and the mound hole they march on
   */
  scout: {
    breach: { x: number; y: number } | null;
    origin: { x: number; y: number } | null;
    wildlife?: { x: number; y: number } | null;
    hole?: { x: number; y: number } | null;
    nest: { x: number; y: number };
  } | null;
  /** Invaders inside the nest while the player watches the surface (0: none): the mound throbs red */
  nestAttack?: number;
}

type Visible = (x: number, y: number) => boolean;

const px = (x: number) => x * T + T / 2;

function layerOf(world: World, id: EntityId): LayerValue {
  return world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface;
}

function where(world: World, id: EntityId, interpolation: number): { x: number; y: number } | null {
  const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
  if (!pos) return null;
  return { x: pos.prevX + (pos.x - pos.prevX) * interpolation, y: pos.prevY + (pos.y - pos.prevY) * interpolation };
}

function healthBar(ctx: CanvasRenderingContext2D, cx: number, top: number, width: number, health: HealthComponent): void {
  if (health.current >= health.max) return;
  const ratio = Math.max(0, health.current / Math.max(1, health.max));
  ctx.fillStyle = '#000';
  ctx.fillRect(Math.round(cx - width / 2) - 1, Math.round(top) - 1, width + 2, 4);
  ctx.fillStyle = ratio > 0.5 ? PAL.healthGreen : ratio > 0.25 ? PAL.healthYellow : PAL.dangerRed;
  ctx.fillRect(Math.round(cx - width / 2), Math.round(top), Math.round(width * ratio), 2);
}

// ── Defenses ────────────────────────────────────────────────

function drawSpine(ctx: CanvasRenderingContext2D, cx: number, cy: number, angle: number, time: number, alpha = 1): void {
  const flesh = PAL.swarm.flesh;
  const T = TILE_SIZE * 1.35; // a turret reads a size above the ants
  ctx.globalAlpha = alpha * 0.45;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, cy + T * 0.3, T * 0.45, T * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  // The chitin mound
  ctx.fillStyle = PAL.swarm.outline;
  ctx.beginPath();
  ctx.ellipse(cx, cy + T * 0.1, T * 0.42, T * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = flesh[2];
  ctx.beginPath();
  ctx.ellipse(cx, cy + T * 0.08, T * 0.36, T * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = flesh[3];
  ctx.beginPath();
  ctx.ellipse(cx - T * 0.08, cy, T * 0.18, T * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  // The glowing vein ring
  ctx.strokeStyle = withAlpha(PAL.swarm.vein[1], 0.6 + 0.3 * Math.sin(time * 4));
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy + T * 0.08, T * 0.3, T * 0.22, 0, 0, Math.PI * 2);
  ctx.stroke();
  // The spine, aimed at its target
  const len = T * 0.62;
  const tipX = cx + Math.cos(angle) * len;
  const tipY = cy - T * 0.05 + Math.sin(angle) * len * 0.8;
  const side = { x: -Math.sin(angle) * T * 0.1, y: Math.cos(angle) * T * 0.1 };
  ctx.fillStyle = PAL.sand[2];
  ctx.strokeStyle = PAL.swarm.outline;
  ctx.beginPath();
  ctx.moveTo(cx + side.x, cy - T * 0.05 + side.y);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(cx - side.x, cy - T * 0.05 - side.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawTrap(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, charge: number, time: number, alpha = 1): void {
  const r = radius * T;
  ctx.globalAlpha = alpha * (0.35 + 0.45 * charge);
  ctx.fillStyle = withAlpha(PAL.glowAmber, 0.55);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha('#c98a1e', 0.8);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.6, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // Bubbles while charged
  if (charge > 0) {
    for (let i = 0; i < 3; i++) {
      const phase = (time * 0.8 + i * 0.37) % 1;
      const bx = cx + Math.cos(i * 2.1) * r * 0.45;
      const by = cy + Math.sin(i * 2.1) * r * 0.3;
      ctx.fillStyle = withAlpha('#ffe27a', 1 - phase);
      ctx.fillRect(Math.round(bx), Math.round(by - phase * 3), 2, 2);
    }
  }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = withAlpha('#ffe27a', 0.7);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2 * Math.max(0.05, charge));
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawWall(ctx: CanvasRenderingContext2D, tileX: number, tileY: number, alpha = 1): void {
  const x = tileX * T;
  const y = tileY * T;
  const flesh = PAL.swarm.flesh;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PAL.swarm.outline;
  ctx.fillRect(x, y - T * 0.25, T, T * 1.25);
  // Three rows of chitin plates, offset like bricks
  const rows = 3;
  const h = (T * 1.15) / rows;
  for (let r = 0; r < rows; r++) {
    const top = y - T * 0.2 + r * h;
    const offset = r % 2 === 0 ? 0 : T / 4;
    for (let c = -1; c < 3; c++) {
      const left = x + offset + c * (T / 2);
      const l = Math.max(x + 1, left + 1);
      const rgt = Math.min(x + T - 1, left + T / 2 - 1);
      if (rgt <= l) continue;
      ctx.fillStyle = (r + c) % 2 === 0 ? flesh[2] : flesh[1];
      ctx.fillRect(l, top + 1, rgt - l, h - 2);
      ctx.fillStyle = flesh[3];
      ctx.fillRect(l, top + 1, rgt - l, 1);
    }
  }
  ctx.fillStyle = withAlpha(PAL.swarm.vein[1], 0.7);
  ctx.fillRect(x + T * 0.2, y + T * 0.45, T * 0.6, 1);
  ctx.globalAlpha = 1;
}

/** Every defense standing on `layer` */
export function drawDefenses(ctx: CanvasRenderingContext2D, world: World, layer: LayerValue, time: number): void {
  for (const id of world.query(STRUCTURE_COMPONENT)) {
    const s = world.getComponent<StructureComponent>(id, STRUCTURE_COMPONENT)!;
    if ((s.layer === 'surface' ? Layer.Surface : Layer.Underground) !== layer) continue;
    const cx = px(s.x);
    const cy = px(s.y);
    if (s.kind === 'spine') {
      const target = s.targetId !== null ? world.getComponent<PositionComponent>(s.targetId, COMPONENT.POSITION) : undefined;
      const angle = target ? Math.atan2(target.y - s.y, target.x - s.x) : -Math.PI / 2 + Math.sin(time * 0.7) * 0.4;
      drawSpine(ctx, cx, cy, angle, time);
    } else if (s.kind === 'trap') {
      const stats = DEFENSE_STATS.trap;
      const charge = s.charges > 0 ? s.charges / stats.charges : 0;
      drawTrap(ctx, cx, cy, stats.range, charge, time);
    } else {
      drawWall(ctx, s.x, s.y);
    }
    const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (health) healthBar(ctx, cx, cy - T * (s.kind === 'wall' ? 0.75 : 0.7), T, health);
  }
}

// ── Elites and bosses ───────────────────────────────────────

/** How far above its position a unit's head is: Crystal units hover tall, Human troops stand */
function headRoom(world: World, id: EntityId, r: number): number {
  if (world.getComponent(id, COMPONENT.CRYSTAL_UNIT)) return Math.max(r * 2.4, T * 1.6);
  if (world.getComponent(id, HUMAN_COMPONENT.UNIT)) return Math.max(r * 1.5, T * 0.9);
  return r;
}

/** Elites glow in their affix's color with its icon over the head; bosses wear an amber ring and a crown */
export function drawWaveUnits(
  ctx: CanvasRenderingContext2D,
  world: World,
  layer: LayerValue,
  time: number,
  interpolation: number,
  visible: Visible | null,
): void {
  for (const id of world.query(ELITE_COMPONENT)) {
    if (layerOf(world, id) !== layer) continue;
    const at = where(world, id, interpolation);
    if (!at || (visible && !visible(Math.round(at.x), Math.round(at.y)))) continue;
    const elite = world.getComponent<EliteComponent>(id, ELITE_COMPONENT)!;
    const info = ELITE_AFFIXES[elite.affix];
    const r = (world.getComponent<RenderComponent>(id, COMPONENT.RENDER)?.radius ?? 0.5) * T;
    const cx = px(at.x);
    const cy = px(at.y);
    const pulse = 0.55 + 0.35 * Math.sin(time * 5 + id);
    const color = elite.affix === 'furious' && elite.enraged ? '#ff1e3c' : info.color;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = withAlpha(color, 0.18 * pulse);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = withAlpha(color, 0.75 + 0.25 * pulse);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.35, r * 1.25, r * 0.75, 0, 0, Math.PI * 2);
    ctx.stroke();
    // The affix badge over the head
    const by = cy - headRoom(world, id, r) - 9;
    ctx.fillStyle = 'rgba(14, 8, 11, 0.85)';
    ctx.fillRect(Math.round(cx - 6), Math.round(by - 6), 12, 12);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(cx - 6) + 0.5, Math.round(by - 6) + 0.5, 11, 11);
    ctx.fillStyle = color;
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.icon, cx, by + 0.5);
  }
  for (const id of world.query(BOSS_COMPONENT)) {
    if (layerOf(world, id) !== layer) continue;
    const at = where(world, id, interpolation);
    if (!at || (visible && !visible(Math.round(at.x), Math.round(at.y)))) continue;
    const boss = world.getComponent<BossComponent>(id, BOSS_COMPONENT)!;
    if (boss.kind === 'crystal_queen') continue; // she has her own crown and aura
    const r = (world.getComponent<RenderComponent>(id, COMPONENT.RENDER)?.radius ?? 1) * T;
    const cx = px(at.x);
    const cy = px(at.y);
    const charging = boss.phase !== 'idle';
    const color = charging ? PAL.dangerRed : PAL.glowAmber;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = withAlpha(color, 0.22 + 0.12 * Math.sin(time * 6));
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.lineDashOffset = -time * 12;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.3, r * 1.35, r * 0.85, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // The crown
    const top = cy - headRoom(world, id, r) - 14;
    ctx.fillStyle = PAL.crystal.gold[1];
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 8, top + 7);
    ctx.lineTo(cx - 8, top);
    ctx.lineTo(cx - 4, top + 4);
    ctx.lineTo(cx, top - 2);
    ctx.lineTo(cx + 4, top + 4);
    ctx.lineTo(cx + 8, top);
    ctx.lineTo(cx + 8, top + 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PAL.dangerRed;
    ctx.fillRect(Math.round(cx) - 1, top + 3, 2, 2);
    const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (health) {
      const ratio = Math.max(0, health.current / Math.max(1, health.max));
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.round(cx - r) - 1, top + 9, Math.round(r * 2) + 2, 4);
      ctx.fillStyle = PAL.dangerRed;
      ctx.fillRect(Math.round(cx - r), top + 10, Math.round(r * 2 * ratio), 2);
    }
  }
}

// ── Effects ─────────────────────────────────────────────────

function drawFx(ctx: CanvasRenderingContext2D, fx: WaveFx, time: number): void {
  const t = Math.min(1, fx.age / fx.life);
  const cx = px(fx.x);
  const cy = px(fx.y);
  const radius = (fx.radius ?? 1) * T;
  switch (fx.kind) {
    case 'heal': {
      ctx.strokeStyle = withAlpha('#5cf07a', 1 - t);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (0.2 + 0.8 * t), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = withAlpha('#5cf07a', 0.15 * (1 - t));
      ctx.fill();
      // Little green crosses rising
      ctx.fillStyle = withAlpha('#b8ffb0', 1 - t);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.6;
        const x = cx + Math.cos(a) * radius * 0.5;
        const y = cy + Math.sin(a) * radius * 0.35 - t * 10;
        ctx.fillRect(Math.round(x) - 2, Math.round(y), 5, 1);
        ctx.fillRect(Math.round(x), Math.round(y) - 2, 1, 5);
      }
      break;
    }
    case 'telegraph': {
      // A blinking red ring: the blast (or the charge) is coming
      const blink = Math.floor(time * 10) % 2 === 0;
      ctx.strokeStyle = withAlpha(PAL.dangerRed, blink ? 0.95 : 0.45);
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = withAlpha('#ff7a2f', 0.12 + 0.25 * t);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * t, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'blast': {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = withAlpha('#ff7a2f', 0.7 * (1 - t));
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (0.4 + 0.6 * t), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha('#fff4d0', 0.8 * (1 - t) * (1 - t));
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.45 * (1 - t * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'charge': {
      ctx.fillStyle = withAlpha(PAL.beetleAsh[2], 0.5 * (1 - t));
      ctx.beginPath();
      ctx.arc(cx, cy + T * 0.3, radius * (0.6 + t), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'spine': {
      const tx = px(fx.tx ?? fx.x);
      const ty = px(fx.ty ?? fx.y);
      const hx = cx + (tx - cx) * t;
      const hy = cy + (ty - cy) * t;
      ctx.strokeStyle = withAlpha(PAL.sand[2], 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx - (tx - cx) * 0.15, hy - (ty - cy) * 0.15);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      break;
    }
    case 'trap': {
      ctx.strokeStyle = withAlpha('#ffe27a', 0.8 * (1 - t));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius * (0.5 + 0.6 * t), radius * 0.7 * (0.5 + 0.6 * t), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'shard': {
      const tx = px(fx.tx ?? fx.x);
      const ty = px(fx.ty ?? fx.y);
      ctx.strokeStyle = withAlpha(PAL.crystal.shield, 1 - t);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      break;
    }
    case 'dig': {
      // A wave unit digging into a hole (or a siege blow): a dark mouth and clods of dirt thrown in arcs
      ctx.fillStyle = withAlpha('#0d0812', 0.6 * (1 - t));
      ctx.beginPath();
      ctx.ellipse(cx, cy + T * 0.15, radius * 0.5, radius * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      // A puff of dust
      ctx.fillStyle = withAlpha(PAL.sand[0], 0.35 * (1 - t));
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius * (0.4 + 0.6 * t), radius * (0.25 + 0.35 * t), 0, 0, Math.PI * 2);
      ctx.fill();
      const clods = 12;
      for (let i = 0; i < clods; i++) {
        const a = (i / clods) * Math.PI * 2 + (fx.x + fx.y) * 0.7;
        const reach = radius * (0.35 + 0.9 * t) * (0.7 + 0.3 * ((i * 7) % 3) / 2);
        const x = cx + Math.cos(a) * reach;
        const y = cy + Math.sin(a) * reach * 0.6 - Math.sin(t * Math.PI) * T * 0.7 * (0.6 + 0.4 * (i % 2));
        const size = i % 3 === 0 ? 5 : 3;
        ctx.fillStyle = withAlpha(i % 2 === 0 ? PAL.sand[1] : PAL.soil[4], 1 - t * t);
        ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
      }
      break;
    }
    case 'enrage': {
      ctx.strokeStyle = withAlpha('#ff1e3c', 1 - t);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (0.5 + t), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }
}

/** The wave effects on `layer` */
export function drawWaveFx(ctx: CanvasRenderingContext2D, world: World, layer: LayerValue, time: number, visible: Visible | null): void {
  for (const fx of waveRuntimeFor(world).fx) {
    if (fx.layer !== layer) continue;
    if (visible && !visible(Math.round(fx.x), Math.round(fx.y))) continue;
    drawFx(ctx, fx, time);
  }
  // Armed blasts not yet gone off: a growing warning disc
  for (const blast of waveRuntimeFor(world).explosions) {
    if (blast.layer !== layer) continue;
    const t = 1 - blast.timer / blast.delay;
    drawFx(ctx, { kind: 'telegraph', x: blast.x, y: blast.y, layer, radius: blast.radius, age: t, life: 1 }, time);
  }
}

// ── Build ghost, build area and the scouted breach ─────────

/** The placement ghost: green or red tile, the defense's silhouette, its cost and the range circle */
export function drawGhost(ctx: CanvasRenderingContext2D, overlay: WaveOverlay, time: number): void {
  const g = overlay.ghost;
  // The build area around each anchor
  if (g) {
    const radius = (g.layer === 'surface' ? DEFENSE_AREA.surfaceRadius : DEFENSE_AREA.breachRadius) * T;
    ctx.strokeStyle = withAlpha(PAL.swarm.vein[1], 0.35);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    for (const a of overlay.anchors) {
      ctx.beginPath();
      ctx.arc(px(a.x), px(a.y), radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (!g) return;
  const cx = px(g.x);
  const cy = px(g.y);
  const color = g.valid ? '#5cf07a' : PAL.dangerRed;
  ctx.fillStyle = withAlpha(color, 0.28);
  ctx.fillRect(g.x * T, g.y * T, T, T);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(g.x * T + 0.5, g.y * T + 0.5, T - 1, T - 1);
  if (g.kind === 'spine') drawSpine(ctx, cx, cy, -Math.PI / 2, time, 0.6);
  else if (g.kind === 'trap') drawTrap(ctx, cx, cy, DEFENSE_STATS.trap.range, 1, time, 0.6);
  else drawWall(ctx, g.x, g.y, 0.6);
  if (g.range > 0 && g.kind === 'spine') {
    ctx.strokeStyle = withAlpha(color, 0.8);
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, g.range * T, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = withAlpha(color, 0.06);
    ctx.fill();
  }
  // The cost tag (and why not, when it cannot go there)
  ctx.font = 'bold 8px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = `${g.cost} minerales`;
  const w = ctx.measureText(label).width + 8;
  ctx.fillStyle = 'rgba(14, 8, 11, 0.9)';
  ctx.fillRect(Math.round(cx - w / 2), Math.round(cy + T * 0.75), Math.round(w), 11);
  ctx.fillStyle = g.valid ? PAL.crystal.shell[3] : PAL.dangerRed;
  ctx.fillText(label, cx, cy + T * 0.75 + 6);
  if (!g.valid && g.reason) {
    const rw = ctx.measureText(g.reason).width + 8;
    ctx.fillStyle = 'rgba(14, 8, 11, 0.9)';
    ctx.fillRect(Math.round(cx - rw / 2), Math.round(cy + T * 0.75 + 12), Math.round(rw), 11);
    ctx.fillStyle = '#ffb0a0';
    ctx.fillText(g.reason, cx, cy + T * 0.75 + 18);
  }
}

/** A throbbing amber diamond with a "BRECHA" tag: where the wave breaks in */
function drawBreachMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, pulse: number): void {
  const amber = PAL.glowAmber;
  ctx.strokeStyle = withAlpha(amber, 0.6 + 0.4 * pulse);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size, cy);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - size, cy);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = withAlpha(amber, 0.15 + 0.15 * pulse);
  ctx.fill();
  ctx.fillStyle = amber;
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', cx, cy + 1);
  ctx.font = 'bold 8px system-ui, sans-serif';
  const label = 'BRECHA';
  const w = ctx.measureText(label).width + 6;
  ctx.fillStyle = 'rgba(14, 8, 11, 0.85)';
  ctx.fillRect(Math.round(cx - w / 2), Math.round(cy + size + T * 0.15), Math.round(w), 10);
  ctx.fillStyle = amber;
  ctx.fillText(label, cx, cy + size + T * 0.15 + 5);
}

/** A dashed amber trail from `home` toward `origin`, its arrow head pointing home: they come this way */
function drawComingTrail(ctx: CanvasRenderingContext2D, home: { x: number; y: number }, origin: { x: number; y: number }, pulse: number, time: number): void {
  const amber = PAL.glowAmber;
  const nx = px(home.x);
  const ny = px(home.y);
  const dx = origin.x - home.x;
  const dy = origin.y - home.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const from = { x: nx + ux * T * 3, y: ny + uy * T * 3 };
  const to = { x: nx + ux * T * 11, y: ny + uy * T * 11 };
  ctx.strokeStyle = withAlpha(amber, 0.45 + 0.4 * pulse);
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = time * 14;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(from.x, from.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const head = 7;
  ctx.fillStyle = withAlpha(amber, 0.6 + 0.4 * pulse);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(from.x + ux * head - uy * head * 0.7, from.y + uy * head + ux * head * 0.7);
  ctx.lineTo(from.x + ux * head + uy * head * 0.7, from.y + uy * head - ux * head * 0.7);
  ctx.closePath();
  ctx.fill();
}

/**
 * The scouted wave: a throbbing amber marker on the breach entrance below; on
 * the surface, the same marker on the mound hole the beetles march on and
 * trails toward where they (and the rival's raiders) come from.
 */
export function drawScoutMarks(ctx: CanvasRenderingContext2D, overlay: WaveOverlay, layer: LayerValue, time: number): void {
  const scout = overlay.scout;
  if (!scout) return;
  const pulse = 0.5 + 0.5 * Math.sin(time * 4);
  if (layer === Layer.Underground && scout.breach) {
    drawBreachMark(ctx, px(scout.breach.x), px(scout.breach.y), T * 1.1, pulse);
  }
  if (layer !== Layer.Surface) return;
  if (scout.wildlife) drawComingTrail(ctx, scout.hole ?? scout.nest, scout.wildlife, pulse, time);
  if (scout.origin) drawComingTrail(ctx, scout.nest, scout.origin, pulse, time);
  if (scout.hole) drawBreachMark(ctx, px(scout.hole.x), px(scout.hole.y), T * 0.8, pulse);
}
