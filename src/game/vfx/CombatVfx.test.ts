import { describe, expect, it } from 'vitest';
import { Layer } from '../components/components';
import { CombatVfx, DECAL_CAP, PARTICLE_CAP, VFX_LIFE, combatVfxFor, type VfxSlot } from './CombatVfx';

const S = Layer.Surface;

function alive(slots: readonly VfxSlot[]): VfxSlot[] {
  return slots.filter((s) => s.alive);
}

function ofKind(vfx: CombatVfx, kind: VfxSlot['kind']): VfxSlot[] {
  return [...alive(vfx.particles), ...alive(vfx.decals)].filter((s) => s.kind === kind);
}

/** Advance in fixed simulation ticks, the way CombatSystem does */
function run(vfx: CombatVfx, seconds: number): void {
  const tick = 1 / 60;
  for (let t = 0; t < seconds - 1e-9; t += tick) vfx.advance(tick);
}

describe('CombatVfx — Swarm acid hit', () => {
  it('fires chartreuse droplets from the attacker, then a cross flash and a puddle on the target', () => {
    const vfx = new CombatVfx();
    vfx.hit(10, 10, 11, 10, S, 'swarm', 'beetle');

    const droplets = ofKind(vfx, 'droplet');
    expect(droplets.length).toBeGreaterThanOrEqual(3);
    for (const d of droplets) {
      // Anchored on the victim, launched from the attacker one tile (16 art px) to the left
      expect(d.x).toBe(11);
      expect(d.ox).toBe(-16);
      expect(d.layer).toBe(S);
    }
    const crosses = ofKind(vfx, 'cross');
    expect(crosses).toHaveLength(1);
    expect(crosses[0].style).toBe('acid');
    expect(ofKind(vfx, 'puddle')).toHaveLength(1);
  });

  it('only lights the cross and the puddle once the first droplet lands', () => {
    const vfx = new CombatVfx();
    vfx.hit(10, 10, 11, 10, S, 'swarm', 'ant');
    const cross = ofKind(vfx, 'cross')[0];
    expect(cross.age).toBeLessThan(0);
    run(vfx, VFX_LIFE.dropletFlight);
    expect(cross.age).toBeGreaterThanOrEqual(0);
  });

  it('spits no acid when wildlife lands the blow', () => {
    const vfx = new CombatVfx();
    vfx.hit(10, 10, 11, 10, S, 'wildlife', 'ant');
    expect(ofKind(vfx, 'droplet')).toHaveLength(0);
    expect(ofKind(vfx, 'puddle')).toHaveLength(0);
    expect(ofKind(vfx, 'cross')[0].style).toBe('impact');
  });
});

describe('CombatVfx — chips by victim', () => {
  it.each([
    ['beetle', 'chitin'],
    ['cricket', 'straw'],
    ['ant', 'flesh'],
  ] as const)('a hit on a %s throws %s chips', (victim, style) => {
    const vfx = new CombatVfx();
    vfx.hit(10, 10, 11, 10, S, 'swarm', victim);
    const chips = ofKind(vfx, 'debris');
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((c) => c.style === style)).toBe(true);
  });
});

describe('CombatVfx — deaths', () => {
  it('an ant leaves a Swarm goo splat, never a carcass', () => {
    const vfx = new CombatVfx();
    vfx.death(5, 5, S, 'ant', 0);
    expect(ofKind(vfx, 'goo')).toHaveLength(1);
    expect(ofKind(vfx, 'carcass')).toHaveLength(0);
  });

  it.each(['beetle', 'cricket'] as const)('a %s leaves its carcass, no goo', (body) => {
    const vfx = new CombatVfx();
    vfx.death(5, 5, S, body, 1);
    const carcass = ofKind(vfx, 'carcass');
    expect(carcass).toHaveLength(1);
    expect(carcass[0].style).toBe(body);
    expect(ofKind(vfx, 'goo')).toHaveLength(0);
  });

  it('pops: a white flash on the body and a few particles', () => {
    const vfx = new CombatVfx();
    vfx.death(5, 5, S, 'beetle', 0);
    expect(ofKind(vfx, 'flash')).toHaveLength(1);
    expect(ofKind(vfx, 'debris').length).toBeGreaterThanOrEqual(4);
  });

  it('snaps the carcass to one of the 16 sprite directions', () => {
    const vfx = new CombatVfx();
    vfx.death(5, 5, S, 'cricket', 0.3);
    const step = (Math.PI * 2) / 16;
    expect(ofKind(vfx, 'carcass')[0].angle).toBeCloseTo(step);
  });
});

