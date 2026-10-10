/**
 * The Swarm's permanent upgrades (Mejoras): one data table with every line,
 * its group in the Mejoras panel and the price of each level.
 *
 * Prices are paid with what a colony actually has: food from the underground
 * pantry plus minerals from the bank (P7.1); a few lines also ask for farm
 * mushrooms. Each row of `costs` is the price of the NEXT level, so a line has
 * as many levels as rows, and the rows escalate.
 *
 * What a level does lives in upgradeEffects.ts; this file only says what it costs.
 */

export const UPGRADE_GROUPS = ['queen', 'brood', 'castes', 'colony'] as const;
export type UpgradeGroup = (typeof UPGRADE_GROUPS)[number];

export const UPGRADE_GROUP_LABEL: Record<UpgradeGroup, string> = {
  queen: 'Reina',
  brood: 'Incubación',
  castes: 'Castas',
  colony: 'Colonia',
};

export const UPGRADE_IDS = [
  // Reina
  'queenLay', 'queenQueue', 'queenHp', 'queenRegen',
  // Incubación
  'incubation', 'nutrition',
  // Castas (stats)
  'carry', 'damage', 'carapace', 'workerHp', 'defenderDamage', 'legs',
  // Colonia (the original queen upgrades)
  'storage', 'dig', 'porters', 'heal',
] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];

/** The price of one level. Food comes from the pantry, minerals from the bank, mushrooms from the farm piles. */
export interface UpgradeCost {
  food: number;
  minerals: number;
  mushrooms: number;
}

export interface UpgradeDef {
  id: UpgradeId;
  group: UpgradeGroup;
  name: string;
  /** One line: what the upgrade is about */
  blurb: string;
  /** costs[level] buys level + 1; its length is the max level */
  costs: readonly UpgradeCost[];
}

const c = (food: number, minerals: number, mushrooms = 0): UpgradeCost => ({ food, minerals, mushrooms });

/** Every line, in panel order. THE place to tune prices. */
export const UPGRADE_TABLE: readonly UpgradeDef[] = [
  // ── Reina ──
  { id: 'queenLay', group: 'queen', name: 'Puesta veloz', blurb: 'La reina pone cada huevo más rápido.',
    costs: [c(40, 0), c(80, 15), c(130, 30), c(200, 50)] },
  { id: 'queenQueue', group: 'queen', name: 'Cola de huevos', blurb: 'Más huevos encargados por casta.',
    costs: [c(40, 0), c(70, 10), c(110, 25)] },
  { id: 'queenHp', group: 'queen', name: 'Coraza real', blurb: 'Más vida y armadura para la reina.',
    costs: [c(50, 10), c(80, 20), c(120, 35), c(180, 55)] },
  { id: 'queenRegen', group: 'queen', name: 'Regeneración real', blurb: 'La reina recupera vida sola.',
    costs: [c(60, 15, 10), c(100, 30, 20), c(150, 50, 35)] },
  // ── Incubación ──
  { id: 'incubation', group: 'brood', name: 'Cámara de incubación', blurb: 'Las larvas crecen más rápido y caben más huevos por casilla.',
    costs: [c(40, 0), c(80, 15), c(130, 30), c(200, 50)] },
  { id: 'nutrition', group: 'brood', name: 'Nutrición de larvas', blurb: 'Huevos más baratos y larvas que comen menos.',
    costs: [c(40, 5), c(70, 15), c(110, 30)] },
  // ── Castas ──
  { id: 'carry', group: 'castes', name: 'Obreras fuertes', blurb: 'Las obreras cargan más comida.',
    costs: [c(40, 0), c(70, 10), c(110, 25)] },
  { id: 'damage', group: 'castes', name: 'Soldados feroces', blurb: 'Los soldados pegan más fuerte.',
    costs: [c(50, 10), c(80, 20), c(120, 35)] },
  { id: 'carapace', group: 'castes', name: 'Caparazón', blurb: 'Soldados y defensoras con más vida.',
    costs: [c(50, 10), c(80, 20), c(120, 35)] },
  { id: 'workerHp', group: 'castes', name: 'Exoesqueleto', blurb: 'Obreras, exploradoras y nodrizas con más vida.',
    costs: [c(40, 5), c(65, 15), c(100, 30)] },
  { id: 'defenderDamage', group: 'castes', name: 'Guardia letal', blurb: 'Las defensoras pegan más fuerte.',
    costs: [c(50, 10), c(80, 20), c(120, 35)] },
  { id: 'legs', group: 'castes', name: 'Patas ágiles', blurb: 'Todas las castas caminan más rápido.',
    costs: [c(45, 10), c(75, 20), c(115, 35)] },
  // ── Colonia ──
  { id: 'storage', group: 'colony', name: 'Despensa amplia', blurb: 'Cada casilla de despensa guarda más comida.',
    costs: [c(35, 0), c(60, 10), c(95, 20)] },
  { id: 'dig', group: 'colony', name: 'Excavación rápida', blurb: 'Las obreras cavan más rápido.',
    costs: [c(35, 0), c(60, 10), c(95, 20)] },
  { id: 'porters', group: 'colony', name: 'Más porteadoras', blurb: 'Más obreras bajan la comida de la entrada a la vez.',
    costs: [c(30, 5), c(55, 10), c(85, 20)] },
  { id: 'heal', group: 'colony', name: 'Curación veloz', blurb: 'Las heridas sanan más rápido en el nido.',
    costs: [c(30, 0, 10), c(50, 10, 20), c(80, 20, 35)] },
];

const BY_ID = new Map(UPGRADE_TABLE.map((def) => [def.id, def]));

export function upgradeDef(id: UpgradeId): UpgradeDef {
  return BY_ID.get(id)!;
}

export function maxLevel(id: UpgradeId): number {
  return upgradeDef(id).costs.length;
}

/** The price of the level after `level`; null once the line is maxed. */
export function costAt(id: UpgradeId, level: number): UpgradeCost | null {
  return upgradeDef(id).costs[level] ?? null;
}

export function isUpgradeId(value: string): value is UpgradeId {
  return BY_ID.has(value as UpgradeId);
}
