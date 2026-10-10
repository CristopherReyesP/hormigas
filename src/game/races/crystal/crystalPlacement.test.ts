import { describe, expect, it } from 'vitest';
import { checkPlacement, type PlacementWorld } from './crystalPlacement';
import { CRYSTAL_POWER_RADIUS } from './crystalPlayerRules';

const HIVE = { x: 60, y: 45 };

function world(overrides: Partial<PlacementWorld> = {}): PlacementWorld {
  return {
    isWalkable: () => true,
    isExplored: () => true,
    structures: [{ x: HIVE.x, y: HIVE.y, kind: 'hive', own: true, complete: true }],
    minerals: [{ x: 75, y: 45 }, { x: 76, y: 46 }],
    ...overrides,
  };
}

describe('Crystal build placement', () => {
  it('a spire grows on open, explored ground in the Hive’s reach', () => {
    expect(checkPlacement('forge', { x: 65, y: 45 }, world())).toEqual({ ok: true });
  });

  it('rejects blocked and unexplored tiles', () => {
    expect(checkPlacement('forge', { x: 65, y: 45 }, world({ isWalkable: () => false })).ok).toBe(false);
    const fog = checkPlacement('forge', { x: 65, y: 45 }, world({ isExplored: () => false }));
    expect(fog).toMatchObject({ ok: false, reason: expect.stringContaining('inexplorado') });
  });

  it('keeps structures apart', () => {
    const tooClose = checkPlacement('forge', { x: HIVE.x + 1, y: HIVE.y }, world());
    expect(tooClose).toMatchObject({ ok: false, reason: expect.stringContaining('cerca') });
  });

  it('spires need the Hive or a finished spire nearby', () => {
    const far = { x: HIVE.x + CRYSTAL_POWER_RADIUS + 3, y: HIVE.y + 5 };
    expect(checkPlacement('prism', far, world())).toMatchObject({ ok: false, reason: expect.stringContaining('alcance') });
    const relay = world({
      structures: [
        { x: HIVE.x, y: HIVE.y, kind: 'hive', own: true, complete: true },
        { x: HIVE.x + 10, y: HIVE.y, kind: 'forge', own: true, complete: true },
      ],
    });
    expect(checkPlacement('prism', far, relay)).toEqual({ ok: true });
    const unfinished = world({
      structures: [
        { x: HIVE.x, y: HIVE.y, kind: 'hive', own: true, complete: true },
        { x: HIVE.x + 10, y: HIVE.y, kind: 'forge', own: true, complete: false },
      ],
    });
    expect(checkPlacement('prism', far, unfinished).ok).toBe(false);
  });

  it('an extractor goes beside a mineral field, anywhere, one per field', () => {
    expect(checkPlacement('extractor', { x: 73, y: 45 }, world())).toEqual({ ok: true });
    expect(checkPlacement('extractor', { x: 66, y: 45 }, world())).toMatchObject({ ok: false, reason: expect.stringContaining('yacimiento') });
    // Not on a node itself
    expect(checkPlacement('extractor', { x: 75, y: 45 }, world()).ok).toBe(false);
    const taken = world({
      structures: [
        { x: HIVE.x, y: HIVE.y, kind: 'hive', own: true, complete: true },
        { x: 77, y: 48, kind: 'extractor', own: false, complete: true },
      ],
    });
    expect(checkPlacement('extractor', { x: 73, y: 45 }, taken)).toMatchObject({ ok: false, reason: expect.stringContaining('extractor') });
  });
});
