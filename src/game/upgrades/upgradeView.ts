import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  type AntComponent,
  type CarryingComponent,
  type HealthComponent,
  type RoleStatsComponent,
} from '../components/components';
import { ANT_SPEED, ROLE_STATS } from '../../shared/constants';
import { canAfford, shortfall, type UpgradeFunds } from './purchase';
import { upgradeEffectLines, type EffectLine } from './upgradeEffects';
import type { UpgradeLevels } from './upgradeLevels';
import { UPGRADE_TABLE, type UpgradeCost, type UpgradeGroup, type UpgradeId } from './upgradeTable';

/** One line of the Mejoras panel, ready to draw */
export interface UpgradeInfo {
  id: UpgradeId;
  group: UpgradeGroup;
  name: string;
  description: string;
  level: number;
  maxLevel: number;
  /** Price of the next level; null at max */
  cost: UpgradeCost | null;
  affordable: boolean;
  /** What is missing for the next level (all zero when affordable or maxed) */
  missing: UpgradeCost;
  effects: EffectLine[];
}

const NONE: UpgradeCost = { food: 0, minerals: 0, mushrooms: 0 };

export function upgradeInfos(levels: UpgradeLevels, funds: UpgradeFunds): UpgradeInfo[] {
  return UPGRADE_TABLE.map((def) => {
    const level = levels[def.id];
    const max = def.costs.length;
    const cost = level < max ? def.costs[level] : null;
    return {
      id: def.id,
      group: def.group,
      name: def.name,
      description: def.blurb,
      level,
      maxLevel: max,
      cost,
      affordable: cost !== null && canAfford(cost, funds),
      missing: cost ? shortfall(cost, funds) : NONE,
      effects: upgradeEffectLines(levels, def.id, max),
    };
  });
}

/** One stat of the selected ant for its info card: "Daño 10 (+2)" */
export interface AntStatLine {
  label: string;
  value: number;
  /** Over the caste's base stat (upgrades and mutations); 0 when unchanged */
  bonus: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function antStatLines(world: World, id: EntityId): AntStatLine[] {
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
  if (!ant) return [];
  const base = ROLE_STATS[ant.role];
  const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
  const carrying = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
  const roleStats = world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
  const lines: AntStatLine[] = [];
  if (health) {
    lines.push({ label: 'Vida máx.', value: health.max, bonus: health.max - base.health });
    if (base.damage > 0 || health.damage > 0) lines.push({ label: 'Daño', value: health.damage, bonus: health.damage - base.damage });
  }
  if (roleStats) {
    const speed = round1(ANT_SPEED * roleStats.speedMultiplier);
    lines.push({ label: 'Velocidad', value: speed, bonus: round1(speed - ANT_SPEED * base.speedMultiplier) });
  }
  if (carrying) lines.push({ label: 'Carga', value: carrying.maxCapacity, bonus: carrying.maxCapacity - base.carryCapacity });
  return lines;
}
