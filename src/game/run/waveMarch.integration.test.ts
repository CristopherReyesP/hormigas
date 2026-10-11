import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, Layer, type CombatComponent, type LayerComponent, type PositionComponent } from '../components/components';
import { fakeCanvas, finishIntro, CRYSTAL_RIVAL_SETUP } from '../../test/gameManagerMocks';
import type { TileGrid } from '../../simulation/world/TileGrid';
import { waveComposition } from './waveComposition';
import { WAVE_MARCH_COMPONENT, type WaveMarchComponent } from './waveMarch';
import { dealDamage } from './waveRuntime';

// Real manager, map and simulation; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

/** A seeded Math.random (mulberry32), so the map and the run are the same every time. */
function seedRandom(seed: number) {
  let a = seed >>> 0;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

afterEach(() => vi.restoreAllMocks());

const DT = 1 / 30;

describe('a night wave from the map edge into the nest, in a real run', () => {
  it('appears at the scouted edge, marches on the breach hole, digs in and goes for the queen', { timeout: 60_000 }, () => {
    seedRandom(7);
    const game = new GameManager(fakeCanvas(), CRYSTAL_RIVAL_SETUP);
    finishIntro(game);
    const world = game['world'] as World;
    const dayNight = game['dayNightSystem'] as unknown as { phaseTimer: number };
    const run = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) game['update'](DT);
    };
    const info = () => game.getStats().invasion;
    const layerOf = (id: number) => world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer;
    const size = waveComposition(1, 'crystal').total;

    // Nobody on the surface to stop them: this run is about the road in
    for (const id of world.query(COMPONENT.ANT)) {
      if (layerOf(id) === Layer.Surface) world.destroyEntity(id);
    }

    // The warning comes about 30 s before the column shows up at the edge
    dayNight.phaseTimer = 31;
    run(1.5);
    expect(info().banner).toMatchObject({ kind: 'warning', wave: 1 });
    const next = info().next!;
    const edge = next.wildlife!;
    // The edge of the walled Phase 1 zone, just inside the thorns
    const area = (game['grid'] as TileGrid).bounds;
    const onEdge = edge.x <= area.x0 + 3 || edge.y <= area.y0 + 3 || edge.x >= area.x1 - 3 || edge.y >= area.y1 - 3;
    expect(onEdge).toBe(true);
    expect(info().threats).toContainEqual({ x: edge.x, y: edge.y, layer: 'surface' });
    expect(game.getScoutMarks('surface')).toContainEqual({ x: edge.x, y: edge.y });
    expect(game.getScoutMarks('surface')).toContainEqual(next.hole);

    run(29.5);
    expect(info()).toMatchObject({ active: true, waveNumber: 1 });
    const first = world.query(COMPONENT.BEETLE, WAVE_MARCH_COMPONENT);
    expect(first).toHaveLength(1);
    const at = world.getComponent<PositionComponent>(first[0], COMPONENT.POSITION)!;
    expect(Math.hypot(at.x - edge.x, at.y - edge.y)).toBeLessThanOrEqual(3);
    expect(layerOf(first[0])).toBe(Layer.Surface);

    // The column crosses the surface: the arrows and the minimap follow it, and the counter counts it
    run(8);
    const column = world.query(COMPONENT.BEETLE, WAVE_MARCH_COMPONENT);
    expect(column).toHaveLength(size);
    expect(info().remaining).toBe(size);
    expect(game.getWaveThreats('surface').length).toBeGreaterThan(0);
    expect(game.getWaveThreats('underground')).toHaveLength(0);
    // The nest alert sees them on the surface (the SUPERFICIE badge), not inside: no "¡Invasores en el nido!" yet
    expect(game.getInvaderCount('surface')).toBe(size);
    expect(game.getInvaderCount('underground')).toBe(0);
    expect(game.getStats().nestAlert).toMatchObject({ nestInvaders: 0, surfaceInvaders: size, alert: null });
    for (const id of column) {
      const march = world.getComponent<WaveMarchComponent>(id, WAVE_MARCH_COMPONENT)!;
      expect(march.hole).toEqual(next.hole);
      expect(march.entrance).toEqual({ x: next.entrance!.x, y: next.entrance!.y });
    }

    // One by one they reach the hole, dig in and come out at the scouted entrance below
    let dug = false;
    let alertWhileOutside = false;
    for (let t = 0; t < 60 && world.query(COMPONENT.BEETLE, WAVE_MARCH_COMPONENT).length > 0; t += DT) {
      game['update'](DT);
      if (column.some((id) => world.getComponent<WaveMarchComponent>(id, WAVE_MARCH_COMPONENT)?.phase === 'digging')) dug = true;
      const anyInside = column.some((id) => world.hasEntity(id) && layerOf(id) === Layer.Underground);
      if (!anyInside && game.getStats().nestAlert?.alert) alertWhileOutside = true;
    }
    expect(alertWhileOutside).toBe(false);
    expect(dug).toBe(true);
    const inside = column.filter((id) => world.hasEntity(id) && layerOf(id) === Layer.Underground);
    expect(inside.length).toBeGreaterThan(0);
    expect(info().remaining).toBe(column.filter((id) => world.hasEntity(id)).length);
    expect(game.getWaveThreats('underground').length).toBeGreaterThan(0);
    expect(world.notifications.some((n) => n.message.includes('entran al nido'))).toBe(true);
    // Once they are in, the nest alert fires
    run(1);
    expect(game.getStats().nestAlert!.nestInvaders).toBeGreaterThan(0);
    expect(game.getStats().nestAlert!.alert).toMatchObject({ kind: 'breach' });

    // Inside, they go for the queen (or whoever stands in the way)
    run(1);
    const queen = world.query(COMPONENT.QUEEN_ENTITY)[0];
    const targets = inside
      .filter((id) => world.hasEntity(id))
      .map((id) => world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!.targetEntityId);
    expect(targets.some((t) => t === queen || (t !== null && world.getComponent(t, COMPONENT.ANT) !== undefined))).toBe(true);

    // The defense holds: the wave is cleared
    for (const id of column) if (world.hasEntity(id)) dealDamage(world, id, 1e9);
    run(0.5);
    expect(info().active).toBe(false);
    expect(info().banner).toMatchObject({ kind: 'cleared', wave: 1 });
    game.stop();
  });
});
