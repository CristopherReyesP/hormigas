import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import {
  COMPONENT,
  CrystalUnitState,
  Layer,
  type CrystalUnitComponent,
  type HealthComponent,
  type LayerComponent,
  type PositionComponent,
} from '../components/components';
import { fakeCanvas, finishIntro, CRYSTAL_RIVAL_SETUP } from '../../test/gameManagerMocks';
import { setAudioSink, type AudioEvent } from '../../audio/events';
import { BEETLE_STATS } from '../../shared/constants';
import { YOUNG_BEETLE_SCALE, waveComposition } from './waveComposition';
import { WAVE_MARCH_COMPONENT } from './waveMarch';

// Real manager, map and simulation; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () =>
  (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

const DT = 1 / 30;

function setup() {
  const game = new GameManager(fakeCanvas(), CRYSTAL_RIVAL_SETUP);
  finishIntro(game);
  const world = game['world'] as World;
  // These check the waves' own numbers: no threat scaling on top
  world.removeSystem('ThreatSystem');
  const dayNight = game['dayNightSystem'] as unknown as { phaseTimer: number; getPhase(): string };
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) game['update'](DT);
  };
  /** Jump the day clock so nightfall is `seconds` away */
  const nightfallIn = (seconds: number) => {
    dayNight.phaseTimer = seconds;
  };
  const info = () => game.getStats().invasion;
  const messages = () => world.notifications.map((n) => n.message);
  const undergroundBeetles = () =>
    world.query(COMPONENT.BEETLE).filter((id) => world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer === Layer.Underground);
  /** The beetles of the wave still crossing the surface toward the nest */
  const marchingBeetles = () => world.query(COMPONENT.BEETLE, WAVE_MARCH_COMPONENT);
  const assaultingDrones = () =>
    world.query(COMPONENT.CRYSTAL_UNIT).filter((id) => world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!.state === CrystalUnitState.Assaulting);
  return { game, world, run, nightfallIn, info, messages, undergroundBeetles, marchingBeetles, assaultingDrones };
}

afterEach(() => setAudioSink(null));

describe('night waves in a real run', () => {
  it('wave 1 sends its composition: three young beetles that cross the surface toward the nest', () => {
    const { game, run, nightfallIn, info, marchingBeetles, world } = setup();
    const expected = waveComposition(1);
    nightfallIn(0.5);
    run(1);
    expect(info()).toMatchObject({ waveNumber: 1, active: true, waveSize: expected.total });
    while (game['invasionSystem']['pendingSpawns'].length > 0) run(DT); // the column leaves the edge
    const invaders = marchingBeetles();
    expect(invaders).toHaveLength(expected.total);
    for (const id of invaders) expect(world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer).toBe(Layer.Surface);
    expect(info().remaining).toBe(expected.total);
    const hp = world.getComponent<HealthComponent>(invaders[0], COMPONENT.HEALTH)!;
    expect(hp.max).toBe(Math.round(BEETLE_STATS.health * YOUNG_BEETLE_SCALE.health));
    game.stop();
  });

  it('wave 3 mixes beetles marching on the nest with crystal drones from the hive', () => {
    const { game, run, nightfallIn, info, marchingBeetles, assaultingDrones } = setup();
    game['invasionSystem']['waveNumber'] = 2;
    const expected = waveComposition(3);
    expect(expected.drones).toBeGreaterThan(0);
    nightfallIn(0.05);
    run(0.1);
    // Right at the launch, before the defenders can kill anyone
    expect(info().waveNumber).toBe(3);
    // Wave 3 is a mini-boss wave: the Prisma Guardián marches with the drones
    expect(expected.boss).toBe('prism');
    expect(assaultingDrones()).toHaveLength(expected.drones + 1);
    expect(marchingBeetles().length + game['invasionSystem']['pendingSpawns'].length).toBe(expected.youngBeetles + expected.beetles);
    expect(info().remaining).toBe(expected.total);
    while (game['invasionSystem']['pendingSpawns'].length > 0) run(DT);
    expect(marchingBeetles().length).toBeLessThanOrEqual(expected.youngBeetles + expected.beetles);
    game.stop();
  });
});

describe('a wave the player cannot miss', () => {
  it('warns 30 s ahead, announces the arrival with the alarm, counts down the enemies and celebrates the clear', { timeout: 30_000 }, () => {
    const { game, world, run, nightfallIn, info, messages, marchingBeetles } = setup();
    const heard: AudioEvent[] = [];
    setAudioSink((e) => heard.push(e));
    const size = waveComposition(1).total;

    nightfallIn(31);
    run(0.5);
    expect(info().banner).toBeNull();
    run(1);
    expect(info().banner).toMatchObject({ kind: 'warning', wave: 1, count: size });
    expect(messages().some((m) => m.includes('¡Oleada 1 en 30 s!'))).toBe(true);
    // The breach point and the edge the column leaves from are known before the attack: the HUD and the minimap point at them
    expect(info().threats.some((t) => t.layer === 'underground')).toBe(true);
    const edge = info().next!.wildlife!;
    expect(info().threats).toContainEqual({ x: edge.x, y: edge.y, layer: 'surface' });

    run(30);
    expect(info().banner).toMatchObject({ kind: 'arrival', wave: 1, count: size });
    expect(messages().some((m) => m.includes(`OLEADA 1 · ${size} enemigos`))).toBe(true);
    expect(heard.some((e) => e.type === 'wave')).toBe(true);

    while (game['invasionSystem']['pendingSpawns'].length > 0) run(DT);
    expect(info().remaining).toBe(size);
    const invaders = marchingBeetles();
    world.destroyEntity(invaders[0]);
    run(DT);
    expect(info().remaining).toBe(size - 1);
    expect(info().active).toBe(true);
    // Threats now follow the live invaders, marching on the surface
    const pos = world.getComponent<PositionComponent>(invaders[1], COMPONENT.POSITION)!;
    expect(info().threats.some((t) => t.layer === 'surface' && Math.hypot(t.x - pos.x, t.y - pos.y) < 20)).toBe(true);

    for (const id of marchingBeetles()) world.destroyEntity(id);
    run(DT * 2);
    expect(info().active).toBe(false);
    expect(info().remaining).toBe(0);
    expect(info().banner).toMatchObject({ kind: 'cleared', wave: 1 });
    expect(messages().some((m) => m.includes('¡Oleada 1 superada!'))).toBe(true);

    run(8);
    expect(info().banner).toBeNull();
    game.stop();
  });
});
