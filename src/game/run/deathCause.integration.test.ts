import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameManager, type GameOverStats } from '../GameManager';
import type { World } from '../../engine/ecs/World';
import {
  AntRole,
  COMPONENT,
  Layer,
  type AntComponent,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type PathComponent,
  type PositionComponent,
  type QueenEntityComponent,
} from '../components/components';
import { fakeCanvas, finishIntro } from '../../test/gameManagerMocks';
import { createBeetle } from '../entities/factories';
import type { RunSetup } from './RunSetup';
import { deathCauseText } from './deathCause';

// Real manager, map and simulation; browser-only adapters are replaced.
vi.mock('../../engine/input/InputManager', async () => (await import('../../test/gameManagerMocks')).mockInputManager());
vi.mock('../systems/RenderSystem', async () => (await import('../../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());

afterEach(() => vi.restoreAllMocks());

const DT = 1 / 30;

function start(setup: RunSetup = { playerRace: 'swarm', rivalRace: 'wildlife' }) {
  const game = new GameManager(fakeCanvas(), setup);
  finishIntro(game);
  const world = game['world'] as World;
  const state = game as unknown as { gameOver: GameOverStats | null };
  /** Run until the run ends or `seconds` pass; `each` runs before every tick */
  const runUntilOver = (seconds: number, each?: () => void) => {
    for (let i = 0; i < Math.round(seconds / DT) && !state.gameOver; i++) {
      each?.();
      game['update'](DT);
    }
    return state.gameOver;
  };
  return { game, world, state, runUntilOver };
}

/** Three beetles next to `target`, on its layer, biting it */
function beetlesAt(world: World, target: number, count: number): number[] {
  const at = world.getComponent<PositionComponent>(target, COMPONENT.POSITION)!;
  const layer = world.getComponent<LayerComponent>(target, COMPONENT.LAYER)?.layer ?? Layer.Surface;
  return Array.from({ length: count }, (_, i) => {
    const id = createBeetle(world, at.x + 0.6 * Math.cos(i * 2.1), at.y + 0.6 * Math.sin(i * 2.1), null);
    world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = layer;
    return id;
  });
}

function aim(world: World, ids: number[], target: number): void {
  for (const id of ids) {
    const combat = world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (combat && world.hasEntity(target)) combat.targetEntityId = target;
    // Rooted on the spot: their own AI would chase the units that come to defend it
    const path = world.getComponent<PathComponent>(id, COMPONENT.PATH);
    if (path) {
      path.waypoints = [];
      path.currentIndex = 0;
    }
  }
}

describe('the end screen says how the run was lost', () => {
  it('a queen left without food dies of hunger', { timeout: 60_000 }, () => {
    const { world, runUntilOver } = start();
    const queen = world.query(COMPONENT.QUEEN_ENTITY)[0];
    // No nurse to feed her and an empty belly; a weak queen dies in seconds
    for (const id of world.query(COMPONENT.ANT)) {
      if (world.getComponent<AntComponent>(id, COMPONENT.ANT)!.role === AntRole.Nurse) world.destroyEntity(id);
    }
    world.getComponent<QueenEntityComponent>(queen, COMPONENT.QUEEN_ENTITY)!.hunger = 0;
    world.getComponent<HealthComponent>(queen, COMPONENT.HEALTH)!.current = 20;
    const over = runUntilOver(30, () => {
      const q = world.getComponent<QueenEntityComponent>(queen, COMPONENT.QUEEN_ENTITY);
      if (q) q.hunger = 0;
    });
    expect(over?.outcome).toBe('defeat');
    expect(over?.cause).toEqual({ kind: 'starvation', core: 'queen' });
    expect(deathCauseText(over!.cause!).line).toBe('La reina murió de hambre');
  });

  it('a queen killed in the nest names her killers', { timeout: 60_000 }, () => {
    const { world, runUntilOver } = start();
    const queen = world.query(COMPONENT.QUEEN_ENTITY)[0];
    world.getComponent<HealthComponent>(queen, COMPONENT.HEALTH)!.current = 60;
    const beetles = beetlesAt(world, queen, 3);
    const over = runUntilOver(60, () => aim(world, beetles, queen));
    expect(over?.outcome).toBe('defeat');
    expect(over?.cause).toEqual({ kind: 'invaders', core: 'queen', attackers: [{ name: 'Acorazado', count: 3 }] });
    expect(deathCauseText(over!.cause!).line).toBe('La reina cayó ante los invasores (Acorazado ×3)');
  });

  it('a Human expedition loses its command center', { timeout: 60_000 }, () => {
    const { game, world, runUntilOver } = start({ playerRace: 'human', rivalRace: 'wildlife' });
    const core = game.getHumanPlayer()!.coreId!;
    world.getComponent<HealthComponent>(core, COMPONENT.HEALTH)!.current = 40;
    const beetles = beetlesAt(world, core, 2);
    const over = runUntilOver(60, () => aim(world, beetles, core));
    expect(over?.outcome).toBe('defeat');
    expect(over?.cause).toMatchObject({ kind: 'invaders', core: 'command_center' });
    expect(deathCauseText(over!.cause!).line).toMatch(/^El Centro de mando fue destruido/);
  });
});
