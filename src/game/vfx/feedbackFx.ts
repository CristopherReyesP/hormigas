// Combat feedback the player reads at a glance: floating texts (damage
// numbers, rewards, promotions) and impacts (a short camera shake with a
// screen flash for the big moments). Transient, like CombatVfx: kept per World
// in a WeakMap, never saved, aged in game time so a pause freezes it.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import type { LayerValue } from '../components/components';
import { beginUprightOverlay } from '../../engine/renderer/uprightOverlay';
import { TILE_SIZE } from '../../shared/constants';

export interface FloatText {
  x: number;
  y: number;
  layer: LayerValue;
  text: string;
  color: string;
  /** Font px at zoom 1 */
  size: number;
  age: number;
  life: number;
}

export interface Impact {
  /** Peak shake in screen px */
  strength: number;
  /** Screen flash color (rgb triplet "255,80,60"), or null for none */
  flash: string | null;
  age: number;
  life: number;
}

interface DamageTally {
  x: number;
  y: number;
  layer: LayerValue;
  amount: number;
  /** The victim is the player's: its numbers read red */
  friendly: boolean;
  timer: number;
}

export interface FeedbackFx {
  texts: FloatText[];
  impacts: Impact[];
  damage: Map<EntityId, DamageTally>;
}

export const FEEDBACK = {
  maxTexts: 70,
  /** Bites on one victim merge into one number every this many seconds */
  damageWindow: 0.45,
  /** A hit on a colony unit shows only from this much merged damage (ants die in droves: keep it quiet) */
  friendlyMin: 25,
  textLife: 0.9,
  /** Art px a text rises over its life */
  rise: 22,
} as const;

export const FLOAT_COLOR = {
  damage: '#ffe066',
  friendly: '#ff5a4d',
  reward: '#7dffb0',
  promo: '#ffd84a',
  boss: '#ff9d3c',
} as const;

const stores = new WeakMap<World, FeedbackFx>();

export function feedbackFor(world: World): FeedbackFx {
  let fx = stores.get(world);
  if (!fx) {
    fx = { texts: [], impacts: [], damage: new Map() };
    stores.set(world, fx);
  }
  return fx;
}

/** A text that rises and fades over tile (x, y) */
export function pushFloat(world: World, at: { x: number; y: number; layer: LayerValue }, text: string, color: string, size = 11, life: number = FEEDBACK.textLife): void {
  const { texts } = feedbackFor(world);
  if (texts.length >= FEEDBACK.maxTexts) texts.shift();
  texts.push({ x: at.x, y: at.y, layer: at.layer, text, color, size, age: 0, life });
}

/** A hit landed on `targetId`: merged with the other bites of the same moment into one number */
export function addDamage(world: World, targetId: EntityId, at: { x: number; y: number; layer: LayerValue }, amount: number, friendly: boolean): void {
  if (amount <= 0) return;
  const { damage } = feedbackFor(world);
  const tally = damage.get(targetId);
  if (tally) {
    tally.amount += amount;
    tally.x = at.x;
    tally.y = at.y;
  } else {
    damage.set(targetId, { x: at.x, y: at.y, layer: at.layer, amount, friendly, timer: FEEDBACK.damageWindow });
  }
}

/** A big moment: shake the camera, and flash the screen when `flash` is given */
export function pushImpact(world: World, strength: number, flash: string | null = null, life = 0.45): void {
  const { impacts } = feedbackFor(world);
  if (impacts.length >= 6) impacts.shift();
  impacts.push({ strength, flash, age: 0, life });
}

/** Age everything by `dt` of game time and turn the ripe damage tallies into numbers */
export function advanceFeedback(world: World, dt: number): void {
  const fx = stores.get(world);
  if (!fx) return;
  for (const [id, tally] of fx.damage) {
    tally.timer -= dt;
    if (tally.timer > 0) continue;
    fx.damage.delete(id);
    if (tally.friendly && tally.amount < FEEDBACK.friendlyMin) continue;
    const big = tally.amount >= 60;
    pushFloat(world, tally, `-${Math.round(tally.amount)}`, tally.friendly ? FLOAT_COLOR.friendly : FLOAT_COLOR.damage, big ? 14 : 11);
  }
  for (const t of fx.texts) t.age += dt;
  for (const i of fx.impacts) i.age += dt;
  if (fx.texts.some((t) => t.age >= t.life)) fx.texts = fx.texts.filter((t) => t.age < t.life);
  if (fx.impacts.some((i) => i.age >= i.life)) fx.impacts = fx.impacts.filter((i) => i.age < i.life);
}

/** The camera offset the live impacts add this frame (deterministic: a decaying two-axis wobble) */
export function impactShake(world: World): { x: number; y: number } {
  const fx = stores.get(world);
  if (!fx || fx.impacts.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const i of fx.impacts) {
    const fade = 1 - i.age / i.life;
    x += Math.sin(i.age * 71) * i.strength * fade;
    y += Math.cos(i.age * 53) * i.strength * fade;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

/** The strongest live screen flash: its color and alpha, or null */
export function impactFlash(world: World): { color: string; alpha: number } | null {
  const fx = stores.get(world);
  if (!fx) return null;
  let best: { color: string; alpha: number } | null = null;
  for (const i of fx.impacts) {
    if (!i.flash) continue;
    const alpha = 0.3 * Math.max(0, 1 - i.age / (i.life * 0.7));
    if (alpha > 0 && (!best || alpha > best.alpha)) best = { color: i.flash, alpha };
  }
  return best;
}

/** Draw the floating texts of `layer`, in world space (the camera transform is applied) */
export function drawFloatTexts(
  ctx: CanvasRenderingContext2D,
  world: World,
  layer: LayerValue,
  visible?: (x: number, y: number) => boolean,
): void {
  const fx = stores.get(world);
  if (!fx || fx.texts.length === 0) return;
  for (const t of fx.texts) {
    if (t.layer !== layer) continue;
    if (visible && !visible(Math.round(t.x), Math.round(t.y))) continue;
    const k = t.age / t.life;
    const px = t.x * TILE_SIZE + TILE_SIZE / 2;
    const py = t.y * TILE_SIZE - TILE_SIZE * 0.4 - k * FEEDBACK.rise;
    beginUprightOverlay(ctx, px, py);
    ctx.globalAlpha = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
    // A quick pop on birth
    const pop = t.age < 0.1 ? 1 + (0.1 - t.age) * 4 : 1;
    ctx.font = `bold ${Math.round(t.size * pop)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#10081a';
    ctx.strokeText(t.text, Math.round(px), Math.round(py));
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, Math.round(px), Math.round(py));
    ctx.restore();
  }
}
