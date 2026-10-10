import { describe, expect, it } from 'vitest';
import { TerrainType } from '../../simulation/world/types';
import {
  CRYSTAL_BOWL_RADIUS,
  CRYSTAL_SHARD_RADIUS,
  crystalShardsAround,
  floraAt,
  patchNoise,
  type FloraProp,
} from './alienDecor';

const ART = 16;

function scan(terrain: TerrainType, seed: number, size = 40): Array<FloraProp | null> {
  const out: Array<FloraProp | null> = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out.push(floraAt(x, y, terrain, seed));
  return out;
}

describe('floraAt (alien props per tile)', () => {
  it('is deterministic for the same tile and seed', () => {
    expect(scan(TerrainType.Grass, 7)).toEqual(scan(TerrainType.Grass, 7));
  });

  it('changes the layout when the seed changes', () => {
    const a = scan(TerrainType.Grass, 1).map((p) => p?.kind ?? '-').join('');
    const b = scan(TerrainType.Grass, 2).map((p) => p?.kind ?? '-').join('');
    expect(a).not.toEqual(b);
  });

  it('grows sparse flora on moss and regolith, denser on moss', () => {
    const moss = scan(TerrainType.Grass, 3).filter(Boolean).length / 1600;
    const regolith = scan(TerrainType.Dirt, 3).filter(Boolean).length / 1600;
    expect(moss).toBeGreaterThan(0.08);
    expect(moss).toBeLessThan(0.3);
    expect(regolith).toBeGreaterThan(0.02);
    expect(regolith).toBeLessThan(moss);
  });

  it('never grows on outcrops, dust or liquid', () => {
    for (const t of [TerrainType.Stone, TerrainType.Water, TerrainType.Sand]) {
      expect(scan(t, 5).filter(Boolean)).toHaveLength(0);
    }
  });

  it('mixes stalks with glowing pods and fungal fans, anchored inside the tile', () => {
    const props = scan(TerrainType.Grass, 11, 60).filter((p): p is FloraProp => p !== null);
    expect(props.some((p) => p.kind === 'podStalk')).toBe(true);
    expect(props.some((p) => p.kind === 'fungalFan')).toBe(true);
    for (const p of props) {
      expect(p.ax).toBeGreaterThanOrEqual(2);
      expect(p.ax).toBeLessThanOrEqual(ART - 3);
      expect(p.ay - p.size).toBeGreaterThanOrEqual(0);
      expect(p.ay).toBeLessThanOrEqual(ART - 2);
      if (p.kind === 'podStalk') expect(p.pods).toBeGreaterThanOrEqual(1);
      else expect(p.pods).toBe(0);
    }
  });
});

describe('crystalShardsAround (the Hive corrupts only the crater)', () => {
  const crater = { x: 40, y: 30 };
  const everywhere = () => true;
  const dist = (s: { tileX: number; tileY: number }) => Math.hypot(s.tileX - crater.x, s.tileY - crater.y);

  it('places shards only between the bowl and the corruption radius', () => {
    const shards = crystalShardsAround(crater, 9, everywhere);
    expect(shards.length).toBeGreaterThan(8);
    for (const s of shards) {
      expect(dist(s)).toBeGreaterThan(CRYSTAL_BOWL_RADIUS);
      expect(dist(s)).toBeLessThanOrEqual(CRYSTAL_SHARD_RADIUS);
    }
  });

  it('is deterministic for the same crater and seed', () => {
    expect(crystalShardsAround(crater, 4, everywhere)).toEqual(crystalShardsAround(crater, 4, everywhere));
  });

  it('thins out with distance from the crater', () => {
    const shards = crystalShardsAround(crater, 2, everywhere);
    const near = shards.filter((s) => dist(s) <= (CRYSTAL_BOWL_RADIUS + CRYSTAL_SHARD_RADIUS) / 2).length;
    const far = shards.length - near;
    expect(near).toBeGreaterThan(far * 0.5);
  });

  it('never pokes out of tiles that are not ground (water, off-map)', () => {
    const shards = crystalShardsAround(crater, 9, (x) => x < crater.x);
    expect(shards.length).toBeGreaterThan(0);
    for (const s of shards) expect(s.tileX).toBeLessThan(crater.x);
  });

  it('keeps every shard drawable inside its tile', () => {
    for (const s of crystalShardsAround(crater, 13, everywhere)) {
      expect(s.ax).toBeGreaterThanOrEqual(2);
      expect(s.ax).toBeLessThanOrEqual(ART - 3);
      expect(s.ay - s.height).toBeGreaterThanOrEqual(0);
      expect(s.ay).toBeLessThanOrEqual(ART - 2);
    }
  });
});

describe('patchNoise (large soft patches across the ground)', () => {
  it('is deterministic and stays in [0, 1)', () => {
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        const n = patchNoise(x, y, 3, 5);
        expect(n).toBe(patchNoise(x, y, 3, 5));
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(1);
      }
    }
  });

  it('changes smoothly from tile to tile (patches, not salt and pepper)', () => {
    const cell = 5;
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        expect(Math.abs(patchNoise(x + 1, y, 8, cell) - patchNoise(x, y, 8, cell))).toBeLessThanOrEqual(1.5 / cell + 1e-9);
        expect(Math.abs(patchNoise(x, y + 1, 8, cell) - patchNoise(x, y, 8, cell))).toBeLessThanOrEqual(1.5 / cell + 1e-9);
      }
    }
  });

  it('still covers low and high values over a map', () => {
    const values: number[] = [];
    for (let y = 0; y < 90; y++) for (let x = 0; x < 120; x++) values.push(patchNoise(x, y, 1, 5));
    expect(Math.min(...values)).toBeLessThan(0.25);
    expect(Math.max(...values)).toBeGreaterThan(0.75);
  });
});
