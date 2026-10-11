// AI audit: plays real runs headless and lists the entities that stand still
// for long while they have somewhere to be (no target in reach, a goal or a
// route left), grouped by kind and state. Minutes of simulation, on demand:
//
//   AI_AUDIT=1 npx vitest run src/balance/aiAudit.test.ts --disableConsoleIntercept
//
// Filters: AI_RIVAL (comma list), AI_SEEDS, AI_NIGHTS (default 6).

import { it, vi } from 'vitest';
import { runBalanceSim } from './balanceSim';
import type { RivalId } from '../game/run/RunSetup';
import type { World } from '../engine/ecs/World';
import type { EntityId } from '../shared/types';
import {
  COMPONENT,
  Layer,
  type AntComponent,
  type BeetleComponent,
  type CombatComponent,
  type CrystalUnitComponent,
  type LayerComponent,
  type PathComponent,
  type PositionComponent,
} from '../game/components/components';
import { HUMAN_COMPONENT, type HumanUnitComponent } from '../game/rival/humanComponents';
import { frontierCreatureOf } from '../game/phase/frontierCreatures';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../shared/constants';

vi.mock('../engine/input/InputManager', async () => (await import('../test/gameManagerMocks')).mockInputManager());
vi.mock('../game/systems/RenderSystem', async () => (await import('../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());
vi.stubGlobal('localStorage', undefined);

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const SAMPLE = 1;
const STUCK_AFTER = 12;

function describeEntity(world: World, id: EntityId): string | null {
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
  if (ant) return `ant:${ant.role}:${ant.state}`;
  const crystal = world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT);
  if (crystal) return `crystal:${crystal.kind}:${crystal.state}`;
  const human = world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT);
  if (human) return `human:${human.type}:${(human as unknown as { state?: string }).state ?? '?'}`;
  const frontier = frontierCreatureOf(world, id);
  if (frontier) return `creature:${frontier.kind}${frontier.raider ? ':raider' : ''}`;
  const beetle = world.getComponent<BeetleComponent>(id, COMPONENT.BEETLE);
  if (beetle) return `beetle:${beetle.state}${world.getComponent(id, 'wave_march') ? ':march' : ''}`;
  if (world.getComponent(id, COMPONENT.CRICKET)) return 'cricket';
  return null;
}

it.skipIf(!env.AI_AUDIT)('AI audit', { timeout: 6 * 60 * 60 * 1000 }, () => {
  const rivals = (env.AI_RIVAL ? env.AI_RIVAL.split(',') : ['wildlife', 'crystal', 'human']) as RivalId[];
  const seeds = (env.AI_SEEDS ?? '1').split(',').map(Number);
  const maxNights = Number(env.AI_NIGHTS ?? 6);
  const nest = { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) };
  for (const rival of rivals) {
    for (const seed of seeds) {
      const still = new Map<EntityId, { x: number; y: number; since: number; reported: boolean }>();
      const counts = new Map<string, number>();
      const examples = new Map<string, string>();
      let next = 0;
      const result = runBalanceSim({
        player: 'swarm', rival, bot: 'reasonable', seed, maxNights, dt: 1 / 20,
        onTick: (game, world, time) => {
          if (time < next) return;
          next = time + SAMPLE;
          const seen = new Set<EntityId>();
          for (const id of world.query(COMPONENT.POSITION, COMPONENT.PATH, COMPONENT.HEALTH)) {
            const what = describeEntity(world, id);
            if (!what) continue;
            seen.add(id);
            const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
            const combat = world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
            const fighting = combat?.targetEntityId != null && world.hasEntity(combat.targetEntityId);
            const prev = still.get(id);
            if (!prev || Math.hypot(prev.x - pos.x, prev.y - pos.y) > 0.6 || fighting) {
              still.set(id, { x: pos.x, y: pos.y, since: time, reported: false });
              continue;
            }
            if (prev.reported || time - prev.since < STUCK_AFTER) continue;
            prev.reported = true;
            const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface;
            const path = world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
            const pending = path.currentIndex < path.waypoints.length;
            const d = Math.round(Math.hypot(pos.x - nest.x, pos.y - nest.y));
            const key = `${what} [${layer}${pending ? ', route left' : ''}${layer === Layer.Surface && d <= 8 ? ', at the mound' : ''}]`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
            if (!examples.has(key)) {
              const wp = pending ? path.waypoints[path.currentIndex] : null;
              const grid = layer === Layer.Surface ? (game['grid'] as { isWalkable(x: number, y: number): boolean }) : (game['undergroundGrid'] as { isWalkable(x: number, y: number): boolean });
              const wpNote = wp ? ` next (${wp.x.toFixed(1)},${wp.y.toFixed(1)}) walk=${grid.isWalkable(Math.floor(wp.x + 0.5), Math.floor(wp.y + 0.5))}/${grid.isWalkable(Math.floor(wp.x), Math.floor(wp.y))} here walk=${grid.isWalkable(Math.round(pos.x), Math.round(pos.y))} idx ${path.currentIndex}/${path.waypoints.length}` : '';
              const speed = world.getComponent<{ speedMultiplier: number }>(id, COMPONENT.ROLE_STATS)?.speedMultiplier;
              examples.set(key, `t=${Math.round(time)} (${pos.x.toFixed(1)},${pos.y.toFixed(1)}) d=${d}${wpNote} spd=${speed?.toFixed(2)}`);
            }
          }
          for (const id of still.keys()) if (!seen.has(id)) still.delete(id);
          void game;
        },
      });
      console.log(`== ${rival} seed ${seed}: death night ${result.deathNight ?? 'alive'} (${result.causeLine ?? '-'})`);
      for (const [key, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${key}  e.g. ${examples.get(key)}`);
    }
  }
});
