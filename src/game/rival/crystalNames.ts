// Player-facing names of the Crystal Hive's units and spires, in neutral Spanish.

import type { CrystalStructureKind, CrystalUnitKind } from '../components/components';

/** Player-facing names of the spires, in neutral Spanish */
export const SPIRE_NAME: Readonly<Record<CrystalStructureKind, string>> = {
  forge: 'Aguja de drones',
  prism: 'Aguja de centinelas',
  extractor: 'Extractor de cristal',
};

/** Player-facing names of the Crystal units, in neutral Spanish */
export const CRYSTAL_UNIT_NAME: Readonly<Record<CrystalUnitKind, string>> = {
  drone: 'Dron de cristal',
  sentinel: 'Centinela',
  queen: 'Reina de Cristal',
};

/** One line on what each Crystal unit does, for the info panel */
export const CRYSTAL_UNIT_BLURB: Readonly<Record<CrystalUnitKind, string>> = {
  drone: 'Golpea cuerpo a cuerpo. Lento y fuerte, con escudo que se recarga.',
  sentinel: 'Dispara rayos de energía a distancia. Más lento que el dron.',
  queen: 'Jefa de la colmena: su aura recarga los escudos de su escolta y su pulso daña a quien se acerca.',
};

/** One line on what each spire does, for the info panel */
export const SPIRE_BLURB: Readonly<Record<CrystalStructureKind, string>> = {
  forge: 'Cristaliza drones con minerales. Cada piso la hace más rápida.',
  prism: 'Cristaliza centinelas con minerales. Cada piso la hace más rápida.',
  extractor: 'Drena los minerales cercanos para la colmena. Derríbalo para frenar su economía.',
};
