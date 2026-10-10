import type { AntMarkId } from '../../engine/renderer/sprites/antMarks';

export const MUTATION_IDS = [
  'acid_mandibles', 'hyper_metabolism', 'cargo_sacs', 'bone_spurs', 'regenerative_tissue',
  'carrion_gut', 'spore_bloom', 'titan_brood', 'wing_stubs', 'hive_mind',
] as const;
export type MutationId = typeof MUTATION_IDS[number];

export type MutationTag = 'Assault' | 'Tempo' | 'Economy' | 'Defense' | 'Sustain' | 'Combat' | 'Info' | 'Capstone';

/** Run stats that compose by multiplication (neutral 1). */
export const MULTIPLIER_STATS = [
  'soldierDamageMult', 'soldierSpeedMult', 'soldierMaxHealthMult', 'movementSpeedMult', 'carryingSpeedMult',
  'workerCarryMult', 'hungerDecayMult', 'maxHungerMult', 'digSpeedMult', 'undergroundDamageMult',
  'meatDropMult', 'foodSpawnMult', 'scoutVisionMult', 'flankingBonusMult',
] as const;
/** Run stats that compose by addition (neutral 0). */
export const ADDITIVE_STATS = ['regenHpPerSecond', 'extraInvadersPerWave', 'soldierCostBonus'] as const;
export type MultiplierStat = typeof MULTIPLIER_STATS[number];
export type AdditiveStat = typeof ADDITIVE_STATS[number];
export type RunStat = MultiplierStat | AdditiveStat;

/** `kind` lets the UI draw upsides (green) and costs (red) separately. */
export type MutationEffect = { kind: 'upside' | 'cost'; value: number } & (
  | { stat: MultiplierStat; operation: 'multiply' }
  | { stat: AdditiveStat; operation: 'add' }
);

export interface MutationDefinition {
  readonly id: MutationId;
  readonly name: string;
  readonly description: string;
  readonly upsideText: string;
  readonly costText: string | null;
  readonly effects: readonly MutationEffect[];
  readonly tags: readonly MutationTag[];
  /** The mark the mutation leaves on the ant sprites (drawn by the atlas). */
  readonly mark: AntMarkId;
  readonly maxStacks: number;
}

const up = (stat: MultiplierStat, value: number): MutationEffect => ({ kind: 'upside', stat, operation: 'multiply', value });
const cost = (stat: MultiplierStat, value: number): MutationEffect => ({ kind: 'cost', stat, operation: 'multiply', value });
const upAdd = (stat: AdditiveStat, value: number): MutationEffect => ({ kind: 'upside', stat, operation: 'add', value });
const costAdd = (stat: AdditiveStat, value: number): MutationEffect => ({ kind: 'cost', stat, operation: 'add', value });

export const MUTATION_DEFINITIONS: Readonly<Record<MutationId, MutationDefinition>> = {
  acid_mandibles: {
    id: 'acid_mandibles', name: 'Mandíbulas ácidas',
    description: 'Las fauces de los soldados supuran un ácido que disuelve la quitina.',
    upsideText: '+40% de daño de los soldados', costText: '−10% de velocidad de los soldados',
    effects: [up('soldierDamageMult', 1.4), cost('soldierSpeedMult', 0.9)],
    tags: ['Assault'], mark: 'chartreuse_jaws', maxStacks: 3,
  },
  hyper_metabolism: {
    id: 'hyper_metabolism', name: 'Hipermetabolismo',
    description: 'Un segundo corazón late bajo el caparazón y empuja al enjambre.',
    upsideText: '+20% de velocidad de movimiento', costText: '+25% de consumo de hambre',
    effects: [up('movementSpeedMult', 1.2), cost('hungerDecayMult', 1.25)],
    tags: ['Tempo'], mark: 'pulsing_vein', maxStacks: 3,
  },
  cargo_sacs: {
    id: 'cargo_sacs', name: 'Sacos de carga',
    description: 'El gáster de las obreras se hincha en bolsas pálidas y elásticas.',
    upsideText: '+50% de carga de las obreras', costText: '−10% de velocidad al cargar',
    effects: [up('workerCarryMult', 1.5), cost('carryingSpeedMult', 0.9)],
    tags: ['Economy'], mark: 'swollen_pale_gaster', maxStacks: 3,
  },
  bone_spurs: {
    id: 'bone_spurs', name: 'Espolones óseos',
    description: 'Púas de hueso brotan de las patas y desgarran tierra y carne.',
    upsideText: '+30% de velocidad de excavación y +50% de daño bajo tierra', costText: null,
    effects: [up('digSpeedMult', 1.3), up('undergroundDamageMult', 1.5)],
    tags: ['Defense'], mark: 'leg_spurs', maxStacks: 3,
  },
  regenerative_tissue: {
    id: 'regenerative_tissue', name: 'Tejido regenerativo',
    description: 'Fibras rosadas reptan por las heridas y las cosen desde dentro.',
    upsideText: 'Cada hormiga sana 1 PV/s en cualquier lugar', costText: '−15% de hambre máxima',
    effects: [upAdd('regenHpPerSecond', 1), cost('maxHungerMult', 0.85)],
    tags: ['Sustain'], mark: 'pink_stitches', maxStacks: 3,
  },
  carrion_gut: {
    id: 'carrion_gut', name: 'Tripa carroñera',
    description: 'Anillos oscuros en el gáster digieren hasta el último despojo.',
    upsideText: '−30% de consumo de hambre y +50% de carne por presa', costText: null,
    effects: [up('hungerDecayMult', 0.7), up('meatDropMult', 1.5)],
    tags: ['Combat', 'Economy'], mark: 'dark_gaster_rings', maxStacks: 3,
  },
  spore_bloom: {
    id: 'spore_bloom', name: 'Floración de esporas',
    description: 'Pústulas en el tórax exhalan esporas que hacen brotar alimento.',
    upsideText: '+30% de reaparición de comida', costText: '+1 invasor por oleada',
    effects: [up('foodSpawnMult', 1.3), costAdd('extraInvadersPerWave', 1)],
    tags: ['Economy'], mark: 'thorax_pustules', maxStacks: 3,
  },
  titan_brood: {
    id: 'titan_brood', name: 'Cría titánica',
    description: 'Una placa gruesa y nudosa acoraza la cabeza de los soldados.',
    upsideText: '+50% de vida máxima de los soldados', costText: '−25% de velocidad de los soldados y +10 de costo por soldado',
    effects: [up('soldierMaxHealthMult', 1.5), cost('soldierSpeedMult', 0.75), costAdd('soldierCostBonus', 10)],
    tags: ['Defense'], mark: 'thick_head_plate', maxStacks: 3,
  },
  wing_stubs: {
    id: 'wing_stubs', name: 'Muñones alados',
    description: 'Alas atrofiadas vibran sobre las exploradoras y afinan su mirada.',
    upsideText: '+50% de visión de las exploradoras', costText: null,
    effects: [up('scoutVisionMult', 1.5)],
    tags: ['Info'], mark: 'wing_stubs', maxStacks: 3,
  },
  hive_mind: {
    id: 'hive_mind', name: 'Mente colmena',
    description: 'Las puntas de las antenas brillan y el enjambre piensa como uno solo.',
    upsideText: 'Bonificación de flanqueo ×2', costText: null,
    effects: [up('flankingBonusMult', 2)],
    tags: ['Capstone'], mark: 'glowing_antenna_tips', maxStacks: 3,
  },
};