describe('CombatVfx — crystal shards', () => {
  it('bursts 1×2 cyan shards for Crystal units and collapsing dens', () => {
    const vfx = new CombatVfx();
    vfx.crystalShards(3, 3, S, 7);
    const shards = ofKind(vfx, 'debris');
    expect(shards).toHaveLength(7);
    expect(shards.every((s) => s.style === 'shard')).toBe(true);
  });

  it('a den collapse rings out dust and throws shards with the soil', () => {
    const vfx = new CombatVfx();
    vfx.denCollapse(3, 3, S, 'beetleDen');
    expect(ofKind(vfx, 'ring')).toHaveLength(1);
    const styles = new Set(ofKind(vfx, 'debris').map((d) => d.style));
    expect(styles).toEqual(new Set(['soil', 'shard']));
  });
});

describe('CombatVfx — game time', () => {
  it('holds every effect while paused (dt = 0)', () => {
    const vfx = new CombatVfx();
    vfx.hit(10, 10, 11, 10, S, 'swarm', 'beetle');
    vfx.death(4, 4, S, 'ant', 0);
    const before = vfx.countAlive();
    for (let i = 0; i < 600; i++) vfx.advance(0);
    expect(vfx.countAlive()).toBe(before);
  });

  it('expires each effect after its own lifetime', () => {
    const vfx = new CombatVfx();
    vfx.hit(10, 10, 11, 10, S, 'swarm', 'beetle');
    vfx.death(4, 4, S, 'cricket', 0);

    run(vfx, VFX_LIFE.dropletFlight + VFX_LIFE.dropletStagger * 3 + 0.05);
    expect(ofKind(vfx, 'droplet')).toHaveLength(0);
    expect(ofKind(vfx, 'carcass')).toHaveLength(1);

    run(vfx, VFX_LIFE.carcass);
    expect(vfx.countAlive()).toBe(0);
  });

  it('runs faster at higher game speed: a 2× tick ages twice as far', () => {
    const slow = new CombatVfx();
    const fast = new CombatVfx();
    slow.death(1, 1, S, 'ant', 0);
    fast.death(1, 1, S, 'ant', 0);
    run(slow, 1);
    run(fast, 2);
    expect(ofKind(fast, 'goo')[0].age).toBeCloseTo(ofKind(slow, 'goo')[0].age * 2, 5);
  });
});

describe('CombatVfx — fixed pool', () => {
  it('never holds more than its caps, however big the brawl', () => {
    const vfx = new CombatVfx();
    for (let i = 0; i < 2000; i++) {
      vfx.hit(i % 50, 3, (i % 50) + 1, 3, S, 'swarm', 'beetle');
      vfx.death(i % 50, 4, S, 'cricket', 0);
    }
    expect(vfx.particles).toHaveLength(PARTICLE_CAP);
    expect(vfx.decals).toHaveLength(DECAL_CAP);
    expect(alive(vfx.particles).length).toBeLessThanOrEqual(PARTICLE_CAP);
    expect(alive(vfx.decals).length).toBeLessThanOrEqual(DECAL_CAP);
  });

  it('recycles the oldest decal, so the newest kill always shows', () => {
    const vfx = new CombatVfx();
    for (let i = 0; i < DECAL_CAP + 5; i++) vfx.death(i, 0, S, 'beetle', 0);
    const xs = ofKind(vfx, 'carcass').map((c) => c.x);
    expect(xs).toContain(DECAL_CAP + 4);
    expect(xs).not.toContain(0);
  });

  it('reuses the same slot objects instead of allocating new ones', () => {
    const vfx = new CombatVfx();
    const slots = [...vfx.particles];
    for (let i = 0; i < 500; i++) vfx.hit(1, 1, 2, 1, S, 'swarm', 'ant');
    vfx.particles.forEach((s, i) => expect(s).toBe(slots[i]));
  });
});

describe('combatVfxFor', () => {
  it('hands every system the same pool for one world, and a fresh one per world', () => {
    const worldA = {};
    const worldB = {};
    expect(combatVfxFor(worldA)).toBe(combatVfxFor(worldA));
    expect(combatVfxFor(worldA)).not.toBe(combatVfxFor(worldB));
  });
});
