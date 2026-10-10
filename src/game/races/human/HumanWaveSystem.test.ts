import { describe, expect, it } from 'vitest';
import { World } from '../../../engine/ecs/World';
import { TileGrid } from '../../../simulation/world/TileGrid';
import { TerrainType } from '../../../simulation/world/types';
import { createDefaultModifiers } from '../../events/GlobalModifiers';
import { COMPONENT, Layer, type CombatComponent, type LayerComponent, type PositionComponent } from '../../components/components';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../../shared/constants';
import { MovementSystem } from '../../systems/MovementSystem';
import { BeetleAISystem } from '../../systems/BeetleAISystem';
import type { DayPhase } from '../../systems/DayNightSystem';
import { waveComposition } from '../../run/waveComposition';
import { HumanWaveSystem } from './HumanWaveSystem';
import { BOSS_COMPONENT } from '../../run/miniBoss';
import { ELITE_COMPONENT } from '../../run/eliteAffixes';
import { HUMAN_PLAYER_COMPONENT } from './humanPlayerComponents';
import { createPlayerHumanBuilding } from './humanPlayerFactories';

const CX = Math.floor(WORLD_WIDTH / 2);
const CY = Math.floor(WORLD_HEIGHT / 2);
const TICK = 1 / 30;

function openGrid(): TileGrid {
  const surface = new TileGrid();
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) surface.setTile(x, y, { terrain: TerrainType.Dirt, walkable: true });
  }
  return surface;
}

function setup() {
  const world = new World();
  const grid = openGrid();
  const core = createPlayerHumanBuilding(world, 'command_center', CX, CY);
  const clock = { phase: 'day' as DayPhase, day: 1, remaining: 100 };
  const dayNight = {
    getPhase: () => clock.phase,
    getDayNumber: () => clock.day,
    getPhaseRemaining: () => clock.remaining,
    getSecondsUntilNightfall: () => (clock.phase === 'day' ? clock.remaining : 0),
  };
  const waves = new HumanWaveSystem(world, grid, dayNight, () => core);
  const modifiers = createDefaultModifiers();
  const beetles = new BeetleAISystem(world, grid, modifiers);
  const movement = new MovementSystem(world, grid, modifiers);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / TICK); i++) {
      beetles.update(TICK);
      waves.update(TICK);
      movement.update(TICK);
    }
  };
  return { world, core, clock, waves, run };
}

describe('night waves against a Human player', () => {
  it('warn before dusk, then send the wave over the surface at the command center', () => {
    const { world, core, clock, waves, run } = setup();
    clock.remaining = 25;
    run(0.1);
    expect(waves.getInfo().armed).toBe(true);
    expect(waves.getInfo().banner?.kind).toBe('warning');
    expect(waves.getInfo().threats.every((t) => t.layer === 'surface')).toBe(true);
    clock.phase = 'night';
    run(30);
    const info = waves.getInfo();
    expect(info.active).toBe(true);
    expect(info.waveNumber).toBe(1);
    expect(info.waveSize).toBe(waveComposition(1).total);
    const invaders = world.query(COMPONENT.BEETLE);
    expect(invaders.length).toBe(waveComposition(1).total);
    const corePos = world.getComponent<PositionComponent>(core, COMPONENT.POSITION)!;
    for (const id of invaders) {
      expect(world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer).toBe(Layer.Surface);
    }
    // They march on the command center and strike it
    run(120);
    const striking = world.query(COMPONENT.BEETLE).filter((id) => {
      const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      return world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!.targetEntityId === core
        && Math.hypot(pos.x - corePos.x, pos.y - corePos.y) < 3;
    });
    expect(striking.length).toBeGreaterThan(0);
  });

  it('counts a wave as repelled once its invaders are dead', () => {
    const { world, clock, waves, run } = setup();
    clock.phase = 'night';
    run(20);
    for (const id of world.query(COMPONENT.BEETLE)) world.destroyEntity(id);
    run(0.5);
    expect(waves.getInfo().active).toBe(false);
    expect(world.metrics.wavesRepelled).toBe(1);
    expect(waves.getInfo().banner?.kind).toBe('cleared');
  });

  it('wave 3 brings elites and the Acorazado Colosal over the surface, scouted ahead on the card', () => {
    const { world, clock, waves, run } = setup();
    (waves as unknown as { waveNumber: number }).waveNumber = 2;
    clock.day = 3;
    const next = waves.getInfo().next!;
    expect(next.wave).toBe(3);
    expect(next.boss?.kind).toBe('colossus');
    expect(next.elites.length).toBeGreaterThan(0);
    expect(next.entrance).toBeNull();
    clock.phase = 'night';
    run(30);
    const invaders = world.query(HUMAN_PLAYER_COMPONENT.WAVE_INVADER);
    expect(invaders.some((id) => world.getComponent(id, BOSS_COMPONENT))).toBe(true);
    expect(invaders.some((id) => world.getComponent(id, ELITE_COMPONENT))).toBe(true);
    for (const id of invaders) expect(world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer).toBe(Layer.Surface);
    expect(waves.getInfo().boss?.kind).toBe('colossus');
  });
});
