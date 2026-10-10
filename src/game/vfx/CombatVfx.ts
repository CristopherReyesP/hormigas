/**
 * Combat VFX state: a fixed pool of pixel-art effects that CombatSystem emits
 * and drawCombatVfx paints: Swarm acid hits, chitin chips, death pops, goo,
 * carcasses and crystal shards.
 *
 * Pure: no canvas, no DOM, no Math.random (a seeded generator keeps every run
 * and every test reproducible). The pool is allocated once; spawning reuses a
 * dead slot or recycles the oldest one, so a big brawl never allocates.
 *
 * Time is GAME time: CombatSystem advances the pool with its simulation dt, so
 * effects hold while the game is paused and play faster at 2× or 3×.
 *
 * Space: every effect is anchored on an entity position (tile units, the same
 * space as PositionComponent) and moves in ART pixels around that anchor.
 * One art px is 2 screen px at zoom 1, so a tile is 16 art px.
 */
import type { LayerValue } from '../components/components';
import { TILE_SIZE } from '../../shared/constants';

/** Screen px per art px at zoom 1 */
export const ART_PX = 2;
export const ART_PER_TILE = TILE_SIZE / ART_PX;

/** Short-lived, moving effects (droplets, crosses, debris, flashes, rings) */
export const PARTICLE_CAP = 320;
/** Long-lived ground decals (puddles, goo, carcasses) */
export const DECAL_CAP = 64;

/** Lifetimes in game seconds */
export const VFX_LIFE = {
  dropletFlight: 0.16,
  /** Delay between the droplets of one spit */
  dropletStagger: 0.045,
  cross: 0.16,
  puddle: 1.8,
  chip: 0.6,
  shard: 0.8,
  flash: 0.1,
  ring: 0.45,
  goo: 9,
  carcass: 14,
  /** The cyan hex arc where a hit lands on a Crystal shield */
  shield: 0.24,
  /** A Sentinel's energy bolt in flight */
  bolt: 0.18,
  /** The Crystal Queen's pulse rolling out */
  pulse: 0.5,
} as const;

export type VfxKind = 'droplet' | 'cross' | 'debris' | 'flash' | 'ring' | 'puddle' | 'goo' | 'carcass' | 'shield' | 'bolt';
export type DebrisStyle = 'chitin' | 'straw' | 'flesh' | 'goo' | 'shard' | 'soil';
export type CrossStyle = 'acid' | 'impact';
export type BodyKind = 'ant' | 'beetle' | 'cricket';
export type DenKind = 'beetleDen' | 'cricketDen';
/** 'crystal': a Crystal Hive unit or structure, which sheds cyan shards */
export type VictimKind = BodyKind | DenKind | 'crystal';
/** Who landed the blow: the Swarm spits acid, wildlife just bites */
export type Attacker = 'swarm' | 'wildlife';
export type VfxStyle = DebrisStyle | CrossStyle | BodyKind | DenKind | 'crystal' | 'pulse';

export interface VfxSlot {
  alive: boolean;
  kind: VfxKind;
  style: VfxStyle;
  layer: LayerValue;
  /** Anchor in tile units (PositionComponent space) */
  x: number;
  y: number;
  /** Offset from the anchor in art px (a droplet's launch point) */
  ox: number;
  oy: number;
  /** A droplet's landing offset from the anchor, art px */
  tx: number;
  ty: number;
  /** Height above the ground in art px: debris pops up, then lands */
  z: number;
  /** Debris velocity in art px per second */
  vx: number;
  vy: number;
  vz: number;
  /** Seconds since the effect started; negative while it waits for a droplet to land */
  age: number;
  life: number;
  /** Facing in radians, snapped to the 16 sprite directions (carcass, flash) */
  angle: number;
  /** A droplet's arc height, art px */
  arc: number;
  /** Stable per-effect randomness for the drawer (shape and color picks) */
  seed: number;
}

/** Art px per second² pulling debris back to the ground */
const GRAVITY = 320;
const BOUNCE = 0.35;
const GROUND_FRICTION = 0.55;
const DIRECTIONS = 16;
const DIRECTION_STEP = (Math.PI * 2) / DIRECTIONS;

const CHIP_STYLE: Record<VictimKind, DebrisStyle> = {
  ant: 'flesh',
  beetle: 'chitin',
  cricket: 'straw',
  beetleDen: 'soil',
  cricketDen: 'straw',
  crystal: 'shard',
};

function emptySlot(): VfxSlot {
  return {
    alive: false, kind: 'debris', style: 'chitin', layer: 'surface',
    x: 0, y: 0, ox: 0, oy: 0, tx: 0, ty: 0, z: 0, vx: 0, vy: 0, vz: 0,
    age: 0, life: 0, angle: 0, arc: 0, seed: 0,
  };
}

/** Snap a facing to the nearest of the 16 sprite directions */
export function snapDirection(angle: number): number {
  return Math.round(angle / DIRECTION_STEP) * DIRECTION_STEP;
}

