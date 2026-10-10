// The info-panel card of a selected Human unit or building: name, blurb,
// state and combat facts, in neutral Spanish. Pure reads of the World.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import { COMPONENT, type HealthComponent } from '../components/components';
import { armorOf } from '../systems/helpers/combatHelpers';
import {
  HUMAN_BUILDING_STATS,
  HUMAN_UNIT_STATS,
  type HumanBuildingKind,
  type HumanTroop,
  type HumanUnitType,
} from './humanBase';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent, type HumanUnitState } from './humanComponents';
import { FactionId, ownerOf } from '../factions/factions';

export interface HumanSelection {
  kind: HumanUnitType | HumanBuildingKind;
  building: boolean;
  /** The sprite the portrait shows (buildings show their own art) */
  portrait: HumanTroop | null;
  name: string;
  faction: string;
  /** The player's own (a Human player's base): no enemy styling, no attack wave */
  own: boolean;
  blurb: string;
  health: { current: number; max: number };
  armor: number;
  /** One line each: state, weapon, floors, training */
  facts: string[];
}

export const HUMAN_UNIT_NAME: Readonly<Record<HumanUnitType, string>> = {
  soldier: 'Soldado',
  marksman: 'Tirador',
  tank: 'Tanque',
  builder: 'Constructor',
};

export const HUMAN_BUILDING_NAME: Readonly<Record<HumanBuildingKind, string>> = {
  command_center: 'Centro de Mando',
  barracks: 'Cuartel',
  bunker: 'Búnker',
  supply_depot: 'Depósito de suministros',
  factory: 'Fábrica',
};

const UNIT_BLURB: Readonly<Record<HumanUnitType, string>> = {
  soldier: 'Infantería con fusil. Dispara desde lejos y su blindaje le quita 1 de daño a cada golpe.',
  marksman: 'Francotirador de largo alcance. Pega fuerte, pero cae rápido si lo alcanzas.',
  tank: 'Blindado pesado y lento. Sus obuses también dañan a lo que esté junto al blanco.',
  builder: 'Levanta los edificios de la base, uno tras otro. Si cae, la base deja de crecer un rato.',
};

const BUILDING_BLURB: Readonly<Record<HumanBuildingKind, string>> = {
  command_center: 'El corazón de la base humana. Destrúyelo para ganar la partida.',
  barracks: 'Entrena soldados, tiradores desde la noche 2 y tanques desde la noche 5. Cada cuartel entrena en paralelo.',
  bunker: 'Defensa fija: dispara a tus unidades en cuanto entran en su alcance.',
  supply_depot: 'Amplía el suministro de la base y le da raciones de sus cultivos.',
  factory: 'Taller de blindados: fabrica tanques, lentos y pesados, con obuses de daño en área.',
};

/** A Human player's own units, in their words */
const OWN_UNIT_BLURB: Readonly<Record<HumanUnitType, string>> = {
  soldier: 'Infantería con fusil. Dispara desde lejos; su blindaje le quita 1 de daño a cada golpe.',
  marksman: 'Francotirador de largo alcance. Pega fuerte, pero tiene poca vida: protégelo.',
  tank: 'Blindado pesado y lento. Sus obuses también dañan a lo que esté junto al blanco.',
  builder: 'Extrae minerales (clic derecho en un yacimiento) y levanta edificios con Construir.',
};

const OWN_BUILDING_BLURB: Readonly<Record<HumanBuildingKind, string>> = {
  command_center: 'El corazón de la expedición: si cae, pierdes. Entrena constructores y recibe los minerales.',
  barracks: 'Entrena soldados y tiradores. Varios cuarteles entrenan en paralelo.',
  bunker: 'Defensa fija: dispara sola a los enemigos que entran en su alcance.',
  supply_depot: 'Sube el suministro en 8 y suma raciones de sus cultivos.',
  factory: 'Fabrica tanques, lentos y pesados, con obuses de daño en área.',
};

const STATE_LABEL: Readonly<Record<HumanUnitState, string>> = {
  guarding: 'De guardia en la base',
  assaulting: 'Asaltando tu nido',
  raiding: 'Cazando obreras y exploradoras',
  returning: 'Volviendo a la base',
  building: 'Construyendo',
};

/** Seconds with a comma decimal, the Spanish way: 0,8 s */
function seconds(value: number): string {
  return `${String(Math.round(value * 10) / 10).replace('.', ',')} s`;
}

function weapon(damage: number, cooldown: number, range: number): string {
  return `Daño ${damage} cada ${seconds(cooldown)} · alcance ${String(range).replace('.', ',')}`;
}

/** The card of a Human unit or building, or null for anything else. */
export function humanSelection(world: World, id: EntityId): HumanSelection | null {
  const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
  const hp = { current: Math.max(0, health?.current ?? 0), max: health?.max ?? 1 };
  const armor = armorOf(world, id);

  const own = ownerOf(world, id) === FactionId.PLAYER;
  const unit = world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT);
  if (unit) {
    const stats = HUMAN_UNIT_STATS[unit.type];
    const facts = own ? [] : [`Estado: ${STATE_LABEL[unit.state]}`];
    if (stats.damage > 0) facts.push(weapon(stats.damage, stats.attackCooldown, stats.attackRange));
    if (stats.splashRadius > 0) facts.push('Daño en área alrededor del blanco');
    facts.push(`Blindaje ${armor}`);
    return {
      kind: unit.type,
      building: false,
      portrait: unit.type === 'builder' ? 'soldier' : unit.type,
      name: HUMAN_UNIT_NAME[unit.type],
      faction: own ? 'Tu expedición' : 'Humanos · rival',
      own,
      blurb: own ? OWN_UNIT_BLURB[unit.type] : UNIT_BLURB[unit.type],
      health: hp,
      armor,
      facts,
    };
  }

  const building = world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING);
  if (building) {
    const stats = HUMAN_BUILDING_STATS[building.kind];
    const facts: string[] = [];
    if (building.constructing > 0) {
      const done = Math.round(100 * (1 - building.constructing / Math.max(1, stats.buildTime)));
      facts.push(`En construcción: ${done}%`);
    }
    facts.push(`${stats.floors} ${stats.floors === 1 ? 'piso' : 'pisos'} · blindaje ${armor}`);
    if (stats.damage > 0) facts.push(weapon(stats.damage, stats.attackCooldown, stats.attackRange));
    if (building.training) facts.push(`Entrenando: ${HUMAN_UNIT_NAME[building.training]}`);
    return {
      kind: building.kind,
      building: true,
      portrait: null,
      name: HUMAN_BUILDING_NAME[building.kind],
      faction: own
        ? building.kind === 'command_center' ? 'Tu expedición · base principal' : 'Tu expedición · edificio'
        : building.kind === 'command_center' ? 'Humanos · base principal' : 'Humanos · edificio',
      own,
      blurb: own ? OWN_BUILDING_BLURB[building.kind] : BUILDING_BLURB[building.kind],
      health: hp,
      armor,
      facts,
    };
  }
  return null;
}
