// Race identities shown by the pre-run picker, condensed from the plan's
// faction tables (food, breeding, building, power and tactics). Player-facing
// copy is neutral Spanish; identifiers stay in English.

import type { CrystalUnitKind } from '../../engine/renderer/crystalUnits';
import type { HumanUnitKind } from '../../engine/renderer/humanUnits';
import { AntRole } from '../../game/components/components';
import { isAvailableRival, isPlayableRace, type RaceId, type RivalId } from '../../game/run/RunSetup';

/** One animated specimen on a card: an atlas ant, or a baked crystal or human unit. */
export type UnitPortrait =
  | { readonly source: 'ant'; readonly role: AntRole; readonly label: string }
  | { readonly source: 'queenAnt'; readonly label: string }
  | { readonly source: 'crystal'; readonly unit: CrystalUnitKind; readonly label: string }
  | { readonly source: 'human'; readonly unit: HumanUnitKind; readonly label: string };

export interface RaceTrait {
  readonly label: string;
  readonly text: string;
}

/** A 1-3 pip rating, relative across the three races. */
export interface RaceStat {
  readonly label: string;
  readonly level: 1 | 2 | 3;
}

export interface RaceCardInfo {
  readonly id: RaceId;
  readonly name: string;
  readonly tagline: string;
  readonly available: boolean;
  readonly traits: readonly RaceTrait[];
  readonly stats: readonly RaceStat[];
  readonly units: readonly UnitPortrait[];
}

export const RACE_CARDS: readonly RaceCardInfo[] = [
  {
    id: 'swarm',
    name: 'Enjambre',
    tagline: 'Hormigas mutadas por el meteorito',
    available: isPlayableRace('swarm'),
    traits: [
      { label: 'Come', text: 'Biomasa: hojas, hongos y carne, incluso la del enemigo.' },
      { label: 'Cría', text: 'La reina pone un huevo a la vez y la larva muta a su casta.' },
      { label: 'Construye', text: 'Excava su nido y extiende estructuras vivas sobre el micelio.' },
      { label: 'Fuerza', text: 'Unidades baratas y rápidas, débiles por separado.' },
      { label: 'Tácticas', text: 'Oleadas, flanqueos y emboscadas desde los túneles.' },
    ],
    stats: [
      { label: 'Costo', level: 1 },
      { label: 'Poder', level: 1 },
      { label: 'Número', level: 3 },
      { label: 'Velocidad', level: 3 },
    ],
    units: [
      { source: 'ant', role: AntRole.Worker, label: 'Obrera' },
      { source: 'queenAnt', label: 'Reina' },
      { source: 'ant', role: AntRole.Soldier, label: 'Soldado' },
    ],
  },
  {
    id: 'crystal',
    name: 'Colmena de Cristal',
    tagline: 'Seres de cristal que flotan',
    available: isPlayableRace('crystal'),
    traits: [
      { label: 'Come', text: 'Nada orgánico: minerales y energía del meteorito.' },
      { label: 'Cría', text: 'Sin huevos: sus unidades se cristalizan con energía mineral.' },
      { label: 'Construye', text: 'Torres que crecen hacia arriba, un piso por tipo de unidad.' },
      { label: 'Fuerza', text: 'Pocas, lentas y caras, pero muy fuertes. Su escudo se regenera.' },
      { label: 'Tácticas', text: 'Se atrinchera tras sus escudos y luego avanza sin pausa.' },
    ],
    stats: [
      { label: 'Costo', level: 3 },
      { label: 'Poder', level: 3 },
      { label: 'Número', level: 1 },
      { label: 'Velocidad', level: 1 },
    ],
    units: [
      { source: 'crystal', unit: 'drone', label: 'Dron' },
      { source: 'crystal', unit: 'queen', label: 'Reina de Cristal' },
      { source: 'crystal', unit: 'sentinel', label: 'Centinela' },
    ],
  },
  {
    id: 'human',
    name: 'Humanos',
    tagline: 'Colonos armados con acero',
    available: isPlayableRace('human'),
    traits: [
      { label: 'Come', text: 'Raciones de sus cultivos, más chatarra y metal.' },
      { label: 'Cría', text: 'Entrena tropas en cada piso: cuartel, soldados; taller, máquinas.' },
      { label: 'Construye', text: 'Edificios de varios pisos, levantados en cualquier lugar.' },
      { label: 'Fuerza', text: 'Costo medio, blindaje y armas de fuego a distancia.' },
      { label: 'Tácticas', text: 'Búnkeres y muros, disparos a distancia y asedios.' },
    ],
    stats: [
      { label: 'Costo', level: 2 },
      { label: 'Poder', level: 2 },
      { label: 'Número', level: 2 },
      { label: 'Velocidad', level: 2 },
    ],
    units: [
      { source: 'human', unit: 'soldier', label: 'Soldado' },
      { source: 'human', unit: 'tank', label: 'Tanque' },
      { source: 'human', unit: 'marksman', label: 'Tirador' },
    ],
  },
];

export interface RivalInfo {
  readonly id: RivalId;
  readonly name: string;
  readonly note: string;
  readonly available: boolean;
  readonly portrait: 'beetle' | UnitPortrait;
}

export const RIVAL_OPTIONS: readonly RivalInfo[] = [
  {
    id: 'wildlife',
    name: 'Fauna salvaje',
    note: 'Escarabajos y saltadores',
    available: isAvailableRival('wildlife'),
    portrait: 'beetle',
  },
  {
    id: 'crystal',
    name: 'Colmena de Cristal',
    note: 'Próximamente',
    available: isAvailableRival('crystal'),
    portrait: { source: 'crystal', unit: 'drone', label: 'Dron' },
  },
  {
    id: 'human',
    name: 'Humanos',
    note: 'Próximamente',
    available: isAvailableRival('human'),
    portrait: { source: 'human', unit: 'soldier', label: 'Soldado' },
  },
];

export function raceName(id: RaceId): string {
  return RACE_CARDS.find((r) => r.id === id)?.name ?? id;
}

export function rivalName(id: RivalId): string {
  return RIVAL_OPTIONS.find((r) => r.id === id)?.name ?? id;
}
