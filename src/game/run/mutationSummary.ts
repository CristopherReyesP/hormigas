// What the run's mutations add up to, in words the HUD can show: the owned
// mutations with their stack count and compounded effect, and the colony-wide
// totals. Multiplier stats compound per stack (×1.4 three times is ×2.74, so
// +174%, not +120%); additive stats sum.

import {
  MUTATION_DEFINITIONS,
  MUTATION_IDS,
  type MutationEffect,
  type MutationId,
  type MutationTag,
  type RunStat,
} from './MutationDefinitions';

interface StatInfo {
  label: string;
  /** Which way is good for the colony (a cost moves the other way) */
  better: 'higher' | 'lower';
  /** Additive stats: the unit after the number */
  unit?: string;
}

const STAT_INFO: Record<RunStat, StatInfo> = {
  soldierDamageMult: { label: 'Daño de los soldados', better: 'higher' },
  soldierSpeedMult: { label: 'Velocidad de los soldados', better: 'higher' },
  soldierMaxHealthMult: { label: 'Vida máxima de los soldados', better: 'higher' },
  soldierCostBonus: { label: 'Costo por soldado', better: 'lower', unit: 'de comida' },
  movementSpeedMult: { label: 'Velocidad de movimiento', better: 'higher' },
  carryingSpeedMult: { label: 'Velocidad al cargar', better: 'higher' },
  workerCarryMult: { label: 'Carga de las obreras', better: 'higher' },
  hungerDecayMult: { label: 'Consumo de hambre', better: 'lower' },
  maxHungerMult: { label: 'Hambre máxima', better: 'higher' },
  regenHpPerSecond: { label: 'Regeneración', better: 'higher', unit: 'PV/s' },
  digSpeedMult: { label: 'Velocidad de excavación', better: 'higher' },
  undergroundDamageMult: { label: 'Daño bajo tierra', better: 'higher' },
  meatDropMult: { label: 'Carne por presa', better: 'higher' },
  foodSpawnMult: { label: 'Reaparición de comida', better: 'higher' },
  extraInvadersPerWave: { label: 'Invasores por oleada', better: 'lower' },
  scoutVisionMult: { label: 'Visión de las exploradoras', better: 'higher' },
  flankingBonusMult: { label: 'Bonificación de flanqueo', better: 'higher' },
};

export interface StatLine {
  stat: RunStat;
  /** "Daño de los soldados +96%" */
  text: string;
  /** Good for the colony (green) or a cost (red) */
  good: boolean;
}

export interface OwnedMutation {
  id: MutationId;
  name: string;
  stacks: number;
  maxStacks: number;
  mark: string;
  tags: readonly MutationTag[];
  /** Every effect of the mutation at its current stacks, compounded */
  lines: StatLine[];
}

const isMultiplier = (effect: MutationEffect): boolean => effect.operation === 'multiply';

/** "+174%", "−27%" or, from double on, "×2.7" (a doubling reads better than "+100%") */
function formatMultiplier(value: number): string {
  if (value >= 2) return `×${trim(value)}`;
  // Rounded away from zero alike both ways (−12.5% reads −13%, like +12.5% reads +13%)
  const pct = Math.round(Math.abs(value - 1) * 100);
  return value >= 1 ? `+${pct}%` : `−${pct}%`;
}

function formatAdditive(value: number, unit: string | undefined): string {
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${trim(Math.abs(value))}${unit ? ` ${unit}` : ''}`;
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function line(stat: RunStat, value: number, multiplier: boolean): StatLine {
  const info = STAT_INFO[stat];
  const neutral = multiplier ? 1 : 0;
  const up = value > neutral;
  return {
    stat,
    text: `${info.label} ${multiplier ? formatMultiplier(value) : formatAdditive(value, info.unit)}`,
    good: info.better === 'higher' ? up : !up,
  };
}

/** One mutation's effects at `stacks` stacks (0 gives none) */
export function mutationLines(id: MutationId, stacks: number): StatLine[] {
  if (stacks <= 0) return [];
  return MUTATION_DEFINITIONS[id].effects.map((effect) =>
    line(effect.stat, isMultiplier(effect) ? effect.value ** stacks : effect.value * stacks, isMultiplier(effect)));
}

function stackCounts(applied: readonly MutationId[]): Map<MutationId, number> {
  const stacks = new Map<MutationId, number>();
  for (const id of applied) stacks.set(id, (stacks.get(id) ?? 0) + 1);
  return stacks;
}

/** The run's mutations in first-pick order, with stacks and compounded effects */
export function ownedMutations(applied: readonly MutationId[]): OwnedMutation[] {
  return [...stackCounts(applied)].map(([id, stacks]) => {
    const { name, maxStacks, mark, tags } = MUTATION_DEFINITIONS[id];
    return { id, name, stacks, maxStacks, mark, tags, lines: mutationLines(id, stacks) };
  });
}

/**
 * The colony-wide change per stat, every mutation combined (two mutations on
 * the same stat compound too), in a fixed order; stats back at neutral are left out.
 */
export function mutationTotals(applied: readonly MutationId[]): StatLine[] {
  const totals = new Map<RunStat, { value: number; multiplier: boolean }>();
  for (const id of applied) {
    for (const effect of MUTATION_DEFINITIONS[id].effects) {
      const multiplier = isMultiplier(effect);
      const current = totals.get(effect.stat) ?? { value: multiplier ? 1 : 0, multiplier };
      current.value = multiplier ? current.value * effect.value : current.value + effect.value;
      totals.set(effect.stat, current);
    }
  }
  const order = Object.keys(STAT_INFO) as RunStat[];
  return order
    .filter((stat) => {
      const total = totals.get(stat);
      return total !== undefined && Math.abs(total.value - (total.multiplier ? 1 : 0)) > 1e-9;
    })
    .map((stat) => line(stat, totals.get(stat)!.value, totals.get(stat)!.multiplier));
}

/** How many mutations exist and how many stacks a full build holds */
export function mutationCapacity(): { kinds: number; stacks: number } {
  return {
    kinds: MUTATION_IDS.length,
    stacks: MUTATION_IDS.reduce((sum, id) => sum + MUTATION_DEFINITIONS[id].maxStacks, 0),
  };
}
