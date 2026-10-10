// Per-World state the wave features share: kills dealt outside CombatSystem
// (turrets, traps, explosions, boss rams), pending elite explosions, boss
// deaths waiting for their reward, and the short-lived wave VFX the renderer
// draws (heal pulses, blast rings, spine shots). Kept in a WeakMap like the
// combat VFX pool, so every run and every test world starts clean.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import { COMPONENT, type HealthComponent, type LayerValue, type RoleStatsComponent } from '../components/components';
import { absorbDamage, type ShieldComponent } from '../rival/crystalShield';
import { damageAfterArmor } from '../systems/helpers/combatHelpers';
import type { FactionId } from '../factions/factions';

export type WaveFxKind = 'heal' | 'blast' | 'telegraph' | 'charge' | 'spine' | 'trap' | 'shard' | 'enrage';

/** One short-lived wave effect, in tiles on one layer */
export interface WaveFx {
  kind: WaveFxKind;
  x: number;
  y: number;
  layer: LayerValue;
  /** Shots: where the spine lands */
  tx?: number;
  ty?: number;
  /** Rings: the radius they grow to, in tiles */
  radius?: number;
  age: number;
  life: number;
}

/** An Explosivo elite's blast, ticking down its telegraph */
export interface PendingExplosion {
  x: number;
  y: number;
  layer: LayerValue;
  /** Seconds left before it goes off */
  timer: number;
  delay: number;
  radius: number;
  damage: number;
  /** The side that blew up: the blast hurts its enemies only */
  faction: FactionId;
}

/** A boss that died this tick: UndergroundInvasionSystem pays its reward */
export interface BossKill {
  id: EntityId;
  name: string;
  x: number;
  y: number;
  layer: LayerValue;
}

export interface WaveRuntime {
  /** Entities a wave feature killed; CombatSystem buries them (death VFX, meat, hooks) */
  kills: Set<EntityId>;
  explosions: PendingExplosion[];
  bossKills: BossKill[];
  fx: WaveFx[];
}

const MAX_FX = 160;
const runtimes = new WeakMap<World, WaveRuntime>();

export function waveRuntimeFor(world: World): WaveRuntime {
  let rt = runtimes.get(world);
  if (!rt) {
    rt = { kills: new Set(), explosions: [], bossKills: [], fx: [] };
    runtimes.set(world, rt);
  }
  return rt;
}

/** Add a wave effect; the oldest goes first when the pool is full */
export function pushWaveFx(world: World, fx: Omit<WaveFx, 'age'>): void {
  const list = waveRuntimeFor(world).fx;
  list.push({ ...fx, age: 0 });
  if (list.length > MAX_FX) list.shift();
}

/** Age the wave effects in game time (frozen while paused) */
export function advanceWaveFx(world: World, dt: number): void {
  const rt = waveRuntimeFor(world);
  for (const fx of rt.fx) fx.age += dt;
  if (rt.fx.some((fx) => fx.age >= fx.life)) rt.fx = rt.fx.filter((fx) => fx.age < fx.life);
}

/**
 * Land `damage` on `targetId` the way a bite does: shield first, then armor
 * (floor of 1), then health. A lethal hit queues the entity for CombatSystem
 * to bury. Returns the health it lost.
 */
export function dealDamage(world: World, targetId: EntityId, damage: number): number {
  if (!(damage > 0) || !world.hasEntity(targetId)) return 0;
  const health = world.getComponent<HealthComponent>(targetId, COMPONENT.HEALTH);
  if (!health || health.current <= 0) return 0;
  const shield = world.getComponent<ShieldComponent>(targetId, COMPONENT.SHIELD);
  const hull = shield ? absorbDamage(shield, damage).hull : damage;
  if (hull <= 0) return 0;
  const lost = Math.min(health.current, damageAfterArmor(world, targetId, hull));
  health.current -= lost;
  if (health.current <= 0) waveRuntimeFor(world).kills.add(targetId);
  return lost;
}

/** Speed multipliers stacked on a unit: its own base times every active factor */
export const SPEED_MODS_COMPONENT = 'speed_mods';

export interface SpeedModsComponent {
  /** speedMultiplier before any factor */
  base: number;
  factors: Record<string, number>;
}

/**
 * Set one named speed factor on a unit (Veloz, Furioso, a resin trap, a
 * boss charge) and recompute its speed; factor 1 removes it. Factors
 * multiply, so a slowed Veloz elite is still faster than a slowed plain one.
 */
export function setSpeedFactor(world: World, id: EntityId, key: string, factor: number): void {
  const stats = world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
  if (!stats) return;
  let mods = world.getComponent<SpeedModsComponent>(id, SPEED_MODS_COMPONENT);
  if (!mods) {
    if (factor === 1) return;
    mods = { base: stats.speedMultiplier, factors: {} };
    world.addComponent<SpeedModsComponent>(id, SPEED_MODS_COMPONENT, mods);
  }
  if (factor === 1) delete mods.factors[key];
  else mods.factors[key] = factor;
  let speed = mods.base;
  for (const f of Object.values(mods.factors)) speed *= f;
  stats.speedMultiplier = speed;
}

/** The current value of one speed factor (1 when unset) */
export function speedFactorOf(world: World, id: EntityId, key: string): number {
  return world.getComponent<SpeedModsComponent>(id, SPEED_MODS_COMPONENT)?.factors[key] ?? 1;
}
