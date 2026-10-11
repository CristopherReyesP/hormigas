import type { UpgradeInfo } from '../../game/upgrades/upgradeView';
import type { UpgradeCost, UpgradeGroup, UpgradeId } from '../../game/upgrades/upgradeTable';
import type { IconName } from '../console/pixelIcons';

/** The panel's tabs: the four upgrade groups, then Mutaciones and Estadísticas */
export type UpgradeTab = UpgradeGroup | 'mutations' | 'stats';

/** Tabs that hold no upgrade lines to buy */
export function isInfoTab(tab: UpgradeTab): tab is 'mutations' | 'stats' {
  return tab === 'mutations' || tab === 'stats';
}

export const UPGRADE_TABS: ReadonlyArray<{ tab: UpgradeTab; label: string; icon: IconName }> = [
  { tab: 'queen', label: 'Reina', icon: 'crown' },
  { tab: 'brood', label: 'Incubación', icon: 'egg' },
  { tab: 'castes', label: 'Castas', icon: 'sword' },
  { tab: 'colony', label: 'Colonia', icon: 'pantry' },
  { tab: 'mutations', label: 'Mutaciones', icon: 'vein' },
  { tab: 'stats', label: 'Estadísticas', icon: 'flag' },
];

export const UPGRADE_ICON: Record<UpgradeId, IconName> = {
  queenLay: 'egg',
  queenQueue: 'hourglass',
  queenHp: 'shield',
  queenRegen: 'heart',
  incubation: 'egg',
  nutrition: 'bowl',
  carry: 'leaf',
  damage: 'sword',
  carapace: 'shield',
  workerHp: 'worker',
  defenderDamage: 'spine',
  legs: 'move',
  storage: 'crate',
  dig: 'pick',
  porters: 'ant',
  heal: 'heart',
};

/** The Mejoras button: glows with a count whenever a line can be bought now */
export function upgradeBadge(affordable: number): { glow: boolean; text: string | null } {
  return affordable > 0 ? { glow: true, text: String(affordable) } : { glow: false, text: null };
}

/** Lines of a tab that can be bought now (the number on its tab) */
export function affordableIn(upgrades: readonly UpgradeInfo[], tab: UpgradeTab): number {
  if (isInfoTab(tab)) return 0;
  return upgrades.filter((u) => u.group === tab && u.affordable).length;
}

/** "Faltan 20 de comida y 15 minerales", or null when nothing is missing */
export function missingText(missing: UpgradeCost): string | null {
  const parts = [
    missing.food > 0 ? `${missing.food} de comida` : null,
    missing.minerals > 0 ? `${missing.minerals} minerales` : null,
    missing.mushrooms > 0 ? `${missing.mushrooms} hongos` : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
  return `Faltan ${list}`;
}

/** "Puesta: 3.0 s → 2.6 s" (or just the value at max level) */
export function effectText(line: { label: string; now: string; next: string | null }): string {
  return line.next === null ? `${line.label}: ${line.now}` : `${line.label}: ${line.now} → ${line.next}`;
}
