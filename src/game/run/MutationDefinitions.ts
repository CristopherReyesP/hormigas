export const MUTATION_IDS = ['acid_mandibles', 'hyper_metabolism', 'cargo_sacs', 'burrowing_claws', 'regenerative_tissue', 'iron_stomach', 'spore_bloom', 'titan_backs'] as const;
export type MutationId = typeof MUTATION_IDS[number];

type MutationEffect =
  | { stat: 'soldierDamageMult' | 'movementSpeedMult' | 'digSpeedMult' | 'healRateMult' | 'hungerDecayMult' | 'foodSpawnMult'; operation: 'multiply'; value: number }
  | { stat: 'workerCarryBonus' | 'porterCapacityBonus'; operation: 'add'; value: number };

export interface MutationDefinition {
  readonly id: MutationId;
  readonly name: string;
  readonly description: string;
  readonly effect: MutationEffect;
}

export const MUTATION_DEFINITIONS: Readonly<Record<MutationId, MutationDefinition>> = {
  acid_mandibles: {
    id: 'acid_mandibles', name: 'Mandíbulas ácidas',
    description: 'Las fauces de los soldados supuran ácido que disuelve la carne enemiga.',
    effect: { stat: 'soldierDamageMult', operation: 'multiply', value: 1.25 },
  },
  hyper_metabolism: {
    id: 'hyper_metabolism', name: 'Hipermetabolismo',
    description: 'Un segundo corazón palpita bajo el caparazón y acelera al enjambre.',
    effect: { stat: 'movementSpeedMult', operation: 'multiply', value: 1.15 },
  },
  cargo_sacs: {
    id: 'cargo_sacs', name: 'Sacos de carga',
    description: 'Los abdómenes de las obreras se hinchan con bolsas de carne elástica.',
    effect: { stat: 'workerCarryBonus', operation: 'add', value: 1 },
  },
  burrowing_claws: {
    id: 'burrowing_claws', name: 'Garras excavadoras',
    description: 'Espolones de hueso brotan de las patas y desgarran la tierra.',
    effect: { stat: 'digSpeedMult', operation: 'multiply', value: 1.35 },
  },
  regenerative_tissue: {
    id: 'regenerative_tissue', name: 'Tejido regenerativo',
    description: 'Fibras vivas reptan por las heridas y cosen la carne desde dentro.',
    effect: { stat: 'healRateMult', operation: 'multiply', value: 1.4 },
  },
  iron_stomach: {
    id: 'iron_stomach', name: 'Estómago de hierro',
    description: 'Vísceras blindadas exprimen cada bocado hasta acallar el hambre.',
    effect: { stat: 'hungerDecayMult', operation: 'multiply', value: 0.75 },
  },
  spore_bloom: {
    id: 'spore_bloom', name: 'Floración de esporas',
    description: 'Pústulas del nido exhalan esporas que hacen brotar alimento en la superficie.',
    effect: { stat: 'foodSpawnMult', operation: 'multiply', value: 1.3 },
  },
  titan_backs: {
    id: 'titan_backs', name: 'Lomos titánicos',
    description: 'Vértebras abultadas sostienen cargas monstruosas sobre las porteadoras.',
    effect: { stat: 'porterCapacityBonus', operation: 'add', value: 1 },
  },
};

/** Sample without replacement; rng follows Math.random's [0, 1) contract. */
export function offerMutations(rng: () => number, count = 3): MutationId[] {
  const pool = [...MUTATION_IDS];
  const offers: MutationId[] = [];
  const size = Math.min(pool.length, Math.max(0, Math.floor(count)));
  while (offers.length < size) {
    const index = Math.floor(rng() * pool.length);
    offers.push(pool.splice(index, 1)[0]);
  }
  return offers;
}
