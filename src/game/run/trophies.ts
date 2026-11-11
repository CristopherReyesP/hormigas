// Boss trophies: killing a big enemy (the alien tarantula, a Legion Queen, a
// wave mini-boss) leaves a relic the colony keeps for the rest of the run.
// Each relic is a lasting bonus, so the enemies that grow with time become a
// prize worth hunting. A relic stacks up to `maxStacks`; past that the kill
// pays minerals instead.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import { COMPONENT } from '../components/components';
import { FactionId, isHostileTo } from '../factions/factions';
import { frontierCreatureOf } from '../phase/frontierCreatures';
import { BOSS_COMPONENT } from './miniBoss';
import type { RunStat } from './MutationDefinitions';

export const TROPHY_IDS = ['fang', 'crown', 'banner'] as const;
export type TrophyId = (typeof TROPHY_IDS)[number];

export interface TrophyDef {
  name: string;
  icon: string;
  /** What it does, for the strip's tooltip */
  description: string;
  /** Run stats multiplied by `factor` for every relic of this kind */
  stats: readonly RunStat[];
  factor: number;
  maxStacks: number;
}

export const TROPHIES: Readonly<Record<TrophyId, TrophyDef>> = {
  fang: {
    name: 'Colmillo de tarántula', icon: '🦷',
    description: '+8% de daño para toda la colonia',
    stats: ['antDamageMult'], factor: 1.08, maxStacks: 3,
  },
  crown: {
    name: 'Corona legionaria', icon: '👑',
    description: '+10% de vida máxima para toda la colonia',
    stats: ['antMaxHealthMult'], factor: 1.1, maxStacks: 3,
  },
  banner: {
    name: 'Estandarte de guerra', icon: '🚩',
    description: '+10% de daño para soldados y defensoras',
    stats: ['soldierDamageMult', 'defenderDamageMult'], factor: 1.1, maxStacks: 3,
  },
};

/** Minerals a boss pays once its relic is maxed */
export const TROPHY_SURPLUS_MINERALS = 40;

/** The relic a dying enemy leaves, if it is a boss */
export function trophyFor(world: World, id: EntityId): TrophyId | null {
  const kind = frontierCreatureOf(world, id)?.kind;
  if (kind === 'tarantula') return 'fang';
  if (kind === 'legion_queen') return 'crown';
  if (world.getComponent(id, BOSS_COMPONENT) !== undefined) return 'banner';
  return null;
}

/**
 * Enemy `id` died: if it was a boss of the colony's foes, the colony takes its
 * relic. Returns true when a relic (and its stat bonus) was gained, so the
 * caller can bring the living ants up to the new stats.
 */
export function claimTrophy(world: World, id: EntityId): boolean {
  const trophy = trophyFor(world, id);
  if (!trophy) return false;
  if (!isHostileTo(world, FactionId.PLAYER, id)) return false;
  // Only a colony of ants wears relics (the Human and Crystal races have none)
  if (world.query(COMPONENT.ANT).length === 0) return false;
  const def = TROPHIES[trophy];
  const run = world.runModifiers;
  if (run.getTrophyCount(trophy) >= def.maxStacks) {
    world.minerals.deposit(TROPHY_SURPLUS_MINERALS);
    world.pushNotification('success', `${def.icon} Otro ${def.name.toLowerCase()}: tu colonia ya tiene el máximo, lo funde en +${TROPHY_SURPLUS_MINERALS} minerales`);
    return false;
  }
  run.addTrophy(trophy);
  for (const stat of def.stats) run[stat] *= def.factor;
  const count = run.getTrophyCount(trophy);
  world.pushNotification('success', `${def.icon} ¡Trofeo: ${def.name}${count > 1 ? ` ×${count}` : ''}! ${def.description}`);
  return true;
}

/** The relics held, for the HUD */
export function trophySummary(world: World): Array<{ id: TrophyId; icon: string; name: string; description: string; count: number }> {
  const run = world.runModifiers;
  return TROPHY_IDS
    .map((id) => ({ id, ...TROPHIES[id], count: run.getTrophyCount(id) }))
    .filter((t) => t.count > 0)
    .map(({ id, icon, name, description, count }) => ({ id, icon, name, description, count }));
}