export class CombatVfx {
  readonly particles: readonly VfxSlot[];
  readonly decals: readonly VfxSlot[];
  private particleCursor = 0;
  private decalCursor = 0;
  private rngState: number;

  constructor(seed = 0x5eed) {
    this.rngState = seed | 0;
    this.particles = Array.from({ length: PARTICLE_CAP }, emptySlot);
    this.decals = Array.from({ length: DECAL_CAP }, emptySlot);
  }

  /** Age every effect by `dt` game seconds; 0 (paused) changes nothing */
  advance(dt: number): void {
    if (dt <= 0) return;
    for (let i = 0; i < this.particles.length; i++) {
      const s = this.particles[i];
      if (!s.alive) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.alive = false;
      } else if (s.kind === 'debris' && s.age > 0) {
        this.fly(s, Math.min(dt, s.age));
      }
    }
    for (let i = 0; i < this.decals.length; i++) {
      const s = this.decals[i];
      if (!s.alive) continue;
      s.age += dt;
      if (s.age >= s.life) s.alive = false;
    }
  }

  countAlive(kind?: VfxKind): number {
    let n = 0;
    for (const s of this.particles) if (s.alive && (!kind || s.kind === kind)) n++;
    for (const s of this.decals) if (s.alive && (!kind || s.kind === kind)) n++;
    return n;
  }

  /**
   * One landed blow from (ax, ay) on a victim at (tx, ty). The Swarm spits
   * acid: droplets arc over, then a cross flash and a puddle mark the impact.
   * The victim sheds chips of its own material either way.
   */
  hit(ax: number, ay: number, tx: number, ty: number, layer: LayerValue, attacker: Attacker, victim: VictimKind): void {
    const impactDelay = attacker === 'swarm' ? VFX_LIFE.dropletFlight : 0;
    if (attacker === 'swarm') this.spitAcid(ax, ay, tx, ty, layer);

    const cross = this.spawn(this.particles, 'particle', 'cross', attacker === 'swarm' ? 'acid' : 'impact', layer, tx, ty, VFX_LIFE.cross);
    cross.age = -impactDelay;

    const away = Math.atan2(ty - ay, tx - ax);
    const isDen = victim === 'beetleDen' || victim === 'cricketDen';
    this.burst(tx, ty, layer, CHIP_STYLE[victim], isDen ? 5 : 4, away, 1.6, 25, 55, impactDelay);
  }

  /** A unit dies: a 1-frame white flash, a pop of bits, and what it leaves behind */
  death(x: number, y: number, layer: LayerValue, body: BodyKind, facing: number): void {
    const angle = snapDirection(facing);
    const flash = this.spawn(this.particles, 'particle', 'flash', body, layer, x, y, VFX_LIFE.flash);
    flash.angle = angle;

    if (body === 'ant') {
      this.burst(x, y, layer, 'goo', 7, 0, Math.PI * 2, 20, 50, 0);
      this.burst(x, y, layer, 'flesh', 3, 0, Math.PI * 2, 15, 35, 0);
      this.spawn(this.decals, 'decal', 'goo', 'ant', layer, x, y, VFX_LIFE.goo);
    } else {
      this.burst(x, y, layer, body === 'beetle' ? 'chitin' : 'straw', body === 'beetle' ? 8 : 9, 0, Math.PI * 2, 20, 50, 0);
      const carcass = this.spawn(this.decals, 'decal', 'carcass', body, layer, x, y, VFX_LIFE.carcass);
      carcass.angle = angle;
    }
  }

  /**
   * A den caves in: a dust ring rolls out and its soil flies, laced with the
   * meteorite's crystal (the alien regolith around the crater is shot through
   * with it, see alienDecor).
   */
  denCollapse(x: number, y: number, layer: LayerValue, den: DenKind): void {
    this.spawn(this.particles, 'particle', 'ring', den, layer, x, y, VFX_LIFE.ring);
    this.burst(x, y, layer, 'soil', den === 'beetleDen' ? 14 : 9, 0, Math.PI * 2, 30, 70, 0);
    if (den === 'cricketDen') this.burst(x, y, layer, 'straw', 6, 0, Math.PI * 2, 25, 60, 0);
    this.crystalShards(x, y, layer, 8);
  }

  /**
   * A hit soaked by a Crystal shield: a cyan hex arc flashes on the side the
   * blow came from (art direction: "1 px cyan hex arc flash").
   */
  shieldHit(ax: number, ay: number, tx: number, ty: number, layer: LayerValue): void {
    const arc = this.spawn(this.particles, 'particle', 'shield', 'crystal', layer, tx, ty, VFX_LIFE.shield);
    arc.angle = Math.atan2(ay - ty, ax - tx);
  }

  /** A shield breaks: 1×2 shards fly off */
  shieldBreak(x: number, y: number, layer: LayerValue): void {
    this.crystalShards(x, y, layer, 6);
  }

  /** A Sentinel's energy bolt, visual only: it flies from the shooter and lands as the hit does */
  crystalBolt(ax: number, ay: number, tx: number, ty: number, layer: LayerValue): void {
    const bolt = this.spawn(this.particles, 'particle', 'bolt', 'crystal', layer, tx, ty, VFX_LIFE.bolt);
    bolt.ox = (ax - tx) * ART_PER_TILE;
    bolt.oy = (ay - ty) * ART_PER_TILE;
  }

  /** The Crystal Queen's pulse: a cyan ring rolling out from her */
  crystalPulse(x: number, y: number, layer: LayerValue): void {
    this.spawn(this.particles, 'particle', 'ring', 'pulse', layer, x, y, VFX_LIFE.pulse);
    this.crystalShards(x, y, layer, 6);
  }

  /** 1×2 cyan crystal shards bursting all around: Crystal Hive deaths and shield breaks */
  crystalShards(x: number, y: number, layer: LayerValue, count: number): void {
    this.burst(x, y, layer, 'shard', count, 0, Math.PI * 2, 35, 80, 0);
  }

  private spitAcid(ax: number, ay: number, tx: number, ty: number, layer: LayerValue): void {
    const fromX = (ax - tx) * ART_PER_TILE;
    const fromY = (ay - ty) * ART_PER_TILE;
    for (let i = 0; i < 4; i++) {
      const d = this.spawn(this.particles, 'particle', 'droplet', 'acid', layer, tx, ty, VFX_LIFE.dropletFlight);
      d.age = -i * VFX_LIFE.dropletStagger;
      d.ox = fromX;
      d.oy = fromY;
      d.tx = Math.round((this.rand() - 0.5) * 4);
      d.ty = Math.round((this.rand() - 0.5) * 4);
      d.arc = 5 + this.rand() * 4;
    }
    const puddle = this.spawn(this.decals, 'decal', 'puddle', 'acid', layer, tx, ty, VFX_LIFE.puddle);
    puddle.age = -VFX_LIFE.dropletFlight;
    puddle.ox = Math.round((this.rand() - 0.5) * 3);
    puddle.oy = Math.round((this.rand() - 0.5) * 3);
  }

  /** `count` ballistic bits fanning out around `dir` within `spread` radians */
  private burst(
    x: number, y: number, layer: LayerValue, style: DebrisStyle, count: number,
    dir: number, spread: number, speedMin: number, speedMax: number, delay: number,
  ): void {
    const life = style === 'shard' ? VFX_LIFE.shard : VFX_LIFE.chip;
    for (let i = 0; i < count; i++) {
      const s = this.spawn(this.particles, 'particle', 'debris', style, layer, x, y, life * (0.7 + this.rand() * 0.6));
      const a = dir + (this.rand() - 0.5) * spread;
      const speed = speedMin + this.rand() * (speedMax - speedMin);
      s.age = -delay;
      s.vx = Math.cos(a) * speed;
      s.vy = Math.sin(a) * speed;
      s.vz = 45 + this.rand() * 55;
      s.z = 2;
    }
  }

  private fly(s: VfxSlot, dt: number): void {
    s.vz -= GRAVITY * dt;
    s.z += s.vz * dt;
    if (s.z <= 0) {
      s.z = 0;
      s.vz = s.vz < -12 ? -s.vz * BOUNCE : 0;
      s.vx *= GROUND_FRICTION;
      s.vy *= GROUND_FRICTION;
    }
    s.ox += s.vx * dt;
    s.oy += s.vy * dt;
  }

  /** Claim a slot: the next dead one, or else the oldest in ring order */
  private spawn(
    pool: readonly VfxSlot[], which: 'particle' | 'decal', kind: VfxKind, style: VfxStyle,
    layer: LayerValue, x: number, y: number, life: number,
  ): VfxSlot {
    const start = which === 'particle' ? this.particleCursor : this.decalCursor;
    let index = start;
    for (let n = 0; n < pool.length; n++) {
      const i = (start + n) % pool.length;
      if (!pool[i].alive) { index = i; break; }
    }
    const next = (index + 1) % pool.length;
    if (which === 'particle') this.particleCursor = next;
    else this.decalCursor = next;

    const s = pool[index];
    s.alive = true;
    s.kind = kind;
    s.style = style;
    s.layer = layer;
    s.x = x;
    s.y = y;
    s.ox = 0; s.oy = 0; s.tx = 0; s.ty = 0;
    s.z = 0; s.vx = 0; s.vy = 0; s.vz = 0;
    s.age = 0;
    s.life = life;
    s.angle = 0;
    s.arc = 0;
    s.seed = Math.floor(this.rand() * 0x7fffffff);
    return s;
  }

  /** mulberry32: tiny, fast, deterministic */
  private rand(): number {
    let t = (this.rngState = (this.rngState + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/**
 * One pool per World, shared by the system that emits (CombatSystem) and the
 * one that draws (RenderSystem) without either owning the other. Keyed weakly
 * by the World, so the pool lives and dies with it.
 */
const pools = new WeakMap<object, CombatVfx>();

export function combatVfxFor(world: object): CombatVfx {
  let vfx = pools.get(world);
  if (!vfx) {
    vfx = new CombatVfx();
    pools.set(world, vfx);
  }
  return vfx;
}
